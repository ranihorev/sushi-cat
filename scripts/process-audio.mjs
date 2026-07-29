#!/usr/bin/env node
/**
 * Cleans up the generated clips. Run after `npm run audio`. Needs ffmpeg.
 *
 * Two things TTS gets wrong for phonics, both fixed here rather than by
 * fighting the prompt:
 *
 *   1. Trailing schwa. Asked for /p/, the model releases into a vowel and says
 *      "puh". That is the single worst thing for later blending — "cuh-a-tuh"
 *      instead of "cat". So for stop consonants we keep only the burst and cut
 *      the vowel off, with a short fade so the cut isn't a click.
 *   2. Wildly inconsistent loudness — measured 10x between the quietest and
 *      loudest clip. Everything is peak-normalised to the same level.
 *
 * Prompts are also rebuilt to a fixed shape: sound, gap, sound. That way the
 * pacing of the prompt is set here and not by whatever the model felt like.
 *
 *   node scripts/process-audio.mjs            # all clips
 *   node scripts/process-audio.mjs --dry      # report, change nothing
 */

import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm, readdir, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AUDIO = join(ROOT, 'public', 'audio');
const DRY = process.argv.includes('--dry');

const RATE = 22050;
const TARGET_PEAK = 0.95;
const TARGET_RMS = 0.17;

/** Stops are a burst, not a syllable — hard-capped so no schwa survives. */
const STOPS = new Set(['B', 'C', 'D', 'G', 'J', 'K', 'P', 'T', 'X', 'Q']);
const STOP_MAX = 0.15;
/** Held sounds get room to breathe, but not forever. */
const CONTINUANT_MAX = 0.9;
/** Vowels sit in between. */
const VOWEL_MAX = 0.7;
const VOWELS = new Set(['A', 'E', 'I', 'O', 'U']);

const GAP = 0.42;
/** How many times the prompt clip says the sound. One is plenty. */
const PROMPT_REPEATS = 1;
const FADE_IN = 0.012;
const FADE_OUT = 0.045;
/** Spoken parts are slowed to this factor — a 4-year-old needs the letter
    name landing slowly, and TTS default pace is briskly adult. */
const SPEECH_TEMPO = 0.82;
/* Held sounds and vowels can genuinely be drawn out — they are steady state, so
   stretching them just makes them longer. Stops cannot: /t/ is a burst of air,
   and stretching a burst smears it into noise rather than slowing it down. So
   they are left alone and given more space around them instead. */
const PHONEME_TEMPO = 0.85;

const work = await mkdtemp(join(tmpdir(), 'sushi-proc-'));
const exists = (p) => access(p).then(() => true, () => false);

async function readWav(wav) {
  const buf = await readFile(wav);
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
  throw new Error(`no data chunk in ${wav}`);
}

async function decode(mp3) {
  const wav = join(work, 'in.wav');
  await rm(wav, { force: true });
  await run('ffmpeg', ['-y', '-i', mp3, '-ac', '1', '-ar', String(RATE), '-f', 'wav', wav]);
  return readWav(wav);
}

async function writeWav(pcm, path) {
  const header = Buffer.alloc(44);
  const bytes = pcm.length * 2;
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + bytes, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(bytes, 40);
  const body = Buffer.alloc(bytes);
  for (let i = 0; i < pcm.length; i++) {
    body.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(pcm[i] * 32767))), i * 2);
  }
  await writeFile(path, Buffer.concat([header, body]));
}

/** Slow speech down without shifting pitch. Range of atempo is 0.5-2.0. */
async function stretch(pcm, factor) {
  if (factor === 1) return pcm;
  const src = join(work, 'stretch-in.wav');
  const dst = join(work, 'stretch-out.wav');
  await writeWav(pcm, src);
  await rm(dst, { force: true });
  await run('ffmpeg', ['-y', '-i', src, '-filter:a', `atempo=${factor}`, dst]);
  return readWav(dst);
}

async function encode(pcm, mp3) {
  const wav = join(work, 'out.wav');
  await writeWav(pcm, wav);
  await run('ffmpeg', ['-y', '-i', wav, '-codec:a', 'libmp3lame', '-q:a', '4', mp3]);
}

const frameRms = (pcm, i, w) => {
  let sum = 0;
  const end = Math.min(pcm.length, i + w);
  for (let j = i; j < end; j++) sum += pcm[j] * pcm[j];
  return Math.sqrt(sum / Math.max(1, end - i));
};

/** [startSample, endSample] of each run of sound above the noise floor. */
function events(pcm) {
  const w = Math.round(RATE * 0.008);
  const frames = [];
  for (let i = 0; i + w <= pcm.length; i += w) frames.push(frameRms(pcm, i, w));
  const peak = Math.max(...frames, 0);
  if (!peak) return [];

  const floor = peak * 0.07;
  const out = [];
  let start = -1;
  for (let i = 0; i < frames.length; i++) {
    if (frames[i] > floor && start < 0) start = i;
    else if (frames[i] <= floor && start >= 0) {
      if ((i - start) * w >= RATE * 0.025) out.push([start * w, i * w]);
      start = -1;
    }
  }
  if (start >= 0) out.push([start * w, frames.length * w]);
  return out;
}

/**
 * Match perceived loudness, not sample peak. Peak-normalising makes an
 * unvoiced burst like /k/ far quieter than a held /mmm/ even though both hit
 * full scale, which is how C and K ended up inaudible next to everything else.
 * Target RMS, then pull back if that would clip.
 */
function normalize(pcm) {
  if (!pcm.length) return pcm;
  let sum = 0;
  let peak = 0;
  for (const s of pcm) {
    sum += s * s;
    peak = Math.max(peak, Math.abs(s));
  }
  const rms = Math.sqrt(sum / pcm.length);
  if (!rms || !peak) return pcm;

  /* A hard peak ceiling can't level an impulsive sound: /k/ is a spike with
     very little energy behind it, so peak-limiting pins the gain at ~1 and the
     clip stays inaudible next to /mmm/. Chase the RMS target instead and let a
     soft knee round off whatever pokes through — gentle enough to be
     transparent on the spoken clips, effective on the bursts. */
  const gain = Math.min(TARGET_RMS / rms, 14);
  const knee = 0.85;
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) {
    out[i] = Math.tanh((pcm[i] * gain) / knee) * knee * (TARGET_PEAK / 0.95);
  }
  return out;
}

function shape(pcm, maxSec) {
  const fin = Math.round(RATE * FADE_IN);
  const fout = Math.round(RATE * FADE_OUT);
  const cap = Math.round(RATE * maxSec);
  const body = pcm.slice(0, Math.min(pcm.length, cap));
  const out = new Float32Array(body.length);
  for (let i = 0; i < body.length; i++) {
    let g = 1;
    if (i < fin) g = i / fin;
    const fromEnd = body.length - i;
    if (fromEnd < fout) g = Math.min(g, fromEnd / fout);
    out[i] = body[i] * g;
  }
  return out;
}

/** Take the strongest single utterance out of a clip and clean it up. */
function isolate(pcm, maxSec) {
  const ev = events(pcm);
  if (!ev.length) return null;
  // the loudest event is the phoneme; the others are breath or a second take
  let best = ev[0];
  let bestEnergy = -1;
  for (const [s, e] of ev) {
    let sum = 0;
    for (let i = s; i < e; i++) sum += pcm[i] * pcm[i];
    const energy = sum / Math.max(1, e - s);
    if (energy > bestEnergy) {
      bestEnergy = energy;
      best = [s, e];
    }
  }
  // trim first, then level — otherwise the schwa we are about to cut sets the
  // gain and the burst that survives it comes out inaudible
  const pad = Math.round(RATE * 0.008);
  return normalize(shape(pcm.slice(Math.max(0, best[0] - pad), best[1]), maxSec));
}

const silence = (sec) => new Float32Array(Math.round(RATE * sec));

function concat(parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Float32Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/** Trim silence off both ends and level it, leaving the words alone. */
function tidy(pcm) {
  const ev = events(pcm);
  if (!ev.length) return null;
  const pad = Math.round(RATE * 0.02);
  const start = Math.max(0, ev[0][0] - pad);
  const end = Math.min(pcm.length, ev[ev.length - 1][1] + pad * 3);
  const body = normalize(pcm.slice(start, end));
  const fout = Math.round(RATE * 0.03);
  for (let i = 0; i < fout && i < body.length; i++) {
    body[body.length - 1 - i] *= i / fout;
  }
  return body;
}

const maxFor = (L) => (STOPS.has(L) ? STOP_MAX : VOWELS.has(L) ? VOWEL_MAX : CONTINUANT_MAX);

console.log(DRY ? 'Dry run — nothing will be written.\n' : 'Processing clips…\n');

let changed = 0;
const problems = [];

/* prompts: rebuild as sound + gap + sound, with the schwa cut off stops */
const promptFiles = (await readdir(join(AUDIO, 'prompt')).catch(() => []))
  .filter((f) => f.endsWith('.mp3'))
  .sort();

for (const f of promptFiles) {
  const L = f.replace('.mp3', '');
  const path = join(AUDIO, 'prompt', f);
  const pcm = await decode(path);
  let one = isolate(pcm, maxFor(L));

  if (!one) {
    problems.push(`${L}: silent`);
    continue;
  }
  if (!STOPS.has(L)) one = normalize(await stretch(one, PHONEME_TEMPO));
  const secs = one.length / RATE;
  console.log(
    `  prompt/${L}  ${(pcm.length / RATE).toFixed(2)}s -> ${secs.toFixed(2)}s` +
      `${STOPS.has(L) ? '  (stop, schwa removed)' : ''}`,
  );

  /* One utterance, not two. The round already says the sound again in the
     confirmation, so doubling it here meant hearing it three times per round —
     enough that it stopped registering as a question. The replay button and the
     idle nudge are there for a second listen when he wants one. */
  const built = PROMPT_REPEATS > 1 ? concat([one, silence(GAP), one]) : one;
  if (!DRY) await encode(built, path);
  changed++;
}

/* confirmations are "<sound> ... <letter name>". The sound half has the same
   trailing-schwa problem as the prompt — left alone, C confirms as "kuh, see"
   and teaches the schwa right back. So clean the first half exactly like a
   prompt and leave the spoken letter name intact. */
const confirmFiles = (await readdir(join(AUDIO, 'confirm')).catch(() => []))
  .filter((f) => f.endsWith('.mp3'))
  .sort();

for (const f of confirmFiles) {
  const L = f.replace('.mp3', '');
  const path = join(AUDIO, 'confirm', f);
  const pcm = await decode(path);
  const ev = events(pcm);

  if (ev.length < 2) {
    // can't tell the two halves apart — level it and move on
    const out = tidy(pcm);
    if (out && !DRY) await encode(out, path);
    problems.push(`confirm/${L}: sound and letter name not separable, left as one`);
    changed++;
    continue;
  }

  const pad = Math.round(RATE * 0.008);
  let sound = normalize(shape(pcm.slice(Math.max(0, ev[0][0] - pad), ev[0][1]), maxFor(L)));
  if (!STOPS.has(L)) sound = normalize(await stretch(sound, PHONEME_TEMPO));
  const nameStart = Math.max(0, ev[1][0] - pad);
  const name = normalize(pcm.slice(nameStart, ev[ev.length - 1][1] + pad * 3));
  // only the spoken half is slowed; stretching a stop burst just smears it
  const slowName = await stretch(name, SPEECH_TEMPO);

  console.log(`  confirm/${L}  sound ${(sound.length / RATE).toFixed(2)}s + letter name slowed`);
  if (!DRY) await encode(concat([sound, silence(0.42), slowName]), path);
  changed++;
}

/* everything else: trim and level only — these are real words and sentences */
for (const dir of ['word', 'name', 'letter', 'praise', 'ui', 'cat']) {
  const files = (await readdir(join(AUDIO, dir)).catch(() => [])).filter((f) => f.endsWith('.mp3'));
  // the cat's own noises are already the right pace; only speech gets slowed
  const tempo = dir === 'cat' ? 1 : SPEECH_TEMPO;
  for (const f of files.sort()) {
    const path = join(AUDIO, dir, f);
    if (!(await exists(path))) continue;
    const pcm = await decode(path);
    const out = tidy(pcm);
    if (!out) {
      problems.push(`${dir}/${f}: silent`);
      continue;
    }
    if (!DRY) await encode(await stretch(out, tempo), path);
    changed++;
  }
  if (files.length) console.log(`  ${dir}/  ${files.length} clips trimmed and levelled`);
}

await rm(work, { recursive: true, force: true });

console.log(`\n${changed} clips processed${DRY ? ' (dry run)' : ''}.`);
if (problems.length) {
  console.log('Problems:');
  for (const p of problems) console.log(`  ${p}`);
}
console.log('Check the result: node scripts/measure-audio.mjs');
