import { useCallback, useEffect, useRef, useState } from 'react';
import { Cat, type CoatName, type Mood } from '../components/Cat';
import { Confetti } from '../components/Confetti';
import { HomeButton } from '../components/HomeButton';
import {
  audio,
  catSound,
  fallbackIdentify,
  fallbackPrompt,
  identifyClips,
  promptClips,
  randomPraise,
} from '../game/audio';
import { demote, nextRound, promote } from '../game/engine';
import type { Letter } from '../game/letters';
import { recordAnswer, recordConfusion } from '../game/store';
import type { Level, Profile, Round } from '../game/types';

interface Props {
  profile: Profile;
  onProfileChange: (updater: (p: Profile) => Profile) => void;
  onMealComplete: (done: Letter[]) => void;
  onExit: () => void;
}

/* The kitty cafe: peek-a-boo in the teacups.

   Cats pop up out of big teacups, one or two at a time, each holding up a card
   with its letter on it, and duck back down a moment later. He hears a sound
   and catches the cat holding that letter by tapping it. The cat he catches
   jumps out of its cup and joins the row of friends along the top; a meal's
   worth of friends and the visit is over.

   The first version was a row of cats sitting still on cushions. Nothing moved
   and nothing said what to do, so it was both dull and unclear. Here something
   is always happening, the thing to do is obvious (catch the cat), and the
   letter is the only way to tell which cat to catch.

   It is still the same lesson as the sushi: the same rounds, weighting, record
   of mix-ups and level changes. Nothing is timed against him. A cat that ducks
   back down before he gets to it just comes up again, and the right one always
   comes up again soon. A wrong cat is not refused: it stops, says its own letter
   so he hears the two side by side, and ducks back down. */

const PROMPT_LEAD_MS = 450;
const ROUND_GAP_MS = 700;
const GREETING: Array<string | number> = ['cat/greet', 700];
const IDLE_NUDGE_MS = 8000;
/** how long a cat stays up before it ducks down again */
const STAY_MS: Record<Level, number> = { 1: 3000, 2: 2700, 3: 2400 };
/** a cat he has been shown the way to stays up much longer */
const HINT_STAY_MS = 6000;
/** the quiet between one cat ducking and the next one popping up */
const POP_GAP_MS = [500, 1000];
const RISE_MS = 380;
const SINK_MS = 320;
/** the caught cat purrs in his hand before it jumps out */
const PURR_MS = 1200;
/** in the first round of a visit, a hand points at the right cat after this long */
const HAND_AFTER_MS = 1300;

/** the cafe starts with three cats and one more comes to live there after each meal */
const COAT_ORDER: CoatName[] = ['ginger', 'grey', 'siamese', 'tabby', 'cream', 'calico'];
const coatsFor = (meals: number) => COAT_ORDER.slice(0, Math.min(COAT_ORDER.length, 3 + meals));

type PopState = 'up' | 'caught' | 'curious' | 'sinking' | 'leaping';

interface Pop {
  id: number;
  letter: Letter;
  coat: CoatName;
  state: PopState;
  hint: boolean;
}

const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

export function Cafe({ profile, onProfileChange, onMealComplete, onExit }: Props) {
  const total = profile.settings.roundsPerMeal;

  const [level, setLevel] = useState<Level>(profile.level);
  const [round, setRound] = useState<Round>(() => nextRound(profile, profile.level, []));
  const [cups, setCups] = useState<Array<Pop | null>>(() => Array(3).fill(null));
  const [friends, setFriends] = useState<Array<{ letter: Letter; coat: CoatName }>>([]);
  const [hand, setHand] = useState<number | null>(null);
  const [party, setParty] = useState(0);
  const [heard, setHeard] = useState(0);

  /* The popping runs on refs, not state: it is a loop of timers that has to
     read the latest cups and the latest round from inside callbacks that were
     created several rounds ago. State is only what gets drawn. */
  const cupsRef = useRef(cups);
  cupsRef.current = cups;
  const roundRef = useRef(round);
  roundRef.current = round;
  const levelRef = useRef(level);
  levelRef.current = level;
  /** true while the game is talking or a catch is being celebrated: no new cats */
  const paused = useRef(true);
  /** true while a cat he tapped is being dealt with: no more taps */
  const busy = useRef(true);
  const misses = useRef(0);
  const streak = useRef(0);
  const sinceTarget = useRef(0);
  const hintNext = useRef(false);
  const nextId = useRef(1);
  const doneRef = useRef<Array<{ letter: Letter; coat: CoatName }>>([]);
  const recentTargets = useRef<Letter[]>([]);
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const timers = useRef<number[]>([]);
  const popTimer = useRef<number | undefined>(undefined);
  const idleTimer = useRef<number | undefined>(undefined);
  const alive = useRef(true);
  /** true from a right catch until the next round opens: the question is answered */
  const answered = useRef(false);

  const after = useCallback((ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      timers.current.forEach(clearTimeout);
      clearTimeout(popTimer.current);
      clearTimeout(idleTimer.current);
      audio.stopVoice();
    };
  }, []);

  const setCup = useCallback((i: number, pop: Pop | null) => {
    const next = [...cupsRef.current];
    next[i] = pop;
    cupsRef.current = next;
    setCups(next);
  }, []);

  const patchPop = useCallback(
    (id: number, patch: Partial<Pop>) => {
      const i = cupsRef.current.findIndex((p) => p?.id === id);
      if (i >= 0) setCup(i, { ...cupsRef.current[i]!, ...patch });
    },
    [setCup],
  );

  /** a cat ducks back into its cup, and the cup is empty once it is gone */
  const sink = useCallback(
    (id: number) => {
      const i = cupsRef.current.findIndex((p) => p?.id === id);
      if (i < 0) return;
      setCup(i, { ...cupsRef.current[i]!, state: 'sinking' });
      after(SINK_MS, () => {
        if (cupsRef.current[i]?.id === id) setCup(i, null);
      });
    },
    [after, setCup],
  );

  const sinkAll = useCallback(
    (except?: number) => {
      cupsRef.current.forEach((p) => {
        if (p && p.id !== except && p.state === 'up') sink(p.id);
      });
    },
    [sink],
  );

  /* -------- the popping loop -------- */
  const popOne = useCallback(() => {
    if (!alive.current || paused.current) return;
    const r = roundRef.current;
    const cupsNow = cupsRef.current;
    const up = cupsNow.filter(Boolean) as Pop[];
    /* One cat at a time while he is starting out, so there is never a choice
       of where to look; two at once as he gets better. */
    const maxUp = levelRef.current === 1 ? 1 : 2;
    const empty = cupsNow.map((p, i) => (p ? -1 : i)).filter((i) => i >= 0);

    if (up.length < maxUp && empty.length) {
      const showing = new Set(up.map((p) => p.letter));
      const hint = hintNext.current;
      /* The right cat comes up often, and never more than two cats go by
         without it. */
      const wantTarget =
        hint || (!showing.has(r.target) && (sinceTarget.current >= 2 || Math.random() < 0.45));
      const others = r.options.filter((l) => l !== r.target && !showing.has(l));
      const letter = wantTarget || !others.length ? r.target : pick(others);

      if (!showing.has(letter)) {
        sinceTarget.current = letter === r.target ? 0 : sinceTarget.current + 1;
        if (hint && letter === r.target) hintNext.current = false;
        const usedCoats = new Set(up.map((p) => p.coat));
        const pool = coatsFor(profileRef.current.mealsCompleted);
        const coat = pick(pool.filter((c) => !usedCoats.has(c)).length ? pool.filter((c) => !usedCoats.has(c)) : pool);
        const id = nextId.current++;
        const cup = pick(empty);
        setCup(cup, { id, letter, coat, state: 'up', hint: hint && letter === r.target });
        audio.tap();

        // the first round of a visit: if he has not caught on, a hand shows him
        if (doneRef.current.length === 0 && letter === r.target) {
          after(HAND_AFTER_MS, () => {
            const p = cupsRef.current.find((c) => c?.id === id);
            if (p && p.state === 'up' && !busy.current) setHand(id);
          });
        }

        const stay = hint && letter === r.target ? HINT_STAY_MS : STAY_MS[levelRef.current];
        after(RISE_MS + stay, () => {
          const p = cupsRef.current.find((c) => c?.id === id);
          if (p && p.state === 'up') {
            setHand((h) => (h === id ? null : h));
            sink(id);
          }
        });
      }
    }

    const [lo, hi] = POP_GAP_MS;
    clearTimeout(popTimer.current);
    popTimer.current = window.setTimeout(popOne, lo + Math.random() * (hi - lo));
  }, [after, setCup, sink]);

  const resume = useCallback(() => {
    paused.current = false;
    busy.current = false;
    // he has just heard the question, so the idle clock starts again from here
    setHeard((n) => n + 1);
    clearTimeout(popTimer.current);
    popTimer.current = window.setTimeout(popOne, 250);
  }, [popOne]);

  /* The cats stay in their cups until the question has been asked in full, so
     there is nothing to tap while it is still being said — the cafe always
     waits for the prompt, whatever the parent setting says, because a cat that
     pops up mid-question pulls his eyes away from listening.

     If the sound never finishes (the iPad has suspended audio, a clip is
     missing), the cats come out anyway after `maxMs`: waiting for the prompt
     must never mean a cafe where nothing happens. Each ask has a number, and a
     late finish from an old ask does nothing — otherwise the end of an earlier
     question could let the cats out again while a caught one is still purring. */
  const askSeq = useRef(0);
  const askThenResume = useCallback(
    (items: Array<string | number>, fallback: () => void, maxMs: number) => {
      const seq = ++askSeq.current;
      const go = () => {
        if (seq !== askSeq.current || !alive.current) return;
        askSeq.current++;
        resume();
      };
      after(maxMs, go);
      void audio.speak(items, fallback).then(go);
    },
    [after, resume],
  );

  /* -------- a round: ask, then let the cats out -------- */
  const beginRound = useCallback(
    (r: Round, intro: Array<string | number> = []) => {
      roundRef.current = r;
      answered.current = false;
      setRound(r);
      const holes = Math.max(3, r.options.length);
      cupsRef.current = Array(holes).fill(null);
      setCups(cupsRef.current);
      paused.current = true;
      busy.current = true;
      misses.current = 0;
      hintNext.current = false;
      /* the right cat is the first one up in the very first round, so the
         first thing that happens in the cafe is something he can get right */
      sinceTarget.current = doneRef.current.length === 0 ? 2 : 1;
      setHand(null);
      recentTargets.current = [...recentTargets.current, r.target].slice(-4);

      after(PROMPT_LEAD_MS, () =>
        askThenResume([...intro, ...promptClips(r)], fallbackPrompt(r), intro.length ? 7000 : 4500),
      );
    },
    [after, askThenResume],
  );

  useEffect(() => {
    beginRound(round, GREETING);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sayAgain = useCallback(() => {
    /* Not while the caught cat is being celebrated: that question has been
       answered, and asking it again would say the old letter. */
    if (answered.current) return;
    void audio.speak(promptClips(roundRef.current), fallbackPrompt(roundRef.current));
    setHeard((n) => n + 1);
  }, []);

  // ask again if he has gone quiet
  useEffect(() => {
    clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => {
      if (!busy.current) sayAgain();
    }, IDLE_NUDGE_MS);
    return () => clearTimeout(idleTimer.current);
  }, [round, heard, friends, sayAgain]);

  /* -------- he taps a cat -------- */
  const tapCat = (pop: Pop) => {
    if (busy.current || pop.state !== 'up') return;
    audio.unlock();
    busy.current = true;
    paused.current = true;
    askSeq.current++; // a question still being asked must not let the cats out now
    clearTimeout(popTimer.current);
    setHand(null);
    const r = roundRef.current;

    if (pop.letter === r.target) {
      answered.current = true;
      patchPop(pop.id, { state: 'caught' });
      sinkAll(pop.id);
      void audio.oneShot('cat/purr', 0.9);
      audio.happy();

      const first = misses.current === 0;
      const nextStreak = first ? streak.current + 1 : 0;
      streak.current = nextStreak;
      let nextLevel = levelRef.current;
      if (first && nextStreak % 3 === 0 && nextLevel < 3) nextLevel = promote(nextLevel);

      after(PURR_MS, async () => {
        // out of the cup and up to join his friends along the top
        patchPop(pop.id, { state: 'leaping' });
        audio.sparkle();
        const done = [...doneRef.current, { letter: pop.letter, coat: pop.coat }];
        doneRef.current = done;
        after(420, () => setFriends(done));

        onProfileChange((p) => recordAnswer(p, r.target, first));
        if (nextLevel !== levelRef.current) {
          levelRef.current = nextLevel;
          setLevel(nextLevel);
          onProfileChange((p) => ({ ...p, level: nextLevel }));
        }
        if (nextStreak >= 5 && nextStreak % 5 === 0) setParty((n) => n + 1);
        if (Math.random() < 0.35) void audio.oneShot(randomPraise());
        await audio.speak([catSound(nextStreak >= 3 ? 'excited' : 'happy')]);
        if (!alive.current) return;

        if (done.length >= total) {
          audio.fanfare();
          setParty((n) => n + 1);
          await audio.speak(['ui/all-done', 'cat/yawn']);
          if (alive.current) onMealComplete(done.map((d) => d.letter));
          return;
        }
        after(ROUND_GAP_MS, () =>
          beginRound(nextRound(profileRef.current, levelRef.current, recentTargets.current)),
        );
      });
      return;
    }

    /* A wrong cat stops, looks at him, and says its own letter. Then it ducks
       down and the question comes back. */
    const m = misses.current + 1;
    misses.current = m;
    streak.current = 0;
    patchPop(pop.id, { state: 'curious' });
    sinkAll(pop.id);
    onProfileChange((p) => recordConfusion(p, r.target, pop.letter));
    if (m >= 2) {
      // from the second miss on, the right cat comes up next and glows
      hintNext.current = true;
      sinceTarget.current = 2;
      if (levelRef.current > 1) {
        const down = demote(levelRef.current);
        levelRef.current = down;
        setLevel(down);
        onProfileChange((p) => ({ ...p, level: down }));
      }
    }

    after(150, async () => {
      await audio.speak(
        [catSound('curious'), 240, ...identifyClips(r, pop.letter)],
        fallbackIdentify(r, pop.letter),
      );
      if (!alive.current) return;
      sink(pop.id);
      askThenResume([450, ...promptClips(r)], fallbackPrompt(r), 5000);
    });
  };

  const moodFor = (s: PopState): Mood =>
    s === 'curious' ? 'sniff' : s === 'caught' || s === 'leaping' ? 'happy' : 'idle';

  const holes = cups.length;
  const size = `min(${Math.floor(92 / holes)}vw, 36vh, 300px)`;

  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden"
      style={{
        /* a warm little cafe: rose wallpaper with a dot pattern */
        background:
          'radial-gradient(circle at 20px 20px, rgba(255,255,255,0.07) 3px, transparent 4px) 0 0 / 40px 40px, linear-gradient(180deg, #6E3B4E 0%, #4A2636 70%, #3A1D2A 100%)',
      }}
    >
      <HomeButton onHome={onExit} />
      <CafeWall />
      {party > 0 && <Confetti key={party} count={20} />}

      {/* his new friends, one cushion per round */}
      <div className="relative z-20 flex flex-col items-center gap-2 px-[clamp(72px,9vw,88px)] pt-3">
        <div
          role="img"
          aria-label={`${friends.length} of ${total} friends`}
          className="flex flex-wrap items-center justify-center gap-[clamp(4px,1vw,10px)]"
        >
          {Array.from({ length: total }, (_, i) => {
            const f = friends[i];
            return (
              <span
                key={i}
                className="grid h-[clamp(24px,min(7vh,6.5vw),64px)] w-[clamp(24px,min(7vh,6.5vw),64px)] place-items-center rounded-full bg-black/25"
              >
                {f && (
                  <span className="cafe-friend block h-[118%] w-[118%]">
                    <Cat fullness={0} mood="happy" coat={f.coat} chef={false} />
                  </span>
                )}
              </span>
            );
          })}
        </div>

        <button
          type="button"
          aria-label="say it again"
          onPointerDown={() => {
            audio.unlock();
            sayAgain();
          }}
          className="relative grid h-[clamp(54px,8vh,72px)] w-[clamp(54px,8vh,72px)] place-items-center rounded-full bg-white/12 active:scale-95"
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

      {/* the teacups, on the cafe table */}
      <div className="relative z-10 flex min-h-0 flex-1 items-end justify-center gap-[clamp(4px,2vw,32px)] px-2">
        {cups.map((pop, i) => (
          <div key={i} className="relative flex flex-col items-center" style={{ width: size }}>
            {/* everything above the rim: the cat and its card rise out of here */}
            <div
              className="relative w-full overflow-hidden"
              style={{ height: `calc(${size} * 1.5)` }}
            >
              {pop && (
                <button
                  type="button"
                  aria-label={`cat ${pop.letter}`}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    tapCat(pop);
                  }}
                  className={`cafe-pop absolute inset-x-0 bottom-0 flex flex-col items-center border-0 bg-transparent p-0 ${
                    pop.state === 'sinking'
                      ? 'cafe-sink'
                      : pop.state === 'leaping'
                        ? 'cafe-leap'
                        : 'cafe-rise'
                  }`}
                  style={{ touchAction: 'none', height: `calc(${size} * 1.5)` }}
                >
                  {/* the card the cat holds up — the letter is the whole question */}
                  <span
                    className={`grid place-items-center rounded-2xl border-[4px] border-[#3A2F2C] bg-rice font-extrabold text-nori leading-none shadow-[0_4px_0_rgba(0,0,0,0.25)] ${
                      pop.hint ? 'sushi-hint' : ''
                    } ${pop.state === 'caught' ? 'cafe-card-happy' : ''}`}
                    style={{
                      width: `calc(${size} * 0.46)`,
                      height: `calc(${size} * 0.46)`,
                      fontSize: `calc(${size} * 0.34)`,
                      transform: `rotate(${pop.id % 2 ? -4 : 4}deg)`,
                      /* held up just over his ears, so it reads as his card */
                      marginBottom: `calc(${size} * -0.1)`,
                      position: 'relative',
                      zIndex: 1,
                    }}
                  >
                    {pop.letter}
                  </span>
                  <span className="block w-full" style={{ height: `calc(${size} * 0.84)` }}>
                    <Cat
                      fullness={0}
                      mood={moodFor(pop.state)}
                      petting={pop.state === 'caught'}
                      coat={pop.coat}
                      chef={false}
                    />
                  </span>
                  {hand === pop.id && (
                    <span className="cafe-hand pointer-events-none absolute text-[clamp(40px,7vh,64px)]" style={{ top: '38%', right: '-4%' }}>
                      👆
                    </span>
                  )}
                </button>
              )}
            </div>

            {/* the cup's front, drawn over the bottom of the cat */}
            <svg
              viewBox="0 0 200 110"
              className="pointer-events-none relative z-10 w-[112%]"
              style={{ marginTop: `calc(${size} * -0.3)` }}
            >
              <ellipse cx="100" cy="100" rx="96" ry="10" fill="rgba(0,0,0,0.3)" />
              <ellipse cx="100" cy="96" rx="92" ry="12" fill="#F4E6D8" stroke="#3A2F2C" strokeWidth="3" />
              <path
                d="M 176 30 q 26 0 24 22 q -2 22 -30 26"
                fill="none"
                stroke="#3A2F2C"
                strokeWidth="14"
                strokeLinecap="round"
              />
              <path
                d="M 176 30 q 26 0 24 22 q -2 22 -30 26"
                fill="none"
                stroke={CUP_COLORS[i % CUP_COLORS.length]}
                strokeWidth="8"
                strokeLinecap="round"
              />
              <path
                d="M 14 14 H 186 Q 184 72 150 88 H 50 Q 16 72 14 14 Z"
                fill={CUP_COLORS[i % CUP_COLORS.length]}
                stroke="#3A2F2C"
                strokeWidth="3.5"
                strokeLinejoin="round"
              />
              <path d="M 40 40 q 60 16 120 0" fill="none" stroke="#FFFFFF" strokeWidth="5" opacity="0.35" strokeLinecap="round" />
              {/* a paw print on every cup */}
              <g fill="#FFFFFF" opacity="0.6">
                <ellipse cx="100" cy="62" rx="10" ry="8" />
                <circle cx="86" cy="49" r="4.2" />
                <circle cx="96" cy="44" r="4.2" />
                <circle cx="106" cy="44" r="4.2" />
                <circle cx="115" cy="49" r="4.2" />
              </g>
              <path d="M 14 14 H 186" stroke="#3A2F2C" strokeWidth="3.5" strokeLinecap="round" />
            </svg>
          </div>
        ))}
      </div>

      {/* the cafe table */}
      <div
        className="relative h-[clamp(36px,7vh,70px)] shrink-0"
        style={{ background: 'linear-gradient(180deg,#E3B98A 0 6px,#C8935E 6px,#9A6538 100%)' }}
      />
    </div>
  );
}

const CUP_COLORS = ['#F29BB0', '#8FD3C1', '#F7C744', '#9FB7F2'];

/** The back of the room: a round window with the sky in it and two lamps. */
function CafeWall() {
  return (
    <svg
      viewBox="0 0 400 300"
      preserveAspectRatio="xMidYMid meet"
      className="pointer-events-none absolute inset-x-0 top-[24%] mx-auto h-[40%] w-full opacity-80"
    >
      <circle cx="200" cy="150" r="92" fill="#3A1D2A" />
      <circle cx="200" cy="150" r="84" fill="#9FD6EA" />
      <ellipse cx="170" cy="120" rx="30" ry="12" fill="#FFFFFF" opacity="0.8" />
      <ellipse cx="236" cy="176" rx="36" ry="13" fill="#FFFFFF" opacity="0.7" />
      <circle cx="240" cy="108" r="16" fill="#F7C744" />
      <path d="M 200 66 V 234 M 116 150 H 284" stroke="#3A1D2A" strokeWidth="8" />
      {[60, 340].map((x) => (
        <g key={x}>
          <line x1={x} y1="0" x2={x} y2="70" stroke="#2A1520" strokeWidth="3" />
          <path d={`M ${x - 28} 98 Q ${x} 58 ${x + 28} 98 Z`} fill="#F7C744" />
          <ellipse cx={x} cy="100" rx="22" ry="6" fill="#FFF3C4" opacity="0.8" />
        </g>
      ))}
    </svg>
  );
}
