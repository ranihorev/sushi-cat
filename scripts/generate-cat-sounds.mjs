#!/usr/bin/env node
/**
 * Generates the cat's own voice with the ElevenLabs sound-effects API.
 *
 * These carry the emotional feedback the child actually reads — he learns
 * "right" and "wrong" from how the cat reacts long before he reads anything.
 * Kept short so they never delay the next round.
 *
 *   ELEVENLABS_API_KEY=... npm run audio:cat
 *   ELEVENLABS_API_KEY=... npm run audio:cat -- --force
 */

import { mkdir, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'audio', 'cat');

const API_KEY =
  process.env.ELEVENLABS_API_KEY || process.env.ELEVEN_LABS_KEY || process.env.XI_API_KEY;
if (!API_KEY) {
  console.error('Set ELEVENLABS_API_KEY first.');
  process.exit(1);
}

const force = process.argv.includes('--force');

/* Two takes of each reaction so it doesn't get grating by round eight. */
const SOUNDS = [
  { path: 'meow-happy-1', dur: 1.1, text: 'a single short cheerful kitten meow, cute and bright, clean studio recording, no music' },
  { path: 'meow-happy-2', dur: 1.1, text: 'a short sweet happy cat meow, higher pitched, cute, clean recording, no music' },
  { path: 'trill-1', dur: 1.2, text: 'a cat chirp trill, excited and friendly, short, clean recording, no music' },
  { path: 'trill-2', dur: 1.2, text: 'a happy cat brrrp chirrup, short and playful, clean recording, no music' },
  { path: 'curious-1', dur: 1.2, text: 'a short questioning cat mrrp, curious rising tone, clean recording, no music' },
  { path: 'curious-2', dur: 1.2, text: 'a confused little cat murmur, rising questioning meow, short, clean recording, no music' },
  { path: 'purr', dur: 2.5, text: 'a soft contented cat purring, warm and steady, close mic, no music' },
  { path: 'nom', dur: 1.2, text: 'a cat eating, quick soft chewing and gulping, close mic, no music' },
  { path: 'yawn', dur: 1.8, text: 'a sleepy cat yawn, soft and drawn out, cute, clean recording, no music' },
  { path: 'greet', dur: 1.3, text: 'a friendly welcoming cat meow, warm and inviting, clean recording, no music' },
];

const exists = (p) => access(p).then(() => true, () => false);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function soundEffect(text, duration) {
  const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
    method: 'POST',
    headers: { 'xi-api-key': API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      text,
      duration_seconds: duration,
      // lean hard on the prompt — we want a cat, not an interpretation
      prompt_influence: 0.75,
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 250)}`);
  return Buffer.from(await res.arrayBuffer());
}

await mkdir(OUT, { recursive: true });

let made = 0;
const failures = [];

for (const s of SOUNDS) {
  const file = join(OUT, `${s.path}.mp3`);
  if (!force && (await exists(file))) {
    console.log(`  · ${s.path} (already there)`);
    continue;
  }
  try {
    await writeFile(file, await soundEffect(s.text, s.dur));
    console.log(`  ✓ ${s.path}`);
    made++;
  } catch (e) {
    failures.push(s.path);
    console.log(`  ✗ ${s.path} — ${e.message}`);
  }
  await sleep(200);
}

console.log(`\n${made} generated, ${failures.length} failed.`);
console.log('Now run: node scripts/process-audio.mjs  (trims and levels them)');
if (failures.length) process.exit(1);
