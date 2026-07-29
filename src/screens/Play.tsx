import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Cat, type Mood } from '../components/Cat';
import { Plate } from '../components/Plate';
import { Counter, Restaurant } from '../components/Restaurant';
import { Sushi, type PieceState } from '../components/Sushi';
import {
  audio,
  catSound,
  confirmClip,
  fallbackPrompt,
  promptClips,
  randomPraise,
  sayFallback,
} from '../game/audio';
import { demote, nextRound, optionCountFor, promote } from '../game/engine';
import type { Letter } from '../game/letters';
import { LETTERS } from '../game/letters';
import { recordAnswer, recordConfusion } from '../game/store';
import type { Level, Profile, Round } from '../game/types';

interface Props {
  profile: Profile;
  onProfileChange: (updater: (p: Profile) => Profile) => void;
  onMealComplete: (eaten: Letter[]) => void;
  onExit: () => void;
}

const IDLE_NUDGE_MS = 7000;

export function Play({ profile, onProfileChange, onMealComplete, onExit }: Props) {
  const total = profile.settings.roundsPerMeal;

  const [level, setLevel] = useState<Level>(profile.level);
  const [round, setRound] = useState<Round>(() => nextRound(profile, profile.level, []));
  const [eaten, setEaten] = useState<Letter[]>([]);
  const [streak, setStreak] = useState(0);
  const [misses, setMisses] = useState(0);
  const [pieceState, setPieceState] = useState<Partial<Record<Letter, PieceState>>>({});
  const [mood, setMood] = useState<Mood>('idle');
  const [locked, setLocked] = useState(true);
  const [gated, setGated] = useState(profile.settings.gateChoices);
  const [look, setLook] = useState(0);
  const [cheer, setCheer] = useState<string | null>(null);

  const catRef = useRef<HTMLDivElement>(null);
  const pieceRefs = useRef(new Map<Letter, HTMLDivElement>());
  const idleTimer = useRef<number | undefined>(undefined);
  const timers = useRef<number[]>([]);
  const recentTargets = useRef<Letter[]>([]);

  // the freshest profile, for generating the next round after stats have landed
  const profileRef = useRef(profile);
  profileRef.current = profile;

  const after = useCallback((ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      clearTimeout(idleTimer.current);
      audio.stopVoice();
    },
    [],
  );

  const speakPrompt = useCallback((r: Round) => {
    void audio.speak(promptClips(r), fallbackPrompt(r));
  }, []);

  /* -------- start of a round: play the prompt, then open up the choices -------- */
  const beginRound = useCallback(
    (r: Round) => {
      setRound(r);
      setPieceState({});
      setMisses(0);
      setMood('idle');
      setLocked(true);
      setGated(profile.settings.gateChoices);
      recentTargets.current = [...recentTargets.current, r.target].slice(-4);

      after(380, () => {
        void audio.speak(promptClips(r), fallbackPrompt(r)).then(() => {
          setGated(false);
        });
        // never leave him unable to tap, even if audio fails to load
        after(profile.settings.gateChoices ? 2600 : 0, () => setGated(false));
        setLocked(false);
      });
    },
    [after, profile.settings.gateChoices],
  );

  // first round
  useEffect(() => {
    beginRound(round);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // idle nudge — replay the prompt if he stalls
  useEffect(() => {
    if (locked) return;
    clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => speakPrompt(round), IDLE_NUDGE_MS);
    return () => clearTimeout(idleTimer.current);
  }, [round, locked, misses, speakPrompt]);

  /** Aim the flying piece at the cat's mouth. */
  const aimAtCat = (letter: Letter) => {
    const piece = pieceRefs.current.get(letter);
    const cat = catRef.current;
    if (!piece || !cat) return;
    const p = piece.getBoundingClientRect();
    const c = cat.getBoundingClientRect();
    const targetX = c.left + c.width / 2;
    const targetY = c.top + c.height * 0.62;
    piece.style.setProperty('--fly-x', `${targetX - (p.left + p.width / 2)}px`);
    piece.style.setProperty('--fly-y', `${targetY - (p.top + p.height / 2)}px`);
  };

  const handlePick = (letter: Letter) => {
    if (locked || gated) return;
    audio.unlock();
    clearTimeout(idleTimer.current);
    setLook(round.options.indexOf(letter) < round.options.length / 2 ? -1 : 1);

    if (letter === round.target) {
      setLocked(true);
      audio.tap();
      aimAtCat(letter);
      setPieceState({ [letter]: 'flying' });

      // he watches it come in, then eats it — two beats, not one
      after(180, () => {
        audio.whoosh();
        setMood('anticipate');
      });
      after(720, () => {
        setMood('eating');
        audio.chomp();
        void audio.oneShot('cat/nom', 0.8);
      });

      after(1180, () => {
        const first = misses === 0;
        setMood('happy');
        audio.happy();
        void audio.oneShot(catSound(streak >= 2 ? 'excited' : 'happy'), 0.85);
        void audio.speak([confirmClip(letter)], () =>
          sayFallback(`${LETTERS[letter].sound.replaceAll('/', '')}. ${letter}!`, 0.85),
        );

        const nextEaten = [...eaten, letter];
        setEaten(nextEaten);
        onProfileChange((p) => recordAnswer(p, round.target, first));

        const nextStreak = first ? streak + 1 : 0;
        setStreak(nextStreak);

        let nextLevel = level;
        if (first && nextStreak > 0 && nextStreak % 3 === 0 && level < 3) {
          nextLevel = promote(level);
          setLevel(nextLevel);
          onProfileChange((p) => ({ ...p, level: nextLevel }));
        }

        if (nextStreak >= 3) {
          setCheer(nextStreak >= 6 ? '🎉' : '⭐️');
          audio.sparkle();
          after(1400, () => setCheer(null));
        }

        after(1500, () => {
          if (nextEaten.length >= total) {
            setMood('asleep');
            audio.fanfare();
            void audio.oneShot('cat/yawn', 0.9);
            after(700, () => onMealComplete(nextEaten));
            return;
          }
          // praise every single round turns into noise he stops hearing; keep it
          // occasional so it still means something
          if (Math.random() < 0.35) void audio.speak([randomPraise()]);
          beginRound(nextRound(profileRef.current, nextLevel, recentTargets.current));
        });
      });
      return;
    }

    /* wrong piece — no penalty, just a puzzled cat and another go */
    const m = misses + 1;
    setMisses(m);
    setStreak(0);
    setMood('confused');
    audio.puzzled();
    void audio.oneShot(catSound('curious'), 0.8);
    setPieceState({ [letter]: 'reject' });
    onProfileChange((p) => recordConfusion(p, round.target, letter));

    if (m >= 2 && level > 1) {
      const down = demote(level);
      setLevel(down);
      onProfileChange((p) => ({ ...p, level: down }));
    }

    after(850, () => {
      setMood('idle');
      setPieceState(m >= 2 ? { [round.target]: 'hint' } : {});
      if (m >= 2) {
        void audio.speak(['ui/this-one', 260, ...promptClips(round)], fallbackPrompt(round));
      } else {
        speakPrompt(round);
      }
    });
  };

  const fullness = eaten.length / total;
  const optionCount = optionCountFor(level);
  const wordHint = round.kind === 'word' ? LETTERS[round.target].word : null;

  const pieces = useMemo(
    () =>
      round.options.map((l, i) => (
        <div
          key={`${round.target}-${l}`}
          ref={(el) => {
            if (el) pieceRefs.current.set(l, el);
            else pieceRefs.current.delete(l);
          }}
          style={{
            opacity: gated ? 0 : 1,
            transform: gated ? 'translateY(18px) scale(0.9)' : 'none',
            transition: 'opacity 260ms ease, transform 260ms ease',
          }}
        >
          <Sushi
            letter={l}
            index={i}
            state={pieceState[l] ?? 'rest'}
            disabled={locked || gated}
            onPick={() => handlePick(l)}
          />
        </div>
      )),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [round, pieceState, locked, gated],
  );

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      {/* parent escape hatch — long-press the corner, invisible to him */}
      <button
        type="button"
        aria-label="exit"
        onPointerDown={(e) => {
          const t = window.setTimeout(onExit, 900);
          const cancel = () => {
            clearTimeout(t);
            e.currentTarget?.removeEventListener('pointerup', cancel);
          };
          e.currentTarget.addEventListener('pointerup', cancel, { once: true });
          e.currentTarget.addEventListener('pointerleave', cancel, { once: true });
        }}
        className="absolute top-0 left-0 z-30 h-16 w-16 opacity-0"
      />

      {/* the restaurant, with the cat waiting behind the counter */}
      <div className="relative min-h-0 flex-1">
        <Restaurant unlocked={profile.decorations} dim />

        <div className="relative z-10 flex h-full flex-col items-center justify-end gap-1 pb-[clamp(64px,10vh,110px)]">
          {cheer && (
            <div className="float-up pointer-events-none absolute top-[16%] text-6xl">{cheer}</div>
          )}

          <div
            ref={catRef}
            className="h-[clamp(170px,34vh,360px)] w-[clamp(210px,40vh,420px)] shrink"
          >
            <Cat fullness={fullness} mood={mood} look={look} />
          </div>

          <Plate eaten={eaten} total={total} />

          <div className="mt-1 flex items-center gap-3">
            {wordHint && (
              <span className="rounded-full bg-black/35 px-4 py-1.5 text-lg font-bold text-white/75">
                {wordHint}
              </span>
            )}
            <button
              type="button"
              aria-label="say it again"
              onPointerDown={() => {
                audio.unlock();
                speakPrompt(round);
              }}
              className="relative grid h-[clamp(54px,8vh,72px)] w-[clamp(54px,8vh,72px)] place-items-center rounded-full bg-white/12 active:scale-95"
            >
              <span className="pulse-ring absolute inset-0 rounded-full border-4 border-tamago/40" />
              <svg viewBox="0 0 24 24" className="h-1/2 w-1/2 fill-rice">
                <path d="M4 9v6h4l5 4V5L8 9H4z" />
                <path
                  d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  className="stroke-rice"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* the counter — sushi rest on it */}
      <div className="relative z-10 h-[clamp(78px,13vh,132px)] shrink-0">
        <Counter />
        <div className="absolute inset-x-0 bottom-[34%] flex items-end justify-center gap-[clamp(8px,2.5vw,32px)] px-3">
          {pieces}
        </div>
      </div>

      {/* level breadcrumb for the parent only — three faint dots */}
      <div className="pointer-events-none absolute right-3 bottom-2 z-20 flex gap-1 opacity-25">
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className={`h-1.5 w-1.5 rounded-full ${n <= level ? 'bg-rice' : 'bg-rice/30'}`}
          />
        ))}
        <span className="sr-only">{optionCount} choices</span>
      </div>
    </div>
  );
}
