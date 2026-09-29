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
npm run audio                 # the voice clips, into audio-src/, a few minutes
npm run audio:cat             # the cat's meows, purrs and chirps
npm run audio:process         # REQUIRED — builds public/audio/ from audio-src/ (needs ffmpeg)
```

`audio-src/` holds the untouched recordings and is the only thing
`audio:process` reads. It writes every clip in `public/audio/` fresh from them
in one pass, so running it again gives the same files — never edit or process
`public/audio/` directly. Raw TTS gets three things wrong for phonics and the
processor fixes them:

- **Trailing schwa.** Asked for `/p/` the model says "puh". So stops are not
  taken from the phoneme take at all: `/t/` is cut from the start of "tiger",
  `/b/` from "ball". A stop at the start of a real word is said the way a
  person says it. The cut is where the vowel's voice starts; a voiced stop
  keeps 50ms of voice so `/b/` is not heard as `/p/`.
- **Loudness.** The raw clips varied about 10x. Everything is levelled to the
  same loudness on its sounding part, with a clean lookahead limiter, so a short
  `/k/` sits level with a held `/mmm/` without being distorted.
- **Pace.** Speech is slowed once (rubberband if ffmpeg has it, else atempo),
  held sounds and vowels are drawn out, and the confirmation is built from the
  finished sound and letter name.

Output is 44.1kHz mp3, so `/s/` and `/f/` keep their top end.

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

**Pacing.** A correct answer used to cost 4.7 seconds before the next question
arrived, and 5.6 on the third of rounds that added a word of praise — about
forty seconds of an eight-piece meal spent watching nothing happen. The wait
before the cat swallows is shorter now and the praise is no longer queued behind
the meow; it plays over the top of the next round opening. The silence at the
round boundary is untouched, because it is the only part of the wait that was
doing a job:

Everything at a round boundary is letters — the confirmation is
"/mmm/ … M!" and the next prompt is "T … /t/". Butted together they are four
letter sounds in a row and he cannot hear where the answer ended and the new
question began, so there is close to two seconds of silence between them (the
constants are at the top of `Play.tsx`). The cat keeps looking pleased through
it, so the quiet reads as *that was right* rather than as a stall. The greeting
runs in the same chain as the first prompt for the same reason — fired
separately it got cut in half by the prompt that followed it.

**The piece he is holding talks.** Hold a piece for a third of a second and it
wakes up: it grows eyes, it breathes, and it says its own sound over and over
until he lets go. He can then hear what is in his hand against what he was
asked for and put it back himself, before anything has judged him. This is the
one place in the game where he can check his own answer, and it costs him
nothing to be wrong. A brush does not wake a piece — a four-year-old's hand is
on the counter constantly, and a piece that talked on contact would talk over
the question all day.

**The reward is the cat, not a token.** Sixteen different things can happen when
he swallows: a hiccup, a burp, steam out of both ears, a belly that inflates, a
bubble blown and popped, spiral eyes, a fish skeleton floating out, nodding off
mid-mouthful. They are dealt from a shuffled pack, so four in a row can never
repeat and a full meal cannot show him the same one twice. Before this there was
exactly one — chomp, pleased face, next question, eight times a meal, every day.

**A run builds.** Three first-try answers in a row and the restaurant lights come
up and stay up. Five and the paper comes down as well. One miss and it all goes
quietly back to normal, with no sound of its own and nothing said about it.

**One round a meal is gold.** Every piece in it, never just the answer — a single
shimmering piece would point straight at the right one. Getting it right lands a
new decoration in the room while he is watching, instead of on a summary screen
several rounds later.

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

**Coming back.** One restaurant decoration is earned per finished meal, plus one
for the gold round. There are twenty-one of them. The first version had eleven,
two of which were granted at the start, so the shelf ran dry after eight meals
and the end screen quietly stopped having anything to give — which is roughly
when a child who plays most days stops asking for it.

**Stroking the cat.** On the title and rest screens he can stroke the cat and it
purrs, shuts its eyes and leans into the finger, for as long as he likes.
Nothing is asked of him there and nothing is counted. On the rest screen the row
of pieces he ate is pressable too, and each one says itself back — "/mmm/ ... M!"
Those recordings are deliberately kept off the answer path, where reading the
letter back would put two more sounds between him and the next question.

**Three ways to play.** The title screen has three buttons, told apart by
picture alone. The plain play button is the game above. The belt button is the
**sushi train**: the same meal, but the pieces ride slowly along the counter
and come round again, so he watches for the answer and reaches out to catch it.
The belt is slow on purpose and stops the moment he touches a piece — a belt he
has to be quick for would test his hands, not his letters. The cup with ears is
the **kitty cafe**: peek-a-boo in the teacups. Cats pop up out of big teacups,
each holding up a card with its letter, and duck back down a moment later. He
hears a sound and catches the cat holding that letter. The caught cat purrs,
jumps out of its cup and joins a row of friends along the top; a wrong cat stops,
says its own letter, and ducks down before the question comes back. Nothing is
timed against him: a cat he misses comes up again, and the right one never stays
away for more than two cats. One cat at a time at level 1, two at once later.
No cat comes out until the question has been said, whatever the "wait for the
prompt" setting is, so there is never anything to tap while he should be
listening.
The first version was cats sitting still on cushions, which was dull and did not
show what to do. All three games use the same rounds, weighting, mastery and
mix-up records, and a finished cafe visit counts as a meal. The cafe starts with
three cats and one more moves in after each meal until all six live there.

## Parent screen

Bottom-right of the title screen. During play, the house button in the top-left
corner goes back to the title screen.
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
  components/    Cat, Sushi, Restaurant, Plate, Confetti, PettableCat
  screens/       Title, Play (sushi and sushi train), Cafe, Rest, Parent
scripts/
  generate-audio.mjs       the 114 letter clips
  generate-cat-sounds.mjs  meows, purr, yawn, chewing
  process-audio.mjs        trims schwas off stops, levels everything
  measure-audio.mjs        checks clip shape without needing the API
  verify-audio.mjs         transcribes prompts back as a smoke test
e2e/                       browser tests — layout, hit targets, a real round
```

The cat is driven only by `{ fullness, mood, reaction }`. Swapping the SVG for
illustrated art means replacing `Cat.tsx` and touching nothing else. The sixteen
reactions are listed in `REACTIONS` at the top of that file; each one is a body
animation, an eye treatment, a mouth and one small piece of overlay art, which
is what keeps sixteen of them affordable. `data-reaction` on the cat's `<svg>`
is the only handle anything outside the file has on which one is running.

## Watch him play, then decide

Three things worth answering by observation rather than planning:

- Does he attend to the prompt, or tap because tapping is fun? If random, turn
  on "wait for the prompt".
- Does he look at the cat at all? If not, the reward is too quiet — make the
  chomp bigger and slower.
- Is 8 pieces too long? Change it in the parent screen and watch where he
  disengages.
