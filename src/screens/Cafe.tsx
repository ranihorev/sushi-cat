import { useCallback, useEffect, useRef, useState } from 'react';
import { Cat, type CoatName, type Mood } from '../components/Cat';
import { Confetti } from '../components/Confetti';
import { Plate } from '../components/Plate';
import { Counter, Restaurant } from '../components/Restaurant';
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

/* The kitty cafe. A row of cats, each wearing its letter on a tag, and he pats
   the one the question asks for. It is the same lesson as the sushi — the same
   rounds, the same weighting, the same record of what he mixes up — with the
   answer being a cat he strokes rather than food he carries.

   A wrong cat is not turned away from. It looks up, says its own letter, and the
   question comes back, so he hears the two side by side exactly as he does when
   the sushi cat sniffs a wrong piece. */

const PROMPT_LEAD_MS = 450;
const ROUND_GAP_MS = 600;
const RETRY_GAP_MS = 450;
const PURR_MS = 1300; // the right cat purrs this long before it says anything
const IDLE_NUDGE_MS = 7000;
const GREETING: Array<string | number> = ['cat/greet', 700];

/** the cafe starts with three cats and one more comes to live there after each meal */
const COAT_ORDER: CoatName[] = ['ginger', 'grey', 'siamese', 'tabby', 'cream', 'calico'];
const coatsFor = (meals: number) => COAT_ORDER.slice(0, Math.min(COAT_ORDER.length, 3 + meals));

type CatState = 'idle' | 'purr' | 'curious' | 'hint';

function shuffled<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** a coat for each cat in the round, all different while there are enough of them */
function dealCoats(n: number, meals: number): CoatName[] {
  const pool = shuffled(coatsFor(meals));
  return Array.from({ length: n }, (_, i) => pool[i % pool.length]);
}

export function Cafe({ profile, onProfileChange, onMealComplete, onExit }: Props) {
  const total = profile.settings.roundsPerMeal;

  const [level, setLevel] = useState<Level>(profile.level);
  const [round, setRound] = useState<Round>(() => nextRound(profile, profile.level, []));
  const [coats, setCoats] = useState<CoatName[]>(() =>
    dealCoats(round.options.length, profile.mealsCompleted),
  );
  const [done, setDone] = useState<Letter[]>([]);
  const [streak, setStreak] = useState(0);
  const [misses, setMisses] = useState(0);
  const [cats, setCats] = useState<Partial<Record<Letter, CatState>>>({});
  const [locked, setLocked] = useState(true);
  const [heard, setHeard] = useState(0);
  const [party, setParty] = useState(0);

  const timers = useRef<number[]>([]);
  const idleTimer = useRef<number | undefined>(undefined);
  const recentTargets = useRef<Letter[]>([]);
  const profileRef = useRef(profile);
  profileRef.current = profile;
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

  const speakPrompt = useCallback((r: Round) => {
    void audio.speak(promptClips(r), fallbackPrompt(r));
  }, []);

  const beginRound = useCallback(
    (r: Round, intro: Array<string | number> = []) => {
      setRound(r);
      setCoats(dealCoats(r.options.length, profileRef.current.mealsCompleted));
      setCats({});
      setMisses(0);
      setLocked(true);
      recentTargets.current = [...recentTargets.current, r.target].slice(-4);
      after(PROMPT_LEAD_MS, () => {
        void audio.speak([...intro, ...promptClips(r)], fallbackPrompt(r));
        setLocked(false);
      });
    },
    [after],
  );

  useEffect(() => {
    beginRound(round, GREETING);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // replay the question if he stalls
  useEffect(() => {
    if (locked) return;
    clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => speakPrompt(round), IDLE_NUDGE_MS);
    return () => clearTimeout(idleTimer.current);
  }, [round, locked, misses, heard, speakPrompt]);

  const pat = (letter: Letter) => {
    if (locked) return;
    audio.unlock();
    clearTimeout(idleTimer.current);
    setLocked(true);

    if (letter === round.target) {
      setCats({ [letter]: 'purr' });
      void audio.oneShot('cat/purr', 0.9);
      audio.happy();

      const first = misses === 0;
      const nextDone = [...done, letter];
      const nextStreak = first ? streak + 1 : 0;
      let nextLevel = level;
      if (first && nextStreak % 3 === 0 && level < 3) nextLevel = promote(level);

      after(PURR_MS, async () => {
        setDone(nextDone);
        onProfileChange((p) => recordAnswer(p, round.target, first));
        setStreak(nextStreak);
        if (nextLevel !== level) {
          setLevel(nextLevel);
          onProfileChange((p) => ({ ...p, level: nextLevel }));
        }
        if (nextStreak >= 3) audio.sparkle();
        if (nextStreak >= 5 && nextStreak % 5 === 0) setParty((n) => n + 1);
        if (Math.random() < 0.35) void audio.oneShot(randomPraise());
        await audio.speak([catSound(nextStreak >= 3 ? 'excited' : 'happy')]);
        if (!alive.current) return;

        if (nextDone.length >= total) {
          audio.fanfare();
          setParty((n) => n + 1);
          await audio.speak(['ui/all-done', 'cat/yawn']);
          if (alive.current) onMealComplete(nextDone);
          return;
        }
        after(ROUND_GAP_MS, () =>
          beginRound(nextRound(profileRef.current, nextLevel, recentTargets.current)),
        );
      });
      return;
    }

    /* The wrong cat looks up and says its own letter, then the question comes
       back. No sound of refusal: it is a cat being patted, and it liked it. */
    const m = misses + 1;
    setMisses(m);
    setStreak(0);
    setCats({ [letter]: 'curious' });
    onProfileChange((p) => recordConfusion(p, round.target, letter));
    if (m >= 2 && level > 1) {
      const down = demote(level);
      setLevel(down);
      onProfileChange((p) => ({ ...p, level: down }));
    }

    after(200, async () => {
      await audio.speak(
        [catSound('curious'), 260, ...identifyClips(round, letter)],
        fallbackIdentify(round, letter),
      );
      if (!alive.current) return;
      setCats(m >= 2 ? { [round.target]: 'hint' } : {});
      setLocked(false);
      void audio.speak([RETRY_GAP_MS, ...promptClips(round)], fallbackPrompt(round));
    });
  };

  const moodFor = (s: CatState | undefined): Mood =>
    s === 'curious' ? 'sniff' : s === 'purr' ? 'happy' : 'idle';

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      {/* parent escape hatch — long-press the corner, invisible to him */}
      <button
        type="button"
        aria-label="exit"
        onPointerDown={(e) => {
          const t = window.setTimeout(onExit, 900);
          const cancel = () => clearTimeout(t);
          e.currentTarget.addEventListener('pointerup', cancel, { once: true });
          e.currentTarget.addEventListener('pointerleave', cancel, { once: true });
        }}
        className="absolute top-0 left-0 z-30 h-16 w-16 opacity-0"
      />

      <div className="relative min-h-0 flex-1">
        <Restaurant unlocked={profile.decorations} dim fever={streak >= 3} />

        <div className="pointer-events-none relative z-20 flex h-full flex-col items-center justify-between pt-[clamp(12px,4vh,40px)] pb-2">
          {party > 0 && <Confetti key={party} count={20} />}

          <div className="flex flex-col items-center gap-2">
            <Plate eaten={done} total={total} />
            <button
              type="button"
              aria-label="say it again"
              onPointerDown={() => {
                audio.unlock();
                speakPrompt(round);
                setHeard((n) => n + 1);
              }}
              className="pointer-events-auto relative grid h-[clamp(54px,8vh,72px)] w-[clamp(54px,8vh,72px)] place-items-center rounded-full bg-white/12 active:scale-95"
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

          {/* the cats, each on its cushion, each wearing its letter */}
          <div className="flex min-h-0 flex-1 items-center justify-center gap-[clamp(4px,2vw,28px)] px-2">
            {round.options.map((l, i) => {
              const state = cats[l];
              const size = `min(${Math.floor(90 / round.options.length)}vw, 52vh, 340px)`;
              return (
                <button
                  key={`${round.target}-${l}-${i}`}
                  type="button"
                  aria-label={`cat ${l}`}
                  disabled={locked}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    pat(l);
                  }}
                  className="cafe-cat pointer-events-auto relative shrink-0 border-0 bg-transparent p-0"
                  style={{
                    /* as big as the row allows: four cats have to fit across a
                       portrait tablet, two can each take close to half of it */
                    width: size,
                    height: `calc(${size} * 0.93)`,
                    animationDelay: `${i * 90}ms`,
                    touchAction: 'none',
                  }}
                >
                  {/* cushion */}
                  <span className="absolute inset-x-[8%] bottom-0 h-[16%] rounded-[50%] bg-[#C0506A] shadow-[inset_0_-6px_0_rgba(0,0,0,0.2)]" />
                  <span className="absolute inset-0 bottom-[4%]">
                    <Cat
                      fullness={0.1}
                      mood={moodFor(state)}
                      petting={state === 'purr'}
                      coat={coats[i] ?? 'cream'}
                      chef={false}
                    />
                  </span>
                  {/* the letter tag on the collar */}
                  <span
                    className={`absolute left-1/2 top-[66%] grid -translate-x-1/2 place-items-center rounded-full border-[3px] border-[#3A2F2C] bg-tamago font-extrabold text-nori leading-none ${
                      state === 'hint' ? 'sushi-hint' : ''
                    }`}
                    style={{
                      width: `calc(${size} * 0.24)`,
                      height: `calc(${size} * 0.24)`,
                      fontSize: `calc(${size} * 0.16)`,
                    }}
                  >
                    {l}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="relative h-[clamp(40px,7vh,72px)] shrink-0">
        <Counter />
      </div>
    </div>
  );
}
