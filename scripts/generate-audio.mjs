#!/usr/bin/env node
/**
 * Generates every voice clip with ElevenLabs into audio-src/. These are the
 * untouched recordings; `npm run audio:process` builds the clips the game
 * plays from them.
 *
 * The voice is "Emma - Bright Kids Educator" on eleven_v4. That model reads
 * IPA between slashes, so a letter sound is written as the sound itself
 * (/mːːː/ for a held "mmm") and a letter name that plain text gets wrong
 * (A, I, O) is written as /eɪ/, /aɪ/, /oʊ/. Words in [brackets] are v4 audio
 * tags that set the mood of the line.
 *
 * The clips in audio-src/ were made through the ElevenLabs connector as a few
 * long takes, one per group, with a long pause between items, and cut at the
 * pauses. This script makes the same lines one clip at a time.
 *
 *   ELEVENLABS_API_KEY=... npm run audio             # everything that's missing
 *   ELEVENLABS_API_KEY=... npm run audio -- --force  # regenerate
 *   ELEVENLABS_API_KEY=... npm run audio -- S M T    # just these letters
 *
 * Optional env:
 *   ELEVENLABS_VOICE_ID   default is Emma
 */

import { mkdir, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'audio-src');

const API_KEY =
  process.env.ELEVENLABS_API_KEY || process.env.ELEVEN_LABS_KEY || process.env.XI_API_KEY;
if (!API_KEY) {
  console.error('Set ELEVENLABS_API_KEY first.  https://elevenlabs.io/app/settings/api-keys');
  process.exit(1);
}

/** Emma — bright, warm, made for kids' phonics. */
const VOICE = process.env.ELEVENLABS_VOICE_ID || 'oClOrzqamOXmtcB8iqTj';
const MODEL = 'eleven_v4';

/* The sound is the prompt for letters you can hold or say alone. Stops
   (B C D G J K P Q T) have none: process-audio.mjs cuts them from the start
   of the word, because a stop said alone always comes out as "tuh". */
const LETTERS = {
  A: { sound: '/æː/', word: 'apple' },
  B: { word: 'ball' },
  C: { word: 'cat' },
  D: { word: 'dog' },
  E: { sound: '/ɛː/', word: 'egg' },
  F: { sound: '/fːːː/', word: 'fish' },
  G: { word: 'goat' },
  H: { sound: '/hə/', word: 'hat' },
  I: { sound: '/ɪː/', word: 'igloo' },
  J: { word: 'jam' },
  K: { word: 'kite' },
  L: { sound: '/lːːː/', word: 'lion' },
  M: { sound: '/mːːː/', word: 'moon' },
  N: { sound: '/nːːː/', word: 'nose' },
  O: { sound: '/ɑː/', word: 'octopus' },
  P: { word: 'pizza' },
  Q: { word: 'queen' },
  R: { sound: '/ɹːːː/', word: 'rocket' },
  S: { sound: '/sːːː/', word: 'sun' },
  T: { word: 'tiger' },
  U: { sound: '/ʌː/', word: 'umbrella' },
  V: { sound: '/vːːː/', word: 'van' },
  W: { sound: '/wə/', word: 'water' },
  X: { sound: '/ks/', word: 'box' },
  Y: { sound: '/jə/', word: 'yo-yo' },
  Z: { sound: '/zːːː/', word: 'zebra' },
};

/* Letter names. Plain text is fine for most; "A" comes out as the article,
   "I" as the pronoun and "O" as an exclamation, so those three are IPA. */
const LETTER_NAME = { A: '/eɪ/', I: '/aɪ/', O: '/oʊ/' };
const letterName = (L) => LETTER_NAME[L] ?? L;

const PRAISE = [
  'Yum!',
  'Mmm, delicious!',
  'More please!',
  'So tasty!',
  'Thank you!',
  'That was a good one!',
];

const UI = {
  'ui/lets-eat': "[excited] Let's eat!",
  'ui/all-done': '[warmly] All done, nap time!',
  'ui/try-again': 'Hmm, try again!',
  'ui/this-one': '[happy] This one!',
};

/* ------------------------------------------------------------------ */

const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.filter((a) => /^[A-Z]$/.test(a));

const exists = (p) => access(p).then(() => true, () => false);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function tts(text, { stability = 0.5, style = 0.3 } = {}) {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: { 'xi-api-key': API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({
        text,
        model_id: MODEL,
        voice_settings: {
          stability,
          similarity_boost: 0.8,
          style,
          use_speaker_boost: true,
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
  return Buffer.from(await res.arrayBuffer());
}

async function make(relPath, text, opts) {
  const file = join(OUT, `${relPath}.mp3`);
  if (!force && (await exists(file))) return 'skip';
  await mkdir(dirname(file), { recursive: true });

  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const buf = await tts(text, opts);
      await writeFile(file, buf);
      return 'ok';
    } catch (e) {
      lastErr = e;
      await sleep(900 * (attempt + 1));
    }
  }
  throw lastErr;
}

/** Every clip the game can ask for. */
function jobs() {
  const list = [];
  const letters = only.length ? only : Object.keys(LETTERS);

  for (const L of letters) {
    const { sound, word } = LETTERS[L];

    // the prompt: the bare sound, for letters that have one
    if (sound) list.push({ path: `prompt/${L}`, text: `[slowly] ${sound}`, opts: { stability: 0.8, style: 0 } });

    // no confirm/ clip: process-audio.mjs builds it from the prompt and the letter

    // the word, for word-initial rounds (and the source of a stop's sound)
    const Word = word[0].toUpperCase() + word.slice(1);
    list.push({ path: `word/${L}`, text: `[warmly] ${Word}!` });

    // the letter's name on its own, used to open a sound prompt
    list.push({ path: `letter/${L}`, text: `[warmly] ${letterName(L)}.`, opts: { stability: 0.7 } });

    // letter-name rounds
    list.push({ path: `name/${L}`, text: `[curious] Where's ${letterName(L)}?` });
  }

  if (!only.length) {
    PRAISE.forEach((text, i) =>
      list.push({
        path: `praise/${i + 1}`,
        text: `[happy] ${text}`,
        opts: { stability: 0.45, style: 0.45 },
      }),
    );
    for (const [path, text] of Object.entries(UI)) {
      list.push({ path, text });
    }
  }
  return list;
}

const all = jobs();
console.log(`${all.length} clips → public/audio/  (voice ${VOICE})\n`);

let made = 0;
let skipped = 0;
const failures = [];

for (const job of all) {
  try {
    const result = await make(job.path, job.text, job.opts);
    if (result === 'ok') {
      made++;
      process.stdout.write(`  ✓ ${job.path}\n`);
    } else {
      skipped++;
    }
  } catch (e) {
    failures.push(job.path);
    process.stdout.write(`  ✗ ${job.path} — ${e.message}\n`);
  }
  await sleep(120); // stay well inside the rate limit
}

console.log(`\n${made} generated, ${skipped} already present, ${failures.length} failed.`);
if (failures.length) {
  console.log('Retry with:  npm run audio -- --force');
  process.exit(1);
}
console.log('Audition them at /audio-check when the dev server is running.');
