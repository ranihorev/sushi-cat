#!/usr/bin/env node
/**
 * Measures the shape of each prompt clip. No API key needed.
 *
 * The failure that matters most in phonics TTS is a trailing schwa — /p/ coming
 * out as "puh". That is audible in the energy envelope: a clean stop is a short
 * burst, a schwa adds 150ms+ of sustained voiced energy after it. This decodes
 * each clip and reports how long each sound event lasts, so the suspicious ones
 * can be listened to first instead of auditioning all 26 blind.
 *
 *   node scripts/measure-audio.mjs
 */

import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROMPTS = join(ROOT, 'public', 'audio', 'prompt');

/** A stop consonant should be a burst. Anything longer is probably "puh". */
const STOPS = new Set(['B', 'C', 'D', 'G', 'J', 'K', 'P', 'T']);
/** Continuants are meant to be held. */
const CONTINUANTS = new Set(['F', 'L', 'M', 'N', 'R', 'S', 'V', 'Z']);

const work = await mkdtemp(join(tmpdir(), 'sushi-measure-'));

/** Decode an mp3 to mono 16-bit PCM and return the samples. */
async function samples(mp3) {
  const wav = join(work, 'out.wav');
  await rm(wav, { force: true });
  await run('afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', mp3, wav]);
  const buf = await readFile(wav);

  // walk the RIFF chunks to find `data` rather than assuming a 44-byte header
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === 'data') {
      const end = Math.min(buf.length, off + 8 + size);
      const out = new Float32Array((end - off - 8) >> 1);
      for (let i = 0; i < out.length; i++) out[i] = buf.readInt16LE(off + 8 + i * 2) / 32768;
      return out;
    }
    off += 8 + size + (size % 2);
  }
  throw new Error('no data chunk');
}

const RATE = 16000;
const WIN = 160; // 10ms frames

/** Loudness of the sound itself, ignoring the gap between repetitions. */
function eventLoudness(pcm, ev) {
  if (!ev.length) return 0;
  let sum = 0;
  let n = 0;
  for (const [start, dur] of ev) {
    const a = Math.round(start * RATE);
    const b = Math.min(pcm.length, Math.round((start + dur) * RATE));
    for (let i = a; i < b; i++, n++) sum += pcm[i] * pcm[i];
  }
  return n ? Math.sqrt(sum / n) : 0;
}

/** Contiguous runs of energy above a noise floor, in seconds. */
function events(pcm) {
  const frames = [];
  for (let i = 0; i + WIN <= pcm.length; i += WIN) {
    let sum = 0;
    for (let j = 0; j < WIN; j++) sum += pcm[i + j] * pcm[i + j];
    frames.push(Math.sqrt(sum / WIN));
  }
  const peak = Math.max(...frames);
  if (peak === 0) return { events: [], peak: 0 };

  const floor = peak * 0.08;
  const out = [];
  let start = -1;
  for (let i = 0; i < frames.length; i++) {
    if (frames[i] > floor && start < 0) start = i;
    else if (frames[i] <= floor && start >= 0) {
      // ignore sub-30ms blips, they are decoder noise not speech
      if ((i - start) * 0.01 >= 0.03) out.push([start * 0.01, (i - start) * 0.01]);
      start = -1;
    }
  }
  if (start >= 0) out.push([start * 0.01, (frames.length - start) * 0.01]);
  return { events: out, peak };
}

const files = (await readdir(PROMPTS)).filter((f) => f.endsWith('.mp3')).sort();
const flagged = [];

console.log('Sound events per prompt clip. Two events = the phoneme said twice.\n');
console.log('     events  longest   level  note');
console.log('-'.repeat(72));

for (const f of files) {
  const L = f.replace('.mp3', '');
  const pcm = await samples(join(PROMPTS, f));
  const { events: ev } = events(pcm);
  const longest = ev.length ? Math.max(...ev.map((e) => e[1])) : 0;
  // loudness of the sound, not of the loudest 10ms — an aspirated /k/ spreads
  // its energy out and looks quiet by peak while sounding perfectly level
  const loud = eventLoudness(pcm, ev);

  let note = '';
  if (!ev.length) note = 'SILENT — regenerate';
  else if (loud < 0.04) note = 'very quiet';
  else if (STOPS.has(L) && longest > 0.22) note = `long for a stop — may be saying "${L.toLowerCase()}uh"`;
  else if (CONTINUANTS.has(L) && longest < 0.12) note = 'short for a held sound';
  else if (ev.length > 3) note = 'more events than expected';

  if (note) flagged.push(L);
  console.log(
    `  ${L}    ${String(ev.length).padStart(2)}     ${longest.toFixed(2)}s   ` +
      `${loud.toFixed(2)}   ${note}`,
  );
}

await rm(work, { recursive: true, force: true });

console.log();
if (flagged.length) {
  console.log(`Listen to these first: ${flagged.join(', ')}`);
  console.log('  /audio-check.html');
} else {
  console.log('Every clip has the expected shape. Still worth a listen at /audio-check.html.');
}
