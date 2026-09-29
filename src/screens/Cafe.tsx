import { useCallback, useEffect, useRef, useState } from 'react';
import { Cat, type CoatName, type Mood } from '../components/Cat';
import { Confetti } from '../components/Confetti';
import { HomeButton } from '../components/HomeButton';
import { Bubbles, Bunting } from '../components/Restaurant';
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

   The cups rattle while the question is asked — somebody is hiding in there.
   Then every cat pops up at once, each holding up a big round card with its
   letter, and waits. He finds the cat with the letter he heard and taps it.
   That cat purrs, jumps out of its cup and joins the row of friends along the
   top, with its letter under it; a meal's worth of friends and the visit is
   over.

   The version before this one sent the cats up one at a time and ducked them
   back down on a timer. At the first level only one cat was ever up, so any
   tap was right and nothing was learned, and a cat that vanished just as he
   reached for it felt like being told off. Now nothing is timed against him,
   and every cat he can choose from is in front of him while he chooses.

   It is still the same lesson as the sushi: the same rounds, weighting, record
   of mix-ups and level changes. A wrong cat is not refused: it stops, says its
   own letter so he hears the two side by side, and then everybody ducks and
   pops up again in new cups, so the answer is the letter and not the place.
   After two misses the right card glows. */

const PROMPT_LEAD_MS = 450;
const ROUND_GAP_MS = 700;
const GREETING: Array<string | number> = ['cat/greet', 700];
const IDLE_NUDGE_MS = 8000;
/** the cats come up one after another, quickly, like popcorn */
const POP_STAGGER_MS = 160;
const SINK_MS = 320;
/** the caught cat purrs in his hand before it jumps out */
const PURR_MS = 1200;
/** in the first round of a visit, a hand points at the right cat after this long */
const HAND_AFTER_MS = 1600;

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

const shuffled = <T,>(arr: readonly T[]): T[] => {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

export function Cafe({ profile, onProfileChange, onMealComplete, onExit }: Props) {
  const total = profile.settings.roundsPerMeal;

  const [level, setLevel] = useState<Level>(profile.level);
  const [round, setRound] = useState<Round>(() => nextRound(profile, profile.level, []));
  const [cups, setCups] = useState<Array<Pop | null>>(() => Array(round.options.length).fill(null));
  const [friends, setFriends] = useState<Array<{ letter: Letter; coat: CoatName }>>([]);
  const [hand, setHand] = useState<number | null>(null);
  const [party, setParty] = useState(0);
  const [heard, setHeard] = useState(0);
  /** the question is being asked, and the cups rattle with the cats inside */
  const [asking, setAsking] = useState(true);

  /* The cups and the round live in refs as well as state: timers set up
     several beats ago have to read the latest of both. State is only what
     gets drawn. */
  const cupsRef = useRef(cups);
  cupsRef.current = cups;
  const roundRef = useRef(round);
  roundRef.current = round;
  const levelRef = useRef(level);
  levelRef.current = level;
  /** true while a cat he tapped is being dealt with, or no cats are up: no taps */
  const busy = useRef(true);
  const misses = useRef(0);
  const streak = useRef(0);
  const nextId = useRef(1);
  const doneRef = useRef<Array<{ letter: Letter; coat: CoatName }>>([]);
  const recentTargets = useRef<Letter[]>([]);
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const timers = useRef<number[]>([]);
  const idleTimer = useRef<number | undefined>(undefined);
  const alive = useRef(true);

  const after = useCallback((ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      timers.current.forEach(clearTimeout);
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
        if (p && p.id !== except && p.state !== 'sinking') sink(p.id);
      });
    },
    [sink],
  );

  /* -------- everybody up -------- */
  const popAll = useCallback(() => {
    if (!alive.current) return;
    const r = roundRef.current;
    const letters = shuffled(r.options);
    const pool = shuffled(coatsFor(profileRef.current.mealsCompleted));
    const hint = misses.current >= 2;
    letters.forEach((letter, i) => {
      after(i * POP_STAGGER_MS, () => {
        if (!alive.current || roundRef.current !== r) return;
        setCup(i, {
          id: nextId.current++,
          letter,
          coat: pool[i % pool.length],
          state: 'up',
          hint: hint && letter === r.target,
        });
        audio.tap();
      });
    });
    const allUp = letters.length * POP_STAGGER_MS;
    after(allUp, () => {
      if (roundRef.current === r) busy.current = false;
    });

    // the first round of a visit: if he has not caught on, a hand shows him
    if (doneRef.current.length === 0) {
      after(allUp + HAND_AFTER_MS, () => {
        const p = cupsRef.current.find((c) => c?.letter === r.target && c.state === 'up');
        if (p && !busy.current) setHand(p.id);
      });
    }
  }, [after, setCup]);

  const resume = useCallback(() => {
    setAsking(false);
    // he has just heard the question, so the idle clock starts again from here
    setHeard((n) => n + 1);
    popAll();
  }, [popAll]);

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
      setAsking(true);
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
      setRound(r);
      cupsRef.current = Array(r.options.length).fill(null);
      setCups(cupsRef.current);
      busy.current = true;
      misses.current = 0;
      setHand(null);
      setAsking(true);
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
    askSeq.current++; // a question still being asked must not let the cats out now
    setHand(null);
    const r = roundRef.current;

    if (pop.letter === r.target) {
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
        audio.boing();
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

    /* A wrong cat stops, looks at him, and says its own letter. Then everybody
       ducks, the question comes back, and they pop up again in new cups. */
    const m = misses.current + 1;
    misses.current = m;
    streak.current = 0;
    patchPop(pop.id, { state: 'curious' });
    onProfileChange((p) => recordConfusion(p, r.target, pop.letter));
    if (m >= 2 && levelRef.current > 1) {
      const down = demote(levelRef.current);
      levelRef.current = down;
      setLevel(down);
      onProfileChange((p) => ({ ...p, level: down }));
    }

    after(150, async () => {
      await audio.speak(
        [catSound('curious'), 240, ...identifyClips(r, pop.letter)],
        fallbackIdentify(r, pop.letter),
      );
      if (!alive.current) return;
      sinkAll();
      askThenResume([450, ...promptClips(r)], fallbackPrompt(r), 5000);
    });
  };

  const moodFor = (s: PopState): Mood =>
    s === 'curious' ? 'sniff' : s === 'caught' || s === 'leaping' ? 'happy' : 'idle';

  const holes = Math.max(cups.length, 2);
  /* Two cups are drawn bigger than four: at the first level there is room
     for them, and a bigger card is an easier letter to read. */
  const size = `min(${Math.floor(88 / holes)}vw, ${holes <= 2 ? 40 : 34}vh, 300px)`;

  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden"
      style={{
        /* a sweet-shop cafe: soft pink and cream stripes, lit from the window */
        background:
          'radial-gradient(90% 60% at 50% 30%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 70%), repeating-linear-gradient(90deg, #FFD6E4 0 38px, #FFE7EF 38px 76px)',
      }}
    >
      <HomeButton onHome={onExit} />
      <CafeWall />
      <Bunting top="0px" />
      <Bubbles />
      {party > 0 && <Confetti key={party} count={20} />}

      {/* his new friends, one cushion per round, each with the letter it held */}
      <div className="relative z-20 flex flex-col items-center gap-2 px-[clamp(72px,9vw,88px)] pt-[clamp(30px,5.5vh,52px)]">
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
                className="relative grid h-[clamp(28px,min(7vh,6.5vw),64px)] w-[clamp(28px,min(7vh,6.5vw),64px)] place-items-center rounded-full border-[3px] border-white bg-[#FFB8CF] shadow-[0_3px_0_rgba(59,42,58,0.18)]"
              >
                {f && (
                  <>
                    <span className="cafe-friend block h-[118%] w-[118%] -translate-y-[12%]">
                      <Cat fullness={0} mood="happy" coat={f.coat} chef={false} />
                    </span>
                    <span className="cafe-friend absolute -bottom-[34%] rounded-full border-2 border-white bg-berry px-[0.45em] text-[clamp(11px,1.9vh,17px)] leading-[1.35] font-bold text-white">
                      {f.letter}
                    </span>
                  </>
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
          className="bubble-btn relative mt-[clamp(4px,1.5vh,14px)] grid h-[clamp(58px,8.5vh,78px)] w-[clamp(58px,8.5vh,78px)] place-items-center rounded-full"
        >
          <span className="pulse-ring absolute inset-0 rounded-full border-4 border-white/80" />
          <svg viewBox="0 0 24 24" className="h-1/2 w-1/2 fill-berry">
            <path d="M4 9v6h4l5 4V5L8 9H4z" />
            <path
              d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"
              fill="none"
              strokeWidth="2"
              strokeLinecap="round"
              className="stroke-berry"
            />
          </svg>
        </button>
      </div>

      {/* the teacups, on the cafe table */}
      <div className="relative z-10 flex min-h-0 flex-1 items-end justify-center gap-[clamp(10px,4vw,56px)] px-2">
        {cups.map((pop, i) => {
          const color = CUP_COLORS[i % CUP_COLORS.length];
          return (
            <div key={i} className="relative flex flex-col items-center" style={{ width: size }}>
              {/* everything above the rim: the cat and its card rise out of here */}
              <div
                className="relative w-full overflow-hidden"
                style={{ height: `calc(${size} * 1.55)` }}
              >
                {!pop && <Steam />}
                {pop && (
                  <button
                    type="button"
                    aria-label={`cat ${pop.letter}`}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      tapCat(pop);
                    }}
                    className={`cafe-pop absolute inset-x-0 bottom-0 flex flex-col items-center justify-end border-0 bg-transparent p-0 ${
                      pop.state === 'sinking'
                        ? 'cafe-sink'
                        : pop.state === 'leaping'
                          ? 'cafe-leap'
                          : 'cafe-rise'
                    }`}
                    style={{ touchAction: 'none', height: `calc(${size} * 1.55)` }}
                  >
                    {/* the round card the cat holds up — the letter is the whole question */}
                    <span
                      className={`cafe-card grid place-items-center rounded-full border-white bg-white font-bold text-ink leading-none ${
                        pop.hint ? 'sushi-hint' : ''
                      } ${pop.state === 'caught' ? 'cafe-card-happy' : ''} ${
                        pop.state === 'curious' ? 'cafe-card-shake' : ''
                      }`}
                      style={{
                        width: `calc(${size} * 0.54)`,
                        height: `calc(${size} * 0.54)`,
                        fontSize: `calc(${size} * 0.38)`,
                        borderWidth: `calc(${size} * 0.035)`,
                        boxShadow: `0 0 0 calc(${size} * 0.03) ${color}, 0 calc(${size} * 0.045) 0 calc(${size} * 0.03) rgba(59,42,58,0.25)`,
                        transform: `rotate(${pop.id % 2 ? -5 : 5}deg)`,
                        /* held up just over his ears, so it reads as his card */
                        marginBottom: `calc(${size} * -0.08)`,
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
                      <span
                        className="cafe-hand pointer-events-none absolute text-[clamp(40px,7vh,64px)]"
                        style={{ top: '38%', right: '-4%' }}
                      >
                        👆
                      </span>
                    )}
                  </button>
                )}
              </div>

              {/* the cup's front, drawn over the bottom of the cat. It rattles
                  while the question is asked: somebody is in there. */}
              <svg
                viewBox="0 0 220 120"
                className={`pointer-events-none relative z-10 w-[118%] ${asking ? 'cafe-rattle' : ''}`}
                style={{
                  marginTop: `calc(${size} * -0.32)`,
                  animationDelay: `${i * 0.12}s`,
                }}
              >
                <ellipse cx="110" cy="110" rx="104" ry="10" fill="rgba(59,42,58,0.18)" />
                {/* saucer */}
                <ellipse cx="110" cy="104" rx="100" ry="13" fill="#FFFFFF" stroke="#4A3530" strokeWidth="3" />
                <ellipse cx="110" cy="101" rx="70" ry="6" fill={color} opacity="0.35" />
                {/* handle */}
                <path
                  d="M 186 32 q 30 0 28 24 q -2 24 -34 28"
                  fill="none"
                  stroke="#4A3530"
                  strokeWidth="15"
                  strokeLinecap="round"
                />
                <path
                  d="M 186 32 q 30 0 28 24 q -2 24 -34 28"
                  fill="none"
                  stroke={color}
                  strokeWidth="9"
                  strokeLinecap="round"
                />
                {/* the cup */}
                <path
                  d="M 20 16 H 200 Q 198 78 162 96 H 58 Q 22 78 20 16 Z"
                  fill={color}
                  stroke="#4A3530"
                  strokeWidth="3.5"
                  strokeLinejoin="round"
                />
                {/* white polka dots and a shine */}
                <g fill="#FFFFFF" opacity="0.55">
                  <circle cx="50" cy="40" r="6" />
                  <circle cx="170" cy="40" r="6" />
                  <circle cx="72" cy="72" r="5" />
                  <circle cx="148" cy="72" r="5" />
                </g>
                <path d="M 36 30 q 4 26 20 40" fill="none" stroke="#FFFFFF" strokeWidth="6" opacity="0.6" strokeLinecap="round" />
                {/* a heart on every cup */}
                <path
                  d="M 110 70 C 96 60, 92 52, 98 46 C 103 41, 108 44, 110 48 C 112 44, 117 41, 122 46 C 128 52, 124 60, 110 70 Z"
                  fill="#FFFFFF"
                  opacity="0.9"
                />
                <path d="M 20 16 H 200" stroke="#4A3530" strokeWidth="3.5" strokeLinecap="round" />
              </svg>
            </div>
          );
        })}
      </div>

      {/* the cafe table, with a checked cloth */}
      <div
        className="relative h-[clamp(40px,8vh,78px)] shrink-0 border-t-[5px] border-white"
        style={{
          backgroundColor: '#FFFFFF',
          backgroundImage:
            'linear-gradient(90deg, rgba(255,111,163,0.55) 50%, transparent 50%), linear-gradient(0deg, rgba(255,111,163,0.55) 50%, transparent 50%)',
          backgroundSize: '36px 36px',
        }}
      />
    </div>
  );
}

const CUP_COLORS = ['#FF9EC0', '#7FD8C4', '#FFD166', '#9DB8FF'];

/** Little curls of steam over an empty cup, so an empty cup is still a warm one. */
function Steam() {
  return (
    <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-x-[25%] bottom-[8%] h-[40%] w-[50%]" aria-hidden>
      <g stroke="#FFFFFF" strokeWidth="6" fill="none" strokeLinecap="round" opacity="0.85">
        <path className="cat-whiff" d="M 36 92 q -12 -14 0 -28 q 12 -14 0 -28" />
        <path className="cat-whiff cat-whiff-2" d="M 64 92 q 12 -14 0 -28 q -12 -14 0 -28" />
      </g>
    </svg>
  );
}

/** The back of the room: a round window with the sky in it, and two lamps. */
function CafeWall() {
  return (
    <svg
      viewBox="0 0 400 300"
      preserveAspectRatio="xMidYMid meet"
      className="pointer-events-none absolute inset-x-0 top-[26%] mx-auto h-[38%] w-full"
      aria-hidden
    >
      <circle cx="200" cy="150" r="94" fill="#FFFFFF" />
      <circle cx="200" cy="150" r="84" fill="#A8E4F7" />
      <ellipse cx="166" cy="118" rx="32" ry="13" fill="#FFFFFF" />
      <ellipse cx="236" cy="178" rx="38" ry="14" fill="#FFFFFF" opacity="0.9" />
      <circle cx="244" cy="106" r="17" fill="#FFD166" />
      {/* a rainbow through the window */}
      <g fill="none" strokeWidth="7" opacity="0.8">
        <path d="M 130 196 a 70 70 0 0 1 140 0" stroke="#FF8FB5" />
        <path d="M 137 196 a 63 63 0 0 1 126 0" stroke="#FFD166" />
        <path d="M 144 196 a 56 56 0 0 1 112 0" stroke="#7FD8C4" />
      </g>
      <path d="M 200 66 V 234 M 116 150 H 284" stroke="#FFFFFF" strokeWidth="8" />
      <circle cx="200" cy="150" r="88" fill="none" stroke="#FF8FB5" strokeWidth="6" />
      {[56, 344].map((x) => (
        <g key={x} className="deco-sway" style={{ transformOrigin: `${x}px 0px` }}>
          <line x1={x} y1="0" x2={x} y2="70" stroke="#C0708F" strokeWidth="3" />
          <path d={`M ${x - 30} 100 Q ${x} 56 ${x + 30} 100 Z`} fill="#FFD166" stroke="#FFFFFF" strokeWidth="3" />
          <ellipse cx={x} cy="102" rx="24" ry="6" fill="#FFF6C9" />
        </g>
      ))}
    </svg>
  );
}
