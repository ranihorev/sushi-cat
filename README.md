# Feed the Sushi Cat

A letter-sound game for a 4-year-old. A cat sits behind a sushi counter; each
piece is stamped with a letter; the child hears a sound and drags the matching
piece up to the cat to feed it.

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
npm run audio                 # the 114 voice clips, a few minutes
npm run audio:cat             # the cat's meows, purrs and chirps
npm run audio:process         # REQUIRED — trims and levels them (needs ffmpeg)
```

`audio:process` is not optional. Raw TTS gets two things wrong for phonics and
it fixes both:

- **Trailing schwa.** Asked for `/p/` the model says "puh". Measured across the
  raw clips, every stop consonant ran 0.33–1.2s — all vowel. The processor
  keeps the burst and cuts the vowel off, which is why the generator now asks
  for `P AH0`: a released burst reads more cleanly than a bare one, and the
  release gets trimmed away anyway.
- **Loudness.** The raw clips varied about 10x. Everything is levelled to the
  same perceived loudness, with soft limiting so a short `/k/` burst can reach
  the same level as a held `/mmm/`.

Two checks, neither a substitute for listening:

```bash
npm run audio:measure   # clip shapes — flags stops that still sound like "puh"
npm run audio:verify    # transcribes prompts back (key needs speech_to_text)
```

Other generator options:

```bash
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

The cat's own voice — meows, chirps, a purr, a yawn, chewing — comes from
`npm run audio:cat`. That needs the `sound_generation` permission on the API
key. It degrades quietly: if the clips aren't there the game plays exactly as
before, just without the cat reacting out loud.

The interface sounds (chomp, chime, puzzled) are synthesized in the browser with
Web Audio — no files, works offline, nothing to generate.

## Tests

```bash
npm test          # game logic, audio sequencing, the play screen (jsdom)
npm run test:e2e  # a real browser: hit targets, drag-to-feed, clips (Playwright)
npm run test:all  # both
```

The two layers exist because they catch different things.

`npm test` runs the real `AudioEngine` against a fake Web Audio stack that names
every buffer, so a test can assert exactly which clips reached the speakers and
in what order — including that a new prompt cuts off the old one. `clips.test.ts`
checks that every one of the ~120 clips the game can ask for is on disk, which
is the sort of thing nobody notices by eye.

`npm run test:e2e` exists because the worst bug so far was invisible to jsdom:
the sushi row is a full-width box far taller than the sushi drawn in it, and it
sat on top of the replay button. The button looked perfect and its lower 40%
silently ate every press. The suite now sweeps every point of every control at
five viewports and fails if anything intercepts one. `playwright install
chromium` once, first time.

## Deploy to the tablet

```bash
npm run build
npx vercel --prod
```

Open the URL on the iPad and **Add to Home Screen**. It installs as a fullscreen
app and works offline — every clip and all the art is cached on first run.

---

## How it teaches

**Feeding is a drag, not a tap.** Carrying a piece to the cat is a more
deliberate act than tapping, so it makes him commit to a choice instead of
batting at whatever is nearest. The drop zone is far larger than the cat —
being fussy about the drop point would test motor control, not letters. A tap
with no drag answers nothing; the piece hops to show it wants carrying and the
sound plays again.

**Pedagogy.** The prompt is a sound, never a letter name. Uppercase only.
No timers, no scores, no losing — a wrong tap gets a puzzled cat and the prompt
again; after two misses the right piece glows and the sound repeats. Every round
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
  generate-audio.mjs       the 114 letter clips
  generate-cat-sounds.mjs  meows, purr, yawn, chewing
  process-audio.mjs        trims schwas off stops, levels everything
  measure-audio.mjs        checks clip shape without needing the API
  verify-audio.mjs         transcribes prompts back as a smoke test
e2e/                       browser tests — layout, hit targets, a real round
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
