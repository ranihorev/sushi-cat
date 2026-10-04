#!/usr/bin/env node
/**
 * Builds the clips the game plays (public/audio/) from the untouched voice
 * recordings (audio-src/). Run after `npm run audio`. Needs ffmpeg.
 *
 * Every clip is built fresh from its source, in one pass, every time. The old
 * version of this script rewrote public/audio in place, so each run decoded an
 * already-processed mp3, cut, stretched and limited it again, and encoded it
 * again at 22kHz. After four runs the clips were dull, crunchy and wobbly. Now
 * running it twice gives the same result as running it once.
 *
 * What it does, and why:
 *
 *   1. Stops (/b/ /k/ /t/ ...) are cut from the start of the clue word — /t/
 *      from "tiger", /b/ from "ball". A stop said on its own always comes out
 *      as "tuh"; a stop at the start of a real word is said the way a person
 *      says it. We keep the burst and cut where the vowel starts, so no schwa
 *      is left, and a voiced stop keeps just enough voice to not be heard as
 *      its unvoiced twin (/b/ is not /p/).
 *   2. Loudness is matched on the part of the clip that is sound, then a clean
 *      lookahead limiter holds the peaks under -1 dBFS. The old soft-clip
 *      (tanh at up to 14x gain) distorted every short sound.
 *   3. Words and sentences are not slowed. The voice (eleven_v4) already
 *      speaks at a calm pace, and stretching made it sound wobbly. Only short
 *      letter sounds are drawn out, with rubberband when ffmpeg has it
 *      (atempo otherwise), and at most once.
 *   4. Output is 44.1kHz mono mp3 at VBR quality 3. /s/ and /f/ live above
 *      5kHz; the old 22kHz output cut the top off them.
 *
 * Confirmations are built from the finished prompt and the finished letter
 * name, so "/mmm/ ... M" uses the same sound and the same name he hears in
 * the prompt.
 *
 *   node scripts/process-audio.mjs            # build everything
 *   node scripts/process-audio.mjs --dry      # report, write nothing
 *   node scripts/process-audio.mjs T B M      # just these letters
 */

import { execFile, spawn } from 'node:child_process';
import { access, mkdir, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'audio-src');
const OUT = join(ROOT, 'public', 'audio');
const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const ONLY = args.filter((a) => /^[A-Z]$/.test(a));

const RATE = 44100;
/** RMS of the sounding part of each clip, about -19 dBFS */
const TARGET_RMS = 0.11;
/** peak ceiling, -1 dBFS */
const CEILING = 0.89;
/** never lift a quiet clip by more than this */
const MAX_GAIN = 16;

const UNVOICED_STOPS = new Set(['C', 'K', 'P', 'T', 'Q']);
const VOICED_STOPS = new Set(['B', 'D', 'G', 'J']);
const VOWELS = new Set(['A', 'E', 'I', 'O', 'U']);
/** glides can't be held; a short "wuh" is the best there is */
const GLIDES = new Set(['W', 'Y']);

/** Vowels and held sounds are steady, so they stretch cleanly. */
const PHONEME_TEMPO = 0.85;
/** A held sound shorter than this is drawn out to reach it. */
const HELD_MIN = 0.8;
const HELD_MAX = 1.1;
const VOWEL_MIN = 0.5;
const VOWEL_MAX = 0.8;
const GLIDE_MAX = 0.4;
const H_MAX = 0.45;
const X_MAX = 0.55;
const CONFIRM_GAP = 0.42;
/** In the confirmation a held sound is a reminder, not the question. */
const CONFIRM_SOUND_MAX = 0.6;

const exists = (p) => access(p).then(() => true, () => false);

/* --------------------------------- io ---------------------------------- */

async function decode(mp3) {
  const { stdout } = await run(
    'ffmpeg',
    ['-v', 'error', '-i', mp3, '-ac', '1', '-ar', String(RATE), '-f', 'f32le', '-'],
    { encoding: 'buffer', maxBuffer: 1 << 28 },
  );
  const out = new Float32Array(stdout.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = stdout.readFloatLE(i * 4);
  return out;
}

/** Pipe raw float samples through ffmpeg with the given output args. */
function ffmpegPipe(pcm, outArgs) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', [
      '-v', 'error', '-f', 'f32le', '-ar', String(RATE), '-ac', '1', '-i', '-', ...outArgs,
    ]);
    const chunks = [];
    let err = '';
    p.stdout.on('data', (c) => chunks.push(c));
    p.stderr.on('data', (c) => (err += c));
    p.on('error', reject);
    p.on('close', (code) =>
      code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(err || `ffmpeg ${code}`)),
    );
    p.stdin.end(Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength));
  });
}

async function encode(pcm, mp3) {
  await mkdir(dirname(mp3), { recursive: true });
  await ffmpegPipe(pcm, ['-y', '-codec:a', 'libmp3lame', '-q:a', '3', mp3]);
}

let hasRubberband = null;
async function stretch(pcm, factor) {
  if (factor === 1 || !pcm.length) return pcm;
  if (hasRubberband === null) {
    const { stdout } = await run('ffmpeg', ['-hide_banner', '-filters']);
    hasRubberband = /\brubberband\b/.test(stdout);
    if (!hasRubberband) console.log('  (no rubberband in this ffmpeg, slowing with atempo)');
  }
  const filter = hasRubberband
    ? `rubberband=tempo=${factor}:pitchq=quality:window=standard`
    : `atempo=${factor}`;
  const buf = await ffmpegPipe(pcm, ['-filter:a', filter, '-f', 'f32le', '-']);
  const out = new Float32Array(buf.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = buf.readFloatLE(i * 4);
  return out;
}

/* ------------------------------- analysis ------------------------------- */

const HOP = Math.round(RATE * 0.005);
const sec = (n) => Math.round(RATE * n);

function rms(pcm, s = 0, e = pcm.length) {
  let sum = 0;
  for (let i = s; i < e; i++) sum += pcm[i] * pcm[i];
  return Math.sqrt(sum / Math.max(1, e - s));
}

/** 5ms frame energies */
function envelope(pcm) {
  const out = [];
  for (let i = 0; i + HOP <= pcm.length; i += HOP) out.push(rms(pcm, i, i + HOP));
  return out;
}

/** [start, end] sample ranges of each run of sound above the floor. */
function events(pcm, rel = 0.06, minGap = 0.06) {
  const env = envelope(pcm);
  const peak = Math.max(0, ...env);
  if (!peak) return [];
  const floor = peak * rel;
  const out = [];
  let start = -1;
  let quiet = 0;
  for (let i = 0; i < env.length; i++) {
    if (env[i] > floor) {
      if (start < 0) start = i;
      quiet = 0;
    } else if (start >= 0 && ++quiet * HOP >= sec(minGap)) {
      const end = i - quiet + 1;
      if ((end - start) * HOP >= sec(0.025)) out.push([start * HOP, end * HOP]);
      start = -1;
      quiet = 0;
    }
  }
  if (start >= 0) out.push([start * HOP, (env.length - quiet) * HOP]);
  return out;
}

/** How periodic a 30ms window is: 1 for a clean voice, ~0 for noise. */
function periodicity(pcm, at) {
  const n = sec(0.03);
  if (at + n > pcm.length) return 0;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += pcm[at + i];
  mean /= n;
  let e0 = 0;
  for (let i = 0; i < n; i++) e0 += (pcm[at + i] - mean) ** 2;
  if (!e0) return 0;
  let best = 0;
  for (let lag = Math.floor(RATE / 450); lag <= Math.ceil(RATE / 70); lag++) {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += (pcm[at + i] - mean) * (pcm[at + i + lag] - mean);
    best = Math.max(best, s / e0);
  }
  return best;
}

/** Share of a window's energy above 3kHz — high for a burst or a hiss. */
function brightness(pcm, at) {
  // one-pole high-pass is enough to tell a hiss from a vowel
  const n = sec(0.02);
  const a = Math.exp((-2 * Math.PI * 3000) / RATE);
  let prev = 0;
  let hp = 0;
  let eHi = 0;
  let eAll = 0;
  for (let i = 0; i < n && at + i < pcm.length; i++) {
    const x = pcm[at + i];
    hp = a * (hp + x - prev);
    prev = x;
    eHi += hp * hp;
    eAll += x * x;
  }
  return eAll ? eHi / eAll : 0;
}

/**
 * Where the vowel of a word starts: the first 20ms that is voiced and not
 * faint. Everything before it is the consonant.
 */
function vowelStart(pcm, from) {
  const peak = Math.max(0, ...envelope(pcm));
  const need = sec(0.02);
  let runStart = -1;
  for (let i = from; i < pcm.length - sec(0.03); i += HOP) {
    const vowel = rms(pcm, i, i + HOP) > peak * 0.1 && periodicity(pcm, i) >= 0.6;
    if (vowel) {
      if (runStart < 0) runStart = i;
      if (i - runStart >= need) return runStart;
    } else runStart = -1;
  }
  return -1;
}

/** The first hiss after `from` — the /zh/ half of J, which follows a voiced lead-in. */
function hissStart(pcm, from) {
  const peak = Math.max(0, ...envelope(pcm));
  for (let i = from; i < pcm.length - sec(0.03); i += HOP) {
    if (rms(pcm, i, i + HOP) > peak * 0.1 && brightness(pcm, i) > 0.25) return i;
  }
  return from;
}

/* ------------------------------- shaping -------------------------------- */

function fade(pcm, inSec, outSec) {
  const out = pcm.slice();
  const fi = sec(inSec);
  const fo = Math.min(sec(outSec), out.length);
  for (let i = 0; i < fi && i < out.length; i++) out[i] *= i / fi;
  // raised cosine out: a linear fade on a vowel is heard as a thud
  for (let i = 0; i < fo; i++) out[out.length - fo + i] *= 0.5 + 0.5 * Math.cos((Math.PI * i) / fo);
  return out;
}

/**
 * Level to TARGET_RMS measured on the sounding frames only (so a gap or a
 * tail doesn't make a short clip look quiet), then a lookahead peak limiter.
 */
function level(pcm) {
  const env = envelope(pcm);
  const peak = Math.max(0, ...env);
  if (!peak) return pcm;
  let sum = 0;
  let n = 0;
  for (const e of env) {
    if (e > peak * 0.1) {
      sum += e * e;
      n++;
    }
  }
  const gain = Math.min(TARGET_RMS / Math.sqrt(sum / n), MAX_GAIN);
  const x = pcm.map((s) => s * gain);

  // per-sample gain the peaks need, held over a 3ms lookahead, released over 80ms
  const look = sec(0.003);
  const need = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) need[i] = Math.min(1, CEILING / Math.max(1e-9, Math.abs(x[i])));
  const held = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    let m = 1;
    for (let j = i; j < Math.min(x.length, i + look); j++) m = Math.min(m, need[j]);
    held[i] = m;
  }
  const rel = Math.exp(-1 / sec(0.08));
  const att = Math.exp(-1 / sec(0.001));
  let g = 1;
  for (let i = 0; i < x.length; i++) {
    const t = held[i];
    g = t < g ? att * g + (1 - att) * t : rel * g + (1 - rel) * t;
    x[i] = Math.max(-CEILING, Math.min(CEILING, x[i] * Math.min(g, t)));
  }
  return x;
}

const silence = (s) => new Float32Array(sec(s));
function concat(parts) {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/** The loudest single utterance in a clip, padded a little. */
function loudestEvent(pcm) {
  const ev = events(pcm);
  if (!ev.length) return null;
  let best = ev[0];
  let bestE = -1;
  for (const e of ev) {
    const r = rms(pcm, e[0], e[1]) * Math.sqrt(e[1] - e[0]);
    if (r > bestE) {
      bestE = r;
      best = e;
    }
  }
  return pcm.slice(Math.max(0, best[0] - sec(0.01)), Math.min(pcm.length, best[1] + sec(0.02)));
}

/** Trim the silence off both ends and nothing else. */
function trim(pcm) {
  const ev = events(pcm, 0.03, 0.3);
  if (!ev.length) return null;
  return pcm.slice(
    Math.max(0, ev[0][0] - sec(0.015)),
    Math.min(pcm.length, ev[ev.length - 1][1] + sec(0.06)),
  );
}

/* -------------------------------- clips --------------------------------- */

/** /t/ out of "tiger": onset to the start of the vowel. */
function stopFromWord(L, word) {
  const ev = events(word);
  if (!ev.length) return null;
  const onset = Math.max(0, ev[0][0] - sec(0.005));
  const from = L === 'J' ? hissStart(word, onset) : onset + sec(0.01);
  const v = vowelStart(word, from);
  if (v < 0) return null;
  /* An unvoiced stop is the burst and its puff of air, cut as the voice comes
     in. A voiced stop needs a little voice or /b/ is heard as /p/: 50ms of it
     is a "b", 150ms is "buh". Q keeps its /w/, which is voiced too. */
  const tail = L === 'Q' ? 0.1 : VOICED_STOPS.has(L) ? 0.05 : 0.012;
  const end = Math.min(word.length, v + sec(tail));
  return fade(word.slice(onset, end), 0.002, UNVOICED_STOPS.has(L) && L !== 'Q' ? 0.015 : 0.035);
}

async function heldSound(pcm, L) {
  let one = loudestEvent(pcm);
  if (!one) return null;
  if (L === 'H') return fade(one.slice(0, sec(H_MAX)), 0.01, 0.05);
  if (L === 'X') return fade(one.slice(0, sec(X_MAX)), 0.004, 0.05);
  if (GLIDES.has(L)) return fade(one.slice(0, sec(GLIDE_MAX)), 0.01, 0.08);
  if (VOWELS.has(L)) {
    const len = one.length / RATE;
    one = await stretch(one, Math.max(0.6, Math.min(PHONEME_TEMPO, len / VOWEL_MIN)));
    return fade(one.slice(0, sec(VOWEL_MAX)), 0.012, 0.08);
  }
  // held consonants: draw out to HELD_MIN if short, never stretch more than once
  const len = one.length / RATE;
  if (len < HELD_MIN) one = await stretch(one, Math.max(0.5, len / HELD_MIN));
  return fade(one.slice(0, sec(HELD_MAX)), 0.015, 0.1);
}

async function prompt(L) {
  if (UNVOICED_STOPS.has(L) || VOICED_STOPS.has(L)) {
    const word = await decode(join(SRC, 'word', `${L}.mp3`));
    return stopFromWord(L, word);
  }
  return heldSound(await decode(join(SRC, 'prompt', `${L}.mp3`)), L);
}

/* --------------------------------- main --------------------------------- */

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').filter((L) => !ONLY.length || ONLY.includes(L));
const problems = [];
let written = 0;
const secs = (pcm) => (pcm.length / RATE).toFixed(2);

async function write(rel, pcm) {
  if (!DRY) await encode(pcm, join(OUT, `${rel}.mp3`));
  written++;
}

console.log(DRY ? 'Dry run — nothing will be written.\n' : 'Building clips…\n');

for (const L of LETTERS) {
  const p = await prompt(L);
  if (!p) {
    problems.push(`prompt/${L}: could not find the sound`);
    continue;
  }
  const sound = level(p);

  const letterSrc = join(SRC, 'letter', `${L}.mp3`);
  const name = (await exists(letterSrc)) ? trim(await decode(letterSrc)) : null;
  const letter = name && level(fade(name, 0.005, 0.03));

  await write(`prompt/${L}`, sound);
  if (letter) {
    await write(`letter/${L}`, letter);
    const short =
      sound.length > sec(CONFIRM_SOUND_MAX) ? fade(sound.slice(0, sec(CONFIRM_SOUND_MAX)), 0, 0.08) : sound;
    await write(`confirm/${L}`, concat([short, silence(CONFIRM_GAP), letter]));
  } else problems.push(`letter/${L}: missing, confirm not built`);
  console.log(`  ${L}  sound ${secs(sound)}s${letter ? `, name ${secs(letter)}s` : ''}`);
}

/* Real words and sentences: trim and level, nothing else. */
const speech = ONLY.length ? ['word', 'name'] : ['word', 'name', 'praise', 'ui', 'cat'];
for (const dir of speech) {
  const files = (await readdir(join(SRC, dir)).catch(() => []))
    .filter((f) => f.endsWith('.mp3'))
    .filter((f) => !ONLY.length || ONLY.includes(f.replace('.mp3', '')))
    .sort();
  for (const f of files) {
    const t = trim(await decode(join(SRC, dir, f)));
    if (!t) {
      problems.push(`${dir}/${f}: silent`);
      continue;
    }
    await write(`${dir}/${f.replace('.mp3', '')}`, level(fade(t, 0.005, 0.04)));
  }
  if (files.length) console.log(`  ${dir}/  ${files.length} clips`);
}

console.log(`\n${written} clips ${DRY ? 'checked (dry run)' : 'written'}.`);
if (problems.length) {
  console.log('Problems:');
  for (const p of problems) console.log(`  ${p}`);
  process.exitCode = 1;
}
