# Feed the Sushi Cat

A letter-sound game for a 4-year-old. A cat sits behind a sushi counter; each
piece is stamped with a letter; the child feeds it the piece matching the sound
it asks for.

The game learns which letters he struggles with and shows those more often.

---

## Run it

```bash
npm install
npm run dev
```

## Generate the voice clips — do this first

The game plays recorded phonemes, not synthesized speech. Without the clips it
falls back to `SpeechSynthesis`, which says "tee" where it should say `/t/` and
teaches the wrong thing.

```bash
export ELEVENLABS_API_KEY=sk_...
npm run audio                 # ~115 clips, a few minutes
npm run audio -- --force      # regenerate everything
npm run audio -- S M T        # just these letters
```

Then **listen to them** at http://localhost:5173/audio-check.html before handing
over the tablet. Every prompt should be the sound and nothing else:

- `/mmm/`, not "em"
- `/t/`, not "tuh" — a trailing schwa causes blending problems later
  ("cuh-a-tuh" instead of "cat")

If one is wrong, fix its `arpa` field in `scripts/generate-audio.mjs` and
regenerate just that letter. Pronunciation is forced with CMU arpabet phoneme
tags, which is why the prompts use `eleven_flash_v2` — it is the model that
supports them.

A parent's own voice beats any TTS for engagement. To swap in recordings, drop
files at the same paths (`public/audio/prompt/M.mp3` etc.) and skip the script.

Sound effects (chomp, chime, puzzled) are synthesized in the browser with Web
Audio — no files, works offline, nothing to generate.

## Deploy to the tablet

```bash
npm run build
npx vercel --prod
```

Open the URL on the iPad and **Add to Home Screen**. It installs as a fullscreen
app and works offline — every clip and all the art is cached on first run.

---

## How it teaches

**Pedagogy.** The prompt is a sound, never a letter name. Uppercase only.
No timers, no scores, no losing — a wrong tap gets a puzzled cat and the prompt
again; after two misses the right piece glows until it's tapped. Every round
ends in success. A meal is 8 pieces, about 3–5 minutes. Repetition across days
beats length within a day.

**Difficulty** is invisible and never announced.

| Level | Choices | Lookalikes |
|-------|---------|------------|
| 1     | 2       | no         |
| 2     | 3       | no         |
| 3     | 4       | yes        |

Promotes after 3 first-try correct in a row, demotes after 2 misses in one
round. Only first-try answers count as correct — getting there after two misses
is not mastery.

**Letters.** Starts with `S M T A P C`. A new batch of 2–3 unlocks only when
every letter in the active set is solid (seen 4+ times, recall reliable).
Add his own name's letters in the parent screen — personal relevance beats
optimal ordering at this age.

**Adaptation.** Each letter carries a recency-weighted mastery score. Round
generation is weighted toward weak and stale letters, not uniform random. Wrong
taps are recorded as confusion pairs (`P → B`), and at level 3 those exact
letters are preferred as distractors — practice lands where the errors are.

**Round types.** Sound (the backbone), plus word-initial ("sun … /sss/") and
letter-name ("where's S?") rounds once a letter is known.

**Coming back.** One restaurant decoration is earned per finished meal.

## Parent screen

Bottom-right of the title screen, or long-press the top-left corner during play.
Shows per-letter mastery, which mix-ups he makes, a manual override for the
active set, name entry, pieces per meal, and a "wait for the prompt" toggle —
turn that on if he taps at random instead of listening.

## Layout

```
src/
  game/
    letters.ts   letter set, phonemes, lookalike + homophone tables
    engine.ts    round generation, weighting, difficulty
    store.ts     profile, mastery, unlocks (localStorage)
    audio.ts     clip preload/playback, synthesized SFX
  components/    Cat, Sushi, Restaurant, Plate
  screens/       Title, Play, Rest, Parent
scripts/
  generate-audio.mjs
```

The cat is driven only by `{ fullness, mood }`. Swapping the SVG for illustrated
art means replacing `Cat.tsx` and touching nothing else.

## Watch him play, then decide

Three things worth answering by observation rather than planning:

- Does he attend to the prompt, or tap because tapping is fun? If random, turn
  on "wait for the prompt".
- Does he look at the cat at all? If not, the reward is too quiet — make the
  chomp bigger and slower.
- Is 8 pieces too long? Change it in the parent screen and watch where he
  disengages.
