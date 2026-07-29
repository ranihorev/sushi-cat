#!/usr/bin/env node
/**
 * Sanity check on generated prompt clips.
 *
 * The failure mode that matters is the model saying the letter *name* ("tee")
 * where it should say the phoneme (/t/). Transcribing the clip back catches it:
 * a phoneme reads back as nothing recognisable or a bare consonant, a letter
 * name reads back as an actual word ("tea", "pea", "em", "ess").
 *
 *   node scripts/verify-audio.mjs           # every prompt clip present
 *   node scripts/verify-audio.mjs S T M     # just these
 */

import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AUDIO = join(ROOT, 'public', 'audio', 'prompt');

const API_KEY =
  process.env.ELEVENLABS_API_KEY || process.env.ELEVEN_LABS_KEY || process.env.XI_API_KEY;
if (!API_KEY) {
  console.error('Set ELEVENLABS_API_KEY (or ELEVEN_LABS_KEY) first.');
  process.exit(1);
}

/** Reading any of these back means the clip is saying the letter name. */
const LETTER_NAME_SOUNDS = {
  A: ['ay', 'eh'],
  B: ['bee', 'be'],
  C: ['see', 'sea', 'cee'],
  D: ['dee', 'de'],
  E: ['ee', 'e'],
  F: ['ef', 'eff'],
  G: ['gee', 'jee'],
  H: ['aitch', 'aych', 'h'],
  I: ['eye', 'aye'],
  J: ['jay', 'jai'],
  K: ['kay', 'cay'],
  L: ['el', 'ell'],
  M: ['em', 'emm'],
  N: ['en', 'enn'],
  O: ['oh', 'owe'],
  P: ['pee', 'pea'],
  Q: ['cue', 'queue', 'kyu'],
  R: ['ar', 'are'],
  S: ['es', 'ess'],
  T: ['tea', 'tee', 'ti'],
  U: ['you', 'yu', 'ewe'],
  V: ['vee', 've'],
  W: ['double', 'doubleyou'],
  X: ['ex', 'eks'],
  Y: ['why', 'wai'],
  Z: ['zee', 'zed'],
};

async function transcribe(buf) {
  const form = new FormData();
  form.append('file', new Blob([buf], { type: 'audio/mpeg' }), 'clip.mp3');
  form.append('model_id', 'scribe_v1');
  form.append('language_code', 'eng');

  const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': API_KEY },
    body: form,
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  return (json.text ?? '').trim();
}

const only = process.argv.slice(2).filter((a) => /^[A-Z]$/.test(a));
const files = (await readdir(AUDIO).catch(() => [])).filter((f) => f.endsWith('.mp3'));
const letters = (only.length ? only : files.map((f) => f.replace('.mp3', ''))).sort();

if (!letters.length) {
  console.error('No prompt clips found. Run `npm run audio` first.');
  process.exit(1);
}

console.log('Transcribing each prompt clip back to check it is a sound, not a name.\n');

const suspect = [];
const failed = [];

for (const L of letters) {
  let text;
  try {
    text = await transcribe(await readFile(join(AUDIO, `${L}.mp3`)));
  } catch (e) {
    failed.push(L);
    const missingPerm = e.message.includes('speech_to_text');
    console.log(`  ?  ${L}  ${missingPerm ? 'no speech_to_text permission on this key' : e.message}`);
    if (missingPerm) break; // it will fail identically for every other letter
    continue;
  }

  const normalized = text.toLowerCase().replace(/[^a-z ]/g, '');
  const words = normalized.split(/\s+/).filter(Boolean);
  const bad = words.some((w) => (LETTER_NAME_SOUNDS[L] ?? []).includes(w));

  if (bad) suspect.push(L);
  console.log(`  ${bad ? '✗' : '·'}  ${L}  "${text}"`);
}

const checked = letters.length - failed.length;

console.log();
if (!checked) {
  console.log('Nothing was verified — every transcription call failed.');
  console.log('Enable the speech_to_text permission on the API key, or just listen');
  console.log('to the clips yourself at /audio-check.html.');
  process.exit(1);
}
if (suspect.length) {
  console.log(`Sounds like a letter name, not a phoneme: ${suspect.join(', ')}`);
  console.log('Adjust `arpa` in scripts/generate-audio.mjs, then:');
  console.log(`  npm run audio -- --force ${suspect.join(' ')}`);
} else {
  console.log(`No clip transcribed as its letter name (${checked}/${letters.length} checked).`);
}
console.log('\nThis is a smoke test, not a verdict. Listen at /audio-check.html before use.');
