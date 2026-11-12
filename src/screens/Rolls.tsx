import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Cat, REACTIONS, type Mood, type Reaction } from '../components/Cat';
import { Confetti } from '../components/Confetti';
import { HomeButton } from '../components/HomeButton';
import { Picture } from '../components/Picture';
import { Counter, Restaurant } from '../components/Restaurant';
import { Sushi, type PieceState } from '../components/Sushi';
import { audio, catSound, sayFallback, sayWord } from '../game/audio';
import { demote, promote } from '../game/engine';
import { wornBy } from '../game/gifts';
import type { Letter } from '../game/letters';
import { LETTERS, TOPPING_COLORS } from '../game/letters';
import { REACTION_SOUND } from '../game/reactionSounds';
import { glyphFor, recordAnswer, recordConfusion } from '../game/store';
import type { Level, Profile } from '../game/types';
import { distractorsFor, pickWord, type RollWord } from '../game/words';

interface Props {
  profile: Profile;
  onProfileChange: (updater: (p: Profile) => Profile) => void;
  onMealComplete: (eaten: Letter[]) => void;
  onExit: () => void;
}

/* The roll shop: sushi roll words.

   The cat orders something — a picture of it hangs beside him and the word is
   said. On the mat are three places. He hears the sound for the place that is
   lit and puts the piece with that letter there, then the next, then the last.
   When all three are down the sounds are said in order, the pieces press
   together into one roll, and the word is said whole: "c ... a ... t ... cat!"
   The cat eats the roll.

   This is the point the letter game was always walking towards. Knowing that S
   says /sss/ is only useful because sounds put side by side make words, and
   until now nothing in the game ever put two sounds side by side.

   It is built to be as hard to fail as the rest: no timer, a wrong piece only
   says what it is and hops back, and after two misses the right one glows. How
   much he builds himself grows with him:

     level 1  the last two pieces are already down; he adds the first sound
     level 2  he places all three, from just those three pieces
     level 3  all three, with an extra piece on the counter that does not belong

   Each piece he places is the same act as the letter game — hear a sound, find
   the letter — so it is recorded in the same place and the two games feed each
   other. */

const LEAD_MS = 450;
const IDLE_NUDGE_MS = 8000;
const HOLD_WAKE_MS = 350;
const PIECE_VOICE_MS = 1500;
/** between one sound and the next while the finished word is sounded out */
const BLEND_GAP_MS = 230;
/** where the roll goes when the cat eats it, as a fraction of his box */
const MUZZLE = { x: 0.5, y: 0.8 };

const STOPS = new Set<Letter>(['B', 'C', 'D', 'G', 'J', 'K', 'P', 'Q', 'T', 'X']);

/** how many words make a meal: half as many as pieces, since each is three */
export const wordsPerMeal = (pieces: number) => Math.max(3, Math.min(6, Math.round(pieces / 2)));

function shuffled<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface Task {
  word: RollWord;
  /** which places are already filled when the word opens */
  placed: boolean[];
  /** what is on the counter */
  pieces: Letter[];
}

export function makeTask(p: Profile, level: Level, recent: string[]): Task {
  const word = pickWord(p, recent);
  if (level === 1) {
    return {
      word,
      placed: [false, true, true],
      pieces: shuffled([word.letters[0], ...distractorsFor(p, word, 1)]),
    };
  }
  return {
    word,
    placed: [false, false, false],
    pieces: shuffled([...word.letters, ...(level === 3 ? distractorsFor(p, word, 1) : [])]),
  };
}

/** a sound on its own, said twice: a bare stop is gone before he has looked up */
const slotPrompt = (l: Letter): Array<string | number> => [
  `prompt/${l}`,
  STOPS.has(l) ? 560 : 460,
  `prompt/${l}`,
];
const slotFallback = (l: Letter) => () => sayFallback(LETTERS[l].sound.replaceAll('/', ''));

type Phase = 'intro' | 'build' | 'blend' | 'eat';

export function Rolls({ profile, onProfileChange, onMealComplete, onExit }: Props) {
  const total = wordsPerMeal(profile.settings.roundsPerMeal);

  /* The game runs as long chains of awaited sounds that outlive any one render,
     so what they read and write lives in a ref, and `draw` asks for a repaint.
     Keeping it in state meant every step of a chain saw the values from the
     render it was started in. */
  const g = useRef<{
    task: Task;
    placed: boolean[];
    pieces: Letter[];
    phase: Phase;
    level: Level;
    done: RollWord[];
    recent: string[];
    slotMisses: number;
    wordMisses: number;
    cleanRun: number;
    busy: boolean;
  } | null>(null);
  if (!g.current) {
    const level = profile.wordLevel ?? 1;
    const task = makeTask(profile, level, []);
    g.current = {
      task,
      placed: [...task.placed],
      pieces: [...task.pieces],
      phase: 'intro',
      level,
      done: [],
      recent: [],
      slotMisses: 0,
      wordMisses: 0,
      cleanRun: 0,
      busy: true,
    };
  }
  const s = g.current;
  const [, setTick] = useState(0);
  const draw = useCallback(() => setTick((n) => n + 1), []);

  const [mood, setMood] = useState<Mood>('idle');
  const [reaction, setReaction] = useState<Reaction | null>(null);
  const [pieceState, setPieceState] = useState<Partial<Record<Letter, PieceState>>>({});
  const [awake, setAwake] = useState<Letter | null>(null);
  /** the place that is lit while the finished word is sounded out */
  const [spot, setSpot] = useState<number | null>(null);
  const [joined, setJoined] = useState(false);
  const [fly, setFly] = useState<{ dx: number; dy: number } | null>(null);
  const [party, setParty] = useState(0);
  const [heard, setHeard] = useState(0);
  const [drag, setDrag] = useState<{ letter: Letter; dx: number; dy: number; over: boolean } | null>(
    null,
  );

  const catRef = useRef<HTMLDivElement>(null);
  const matRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const alive = useRef(true);
  /** bumped whenever a new chain of sounds takes over; an old chain then stops */
  const run = useRef(0);
  const timers = useRef<number[]>([]);
  const idleTimer = useRef<number | undefined>(undefined);
  const holdTimer = useRef<number | undefined>(undefined);
  const voiceTimer = useRef<number | undefined>(undefined);
  const reactionBag = useRef<Reaction[]>([]);
  const grabRef = useRef<{ letter: Letter; x: number; y: number; id: number; moved: boolean } | null>(
    null,
  );
  const onMoveRef = useRef<(e: PointerEvent) => void>(() => {});
  const onUpRef = useRef<(e: PointerEvent) => void>(() => {});

  const sleep = useCallback(
    (ms: number) =>
      new Promise<void>((resolve) => {
        timers.current.push(window.setTimeout(resolve, ms));
      }),
    [],
  );
  const live = (id: number) => alive.current && run.current === id;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      timers.current.forEach(clearTimeout);
      clearTimeout(idleTimer.current);
      clearTimeout(holdTimer.current);
      clearTimeout(voiceTimer.current);
      audio.stopVoice();
    };
  }, []);

  useEffect(() => {
    const move = (e: PointerEvent) => onMoveRef.current(e);
    const up = (e: PointerEvent) => onUpRef.current(e);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, []);

  const cur = () => s.placed.indexOf(false);

  /* -------- a word: say what the cat wants, then ask for the first sound -------- */
  const startWord = useCallback(
    async (task: Task, first: boolean) => {
      const id = ++run.current;
      s.task = task;
      s.placed = [...task.placed];
      s.pieces = [...task.pieces];
      s.phase = 'intro';
      s.slotMisses = 0;
      s.wordMisses = 0;
      s.busy = true;
      s.recent = [...s.recent, task.word.word].slice(-3);
      setPieceState({});
      setSpot(null);
      setJoined(false);
      setFly(null);
      setMood('idle');
      setReaction(null);
      draw();

      await sleep(LEAD_MS);
      if (!live(id)) return;
      if (first) {
        await audio.speak(['cat/greet', 500, 'ui/make-word', 350]);
        if (!live(id)) return;
      }
      await sayWord(task.word.clip, task.word.word);
      if (!live(id)) return;
      await sleep(450);
      if (!live(id)) return;

      s.phase = 'build';
      s.busy = false;
      draw();
      const l = task.word.letters[cur()];
      void audio.speak(slotPrompt(l), slotFallback(l));
      setHeard((n) => n + 1);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draw, sleep],
  );

  useEffect(() => {
    void startWord(s.task, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const askAgain = useCallback(() => {
    if (s.phase !== 'build' || s.busy) return;
    const l = s.task.word.letters[s.placed.indexOf(false)];
    void audio.speak(slotPrompt(l), slotFallback(l));
    setHeard((n) => n + 1);
  }, [s]);

  /** the picture beside the cat says the whole word, as often as he likes */
  const sayOrder = () => {
    if (s.phase !== 'build' || s.busy) return;
    audio.unlock();
    const id = ++run.current;
    void (async () => {
      await sayWord(s.task.word.clip, s.task.word.word);
      if (!live(id) || s.phase !== 'build') return;
      await sleep(350);
      if (live(id)) askAgain();
    })();
  };

  // ask again if he has gone quiet
  useEffect(() => {
    clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(askAgain, IDLE_NUDGE_MS);
    return () => clearTimeout(idleTimer.current);
  }, [heard, askAgain]);

  const dealReaction = (): Reaction => {
    if (!reactionBag.current.length) reactionBag.current = shuffled(REACTIONS);
    return reactionBag.current.pop()!;
  };

  /* -------- all three are down: sound it out, press it together, eat it -------- */
  const finish = async () => {
    const id = ++run.current;
    const { word } = s.task;
    s.phase = 'blend';
    s.busy = true;
    draw();
    await sleep(380);

    /* Each sound with its own piece lit, so he sees which letter is speaking.
       The gap is short on purpose: the three sounds have to be close enough
       together that the word can be heard hiding in them. */
    for (let i = 0; i < word.letters.length; i++) {
      if (!live(id)) return;
      setSpot(i);
      await audio.speak([`prompt/${word.letters[i]}`], slotFallback(word.letters[i]));
      if (!live(id)) return;
      await sleep(BLEND_GAP_MS);
    }
    if (!live(id)) return;
    setSpot(null);
    setJoined(true);
    audio.whoosh();
    await sleep(420);
    if (!live(id)) return;
    await sayWord(word.clip, word.word);
    if (!live(id)) return;
    audio.sparkle();
    setParty((n) => n + 1);
    await sleep(650);
    if (!live(id)) return;

    // up to the cat
    s.phase = 'eat';
    const c = catRef.current?.getBoundingClientRect();
    const m = matRef.current?.getBoundingClientRect();
    if (c && m) {
      setFly({
        dx: c.left + c.width * MUZZLE.x - (m.left + m.width / 2),
        dy: c.top + c.height * MUZZLE.y - (m.top + m.height / 2),
      });
    }
    setMood('anticipate');
    draw();
    await sleep(380);
    if (!live(id)) return;
    setMood('eating');
    audio.chomp();
    await audio.speak(['cat/nom']);
    if (!live(id)) return;

    const rx = dealReaction();
    setReaction(rx);
    setMood('happy');
    REACTION_SOUND[rx]();
    s.done = [...s.done, word];

    /* Two words in a row with no wrong piece and he builds more of the next
       one himself; three wrong pieces in one word and he builds less. */
    const clean = s.wordMisses === 0;
    s.cleanRun = clean ? s.cleanRun + 1 : 0;
    let next = s.level;
    if (s.cleanRun >= 2 && s.level < 3) {
      next = promote(s.level);
      s.cleanRun = 0;
    } else if (s.wordMisses >= 3 && s.level > 1) {
      next = demote(s.level);
    }
    if (next !== s.level) {
      s.level = next;
      onProfileChange((p) => ({ ...p, wordLevel: next }));
    }
    draw();

    void audio.oneShot('ui/made-word');
    await audio.speak([catSound(clean ? 'excited' : 'happy')]);
    if (!live(id)) return;

    if (s.done.length >= total) {
      setMood('asleep');
      audio.fanfare();
      await audio.speak(['ui/all-done', 'cat/yawn']);
      if (alive.current) onMealComplete(s.done.flatMap((w) => w.letters));
      return;
    }
    await sleep(600);
    if (!live(id)) return;
    void startWord(makeTask(profileRef.current, s.level, s.recent), false);
  };

  /* -------- he offers a piece for the place that is lit -------- */
  const attempt = (letter: Letter) => {
    if (s.phase !== 'build' || s.busy) return;
    audio.unlock();
    clearTimeout(idleTimer.current);
    const i = cur();
    const want = s.task.word.letters[i];

    if (letter === want) {
      const first = s.slotMisses === 0;
      const choices = s.pieces.length;
      /* with one piece left there was nothing to choose, so nothing to score */
      if (choices >= 2) onProfileChange((p) => recordAnswer(p, want, first, choices));
      s.slotMisses = 0;
      s.placed = s.placed.map((v, k) => (k === i ? true : v));
      s.pieces = s.pieces.filter((l) => l !== letter);
      setPieceState({});
      audio.tap();
      audio.twinkle();
      draw();

      const next = cur();
      if (next === -1) {
        void finish();
        return;
      }
      const id = ++run.current;
      s.busy = true;
      void (async () => {
        await sleep(420);
        if (!live(id)) return;
        s.busy = false;
        const l = s.task.word.letters[next];
        void audio.speak(slotPrompt(l), slotFallback(l));
        setHeard((n) => n + 1);
      })();
      return;
    }

    /* A wrong piece hops, says what it is, and the sound he was asked for comes
       back straight after — the two side by side, as in the letter game. */
    s.slotMisses++;
    s.wordMisses++;
    s.busy = true;
    onProfileChange((p) => recordConfusion(p, want, letter));
    setPieceState({ [letter]: 'hop' });
    audio.tap();
    const id = ++run.current;
    const hint = s.slotMisses >= 2;
    void (async () => {
      await audio.speak(
        [catSound('curious'), 220, `letter/${letter}`, STOPS.has(letter) ? 460 : 340, `prompt/${letter}`, 650],
        slotFallback(letter),
      );
      if (!live(id)) return;
      setPieceState(hint ? { [want]: 'hint' } : {});
      s.busy = false;
      void audio.speak(slotPrompt(want), slotFallback(want));
      setHeard((n) => n + 1);
    })();
  };

  /* -------- carrying a piece -------- */
  const sleepPiece = () => {
    clearTimeout(holdTimer.current);
    clearTimeout(voiceTimer.current);
    setAwake(null);
  };

  /** Anywhere from the mat upwards counts: he is aiming at the mat, or at the
      cat, and being fussy about which would test his hand and not his ear. */
  const overMat = (y: number) => {
    const m = matRef.current?.getBoundingClientRect();
    return !!m && y < m.bottom + 50;
  };

  const grab = (letter: Letter, e: React.PointerEvent) => {
    if (s.phase !== 'build' || s.busy) return;
    audio.unlock();
    clearTimeout(idleTimer.current);
    sleepPiece();
    grabRef.current = { letter, x: e.clientX, y: e.clientY, id: e.pointerId, moved: false };
    setDrag({ letter, dx: 0, dy: 0, over: false });
    holdTimer.current = window.setTimeout(() => {
      setAwake(letter);
      const say = () => {
        void audio.oneShot(`prompt/${letter}`, 0.9);
        voiceTimer.current = window.setTimeout(say, PIECE_VOICE_MS);
      };
      say();
    }, HOLD_WAKE_MS);
  };

  onMoveRef.current = (e: PointerEvent) => {
    const gr = grabRef.current;
    if (!gr || e.pointerId !== gr.id) return;
    const dx = e.clientX - gr.x;
    const dy = e.clientY - gr.y;
    if (Math.hypot(dx, dy) > 8) gr.moved = true;
    setDrag({ letter: gr.letter, dx, dy, over: gr.moved && overMat(e.clientY) });
  };

  onUpRef.current = (e: PointerEvent) => {
    const gr = grabRef.current;
    if (!gr || e.pointerId !== gr.id) return;
    grabRef.current = null;
    setDrag(null);
    sleepPiece();
    /* A tap is an answer here, as well as a carry. In the letter game a tap is
       turned away, because there he is choosing between pieces and a tap is how
       a child bats at the nearest one. Here the place on the mat is lit and
       asking, and tapping the piece for it is a fair way to say "this one". A
       piece carried off and put down on the counter again is not an answer. */
    if (!gr.moved || overMat(e.clientY)) attempt(gr.letter);
    else setHeard((n) => n + 1);
  };

  const fullness = s.done.length / total;
  const wear = useMemo(() => wornBy(profile), [profile]);
  const lower = profile.settings.letterCase === 'lower';
  const lit = s.phase === 'build' ? cur() : spot;
  const canPick = s.phase === 'build' && !s.busy;

  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden"
      data-phase={s.phase}
      data-word={s.task.word.word}
      data-level={s.level}
    >
      <HomeButton onHome={onExit} />

      <div className="relative min-h-0 flex-1">
        <Restaurant unlocked={profile.decorations} dim />

        <div className="pointer-events-none relative z-20 flex h-full flex-col items-center justify-end gap-[clamp(2px,1vh,10px)] pb-[clamp(76px,12vh,124px)]">
          {party > 0 && <Confetti key={party} count={16} />}

          <div
            ref={catRef}
            className="relative h-[clamp(110px,25vh,270px)] w-[clamp(138px,30vh,320px)] shrink"
          >
            <Cat fullness={fullness} mood={mood} reaction={reaction} wear={wear} />
            {/* what he ordered — press it to hear the word again */}
            <button
              type="button"
              aria-label="hear the word"
              onPointerDown={sayOrder}
              className={`pointer-events-auto absolute top-0 left-[88%] grid h-[clamp(72px,17vmin,150px)] w-[clamp(72px,17vmin,150px)] place-items-center rounded-[28%] border-4 border-white bg-rice/95 p-[clamp(5px,1.2vmin,10px)] shadow-[0_6px_0_rgba(0,0,0,0.22)] active:scale-95 ${
                joined ? 'roll-cheer' : 'cat-pop'
              }`}
              key={s.task.word.word}
            >
              <Picture name={s.task.word.word} className="h-full w-full" />
            </button>
          </div>

          {/* words made so far, as little rolls */}
          <div
            role="img"
            aria-label={`${s.done.length} of ${total} words`}
            className="flex items-center justify-center gap-2"
          >
            {Array.from({ length: total }, (_, i) => (
              <span
                key={i}
                className={`grid h-[clamp(16px,2.8vmin,26px)] w-[clamp(16px,2.8vmin,26px)] place-items-center rounded-full ${
                  s.done[i] ? 'plate-pop bg-nori ring-2 ring-rice' : 'bg-white/30'
                }`}
              >
                {s.done[i] && <span className="h-1/2 w-1/2 rounded-full bg-salmon" />}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-[clamp(8px,2vw,20px)]">
            {/* the mat: three places, filled left to right */}
            <div
              ref={matRef}
              data-mat
              className="roll-mat flex items-center rounded-2xl p-[clamp(5px,1.2vmin,10px)]"
              style={{
                gap: joined ? 0 : 'clamp(5px, 1.4vmin, 12px)',
                transition: fly
                  ? 'transform 440ms cubic-bezier(0.5, 0, 0.75, 0), opacity 440ms ease-in, gap 300ms ease'
                  : 'gap 300ms ease',
                transform: fly ? `translate(${fly.dx}px, ${fly.dy}px) scale(0.2)` : undefined,
                opacity: fly ? 0 : 1,
              }}
            >
              {s.task.word.letters.map((l, i) => {
                const filled = s.placed[i];
                const glyph = lower ? l.toLowerCase() : l;
                return filled ? (
                  <button
                    key={i}
                    type="button"
                    aria-label={`place ${i + 1}: ${l}`}
                    onPointerDown={() => {
                      audio.unlock();
                      if (canPick) void audio.oneShot(`prompt/${l}`);
                    }}
                    className={`roll-tile pointer-events-auto plate-pop ${lit === i ? 'roll-tile-lit' : ''} ${
                      joined ? 'roll-tile-joined' : ''
                    }`}
                    style={{ ['--topping' as string]: TOPPING_COLORS[LETTERS[l].topping].fill }}
                  >
                    {glyph}
                  </button>
                ) : (
                  <span
                    key={i}
                    role="img"
                    aria-label={`place ${i + 1}: empty`}
                    className={`roll-tile roll-tile-empty ${lit === i ? 'roll-tile-ask' : ''}`}
                  />
                );
              })}
            </div>

            <button
              type="button"
              aria-label="say it again"
              onPointerDown={() => {
                audio.unlock();
                askAgain();
              }}
              className="pointer-events-auto relative grid h-[clamp(48px,8vh,72px)] w-[clamp(48px,8vh,72px)] shrink-0 place-items-center rounded-full bg-nori/40 active:scale-95"
            >
              <span className="pulse-ring absolute inset-0 rounded-full border-4 border-tamago/40" />
              <svg viewBox="0 0 24 24" className="h-1/2 w-1/2 fill-rice">
                <path d="M4 9v6h4l5 4V5L8 9H4z" />
                <path
                  d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"
                  fill="none"
                  strokeWidth="2"
                  strokeLinecap="round"
                  className="stroke-rice"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* the counter, with the pieces to choose from */}
      <div className="relative h-[clamp(78px,13vh,132px)] shrink-0" style={{ zIndex: drag ? 40 : 10 }}>
        <Counter />
        <div className="pointer-events-none absolute inset-x-0 bottom-[34%] flex items-end justify-center gap-[clamp(8px,2.5vw,32px)] px-3">
          {s.pieces.map((l, i) => (
            <div
              key={`${s.task.word.word}-${l}`}
              className="pointer-events-auto"
              style={{
                opacity: s.phase === 'intro' ? 0 : 1,
                transform: s.phase === 'intro' ? 'translateY(18px) scale(0.9)' : 'none',
                transition: 'opacity 260ms ease, transform 260ms ease',
              }}
            >
              <Sushi
                letter={l}
                glyph={glyphFor(profile, l)}
                index={i}
                state={pieceState[l] ?? 'rest'}
                disabled={!canPick}
                drag={drag?.letter === l ? { dx: drag.dx, dy: drag.dy } : null}
                over={drag?.letter === l ? drag.over : false}
                alive={awake === l}
                onGrab={(e) => grab(l, e)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
