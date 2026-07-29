#!/usr/bin/env node
/**
 * Generates every voice clip with ElevenLabs into public/audio/.
 *
 * The hard part of phonics TTS is that plain text makes the model say letter
 * *names* — "tee" instead of /t/. We sidestep that with CMU arpabet phoneme
 * tags, which force an exact pronunciation. Those are supported by
 * eleven_flash_v2, so that is the model used for the bare-phoneme prompts.
 * Full sentences (confirmations, words, praise) use a nicer-sounding model.
 *
 *   ELEVENLABS_API_KEY=... npm run audio             # everything that's missing
 *   ELEVENLABS_API_KEY=... npm run audio -- --force  # regenerate
 *   ELEVENLABS_API_KEY=... npm run audio -- S M T    # just these letters
 *
 * Optional env:
 *   ELEVENLABS_VOICE_ID   default is a warm, friendly female voice
 */

import { mkdir, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'audio');

const API_KEY =
  process.env.ELEVENLABS_API_KEY || process.env.ELEVEN_LABS_KEY || process.env.XI_API_KEY;
if (!API_KEY) {
  console.error('Set ELEVENLABS_API_KEY first.  https://elevenlabs.io/app/settings/api-keys');
  process.exit(1);
}

/** Rachel — clear, warm, well-behaved with phoneme tags. */
const VOICE = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';

/** phoneme tags are a v2-model feature; sentences sound better on multilingual */
const PHONEME_MODEL = 'eleven_flash_v2';
const SENTENCE_MODEL = 'eleven_multilingual_v2';

const LETTERS = {
  A: { arpa: 'AE1',   word: 'apple',    sound: 'ah' },
  B: { arpa: 'B AH0',   word: 'ball',     sound: 'buh' },
  C: { arpa: 'K AH0',   word: 'cat',      sound: 'kuh' },
  D: { arpa: 'D AH0',   word: 'dog',      sound: 'duh' },
  E: { arpa: 'EH1',   word: 'egg',      sound: 'eh' },
  F: { arpa: 'F F F', word: 'fish',     sound: 'fff' },
  G: { arpa: 'G AH0',   word: 'goat',     sound: 'guh' },
  H: { arpa: 'HH HH', word: 'hat',      sound: 'huh' },
  I: { arpa: 'IH1',   word: 'igloo',    sound: 'ih' },
  J: { arpa: 'JH AH0',  word: 'jam',      sound: 'juh' },
  K: { arpa: 'K AH0',   word: 'kite',     sound: 'kuh' },
  L: { arpa: 'L L',   word: 'lion',     sound: 'lll' },
  M: { arpa: 'M M M', word: 'moon',     sound: 'mmm' },
  N: { arpa: 'N N N', word: 'nose',     sound: 'nnn' },
  O: { arpa: 'AA1',   word: 'octopus',  sound: 'oh' },
  P: { arpa: 'P AH0',   word: 'pizza',    sound: 'puh' },
  Q: { arpa: 'K W AH0', word: 'queen',    sound: 'kwuh' },
  R: { arpa: 'R R',   word: 'rocket',   sound: 'rrr' },
  S: { arpa: 'S S S', word: 'sun',      sound: 'sss' },
  T: { arpa: 'T AH0',   word: 'tiger',    sound: 'tuh' },
  U: { arpa: 'AH1',   word: 'umbrella', sound: 'uh' },
  V: { arpa: 'V V V', word: 'van',      sound: 'vvv' },
  W: { arpa: 'W AH0', word: 'water',    sound: 'wuh' },
  X: { arpa: 'K S S', word: 'box',      sound: 'ks' },
  Y: { arpa: 'Y AH0', word: 'yo-yo',    sound: 'yuh' },
  Z: { arpa: 'Z Z Z', word: 'zebra',    sound: 'zzz' },
};

const ph = (arpa, fallback) =>
  `<phoneme alphabet="cmu-arpabet" ph="${arpa}">${fallback}</phoneme>`;

const PRAISE = [
  'Yum!',
  'Mmm, delicious!',
  'More please!',
  'So tasty!',
  'Thank you!',
  'That was a good one!',
];

const UI = {
  'ui/lets-eat': "Let's eat!",
  'ui/all-done': 'All done. Nap time!',
  'ui/try-again': 'Hmm... try again!',
  'ui/this-one': 'This one!',
};

/* ------------------------------------------------------------------ */

const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.filter((a) => /^[A-Z]$/.test(a));

const exists = (p) => access(p).then(() => true, () => false);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function tts(text, { model, stability = 0.55, style = 0.15, speed = 1 }) {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: { 'xi-api-key': API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({
        text,
        model_id: model,
        apply_text_normalization: 'off',
        voice_settings: {
          stability,
          similarity_boost: 0.8,
          style,
          use_speaker_boost: true,
          speed,
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
    const { arpa, word, sound } = LETTERS[L];
    const tag = ph(arpa, sound);

    // the prompt: the bare phoneme, said twice, clipped, no trailing schwa
    list.push({
      path: `prompt/${L}`,
      text: `${tag} ... ${tag}`,
      opts: { model: PHONEME_MODEL, stability: 0.85, style: 0, speed: 0.85 },
    });

    // the confirmation: phoneme, then the letter name
    list.push({
      path: `confirm/${L}`,
      text: `${tag} ... ${L}!`,
      opts: { model: PHONEME_MODEL, stability: 0.8, style: 0.1, speed: 0.9 },
    });

    // the word, for word-initial rounds
    list.push({
      path: `word/${L}`,
      text: `${word}!`,
      opts: { model: SENTENCE_MODEL, stability: 0.5, style: 0.3 },
    });

    // letter-name rounds
    list.push({
      path: `name/${L}`,
      text: `Where's ${L}?`,
      opts: { model: SENTENCE_MODEL, stability: 0.5, style: 0.35 },
    });
  }

  if (!only.length) {
    PRAISE.forEach((text, i) =>
      list.push({
        path: `praise/${i + 1}`,
        text,
        opts: { model: SENTENCE_MODEL, stability: 0.45, style: 0.45 },
      }),
    );
    for (const [path, text] of Object.entries(UI)) {
      list.push({ path, text, opts: { model: SENTENCE_MODEL, stability: 0.5, style: 0.35 } });
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
