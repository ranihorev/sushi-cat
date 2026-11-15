import { useEffect, useRef, useState } from 'react';
import { audio } from '../game/audio';
import { GAG_SOUND } from '../game/reactionSounds';
import { GAG_MS, TAP_COOLDOWN_MS, TAP_GAGS, surprises, type Gag } from '../game/surprises';
import { Cat, type Mood } from './Cat';

interface Props {
  fullness: number;
  mood: Mood;
  className?: string;
  wear?: readonly string[];
  /** a quick tap makes him do something silly; false when a parent turned the jokes off */
  jokes?: boolean;
}

/** a press held longer than this is a stroke; a shorter one is a tap */
const STROKE_AFTER_MS = 220;

/**
 * The cat, on the screens where nothing is being asked of him.
 *
 * Stroke him and he purrs, shuts his eyes and leans into the finger. There is
 * nothing to get right and nothing to collect — it is the only place in the
 * game where the child touches the animal rather than the food, and it is the
 * reason to open the app when he does not feel like a lesson.
 *
 * A quick tap is a poke rather than a stroke, and a poked cat does something
 * silly: a big burp, a wiggle dance or a huge yawn.
 */
export function PettableCat({ fullness, mood, className, wear, jokes = true }: Props) {
  const [petting, setPetting] = useState(false);
  const [gag, setGag] = useState<Gag | null>(null);
  const purrTimer = useRef<number | undefined>(undefined);
  const strokeTimer = useRef<number | undefined>(undefined);
  const gagTimer = useRef<number | undefined>(undefined);
  const down = useRef(false);
  const gagUntil = useRef(0);

  useEffect(
    () => () => {
      clearTimeout(purrTimer.current);
      clearTimeout(strokeTimer.current);
      clearTimeout(gagTimer.current);
    },
    [],
  );

  /* The purr renews itself while the finger is down rather than looping a fixed
     number of times — he decides how long it lasts, which is the whole point. */
  const purr = () => {
    void audio.oneShot('cat/purr', 0.9);
    purrTimer.current = window.setTimeout(purr, 2000);
  };

  const start = () => {
    if (down.current) return;
    audio.unlock();
    down.current = true;
    clearTimeout(strokeTimer.current);
    strokeTimer.current = window.setTimeout(() => {
      if (!down.current) return;
      setGag(null);
      setPetting(true);
      purr();
    }, jokes ? STROKE_AFTER_MS : 0);
  };

  const poke = () => {
    if (!jokes || Date.now() < gagUntil.current) return;
    const g = surprises.deal(TAP_GAGS);
    setGag(g);
    gagUntil.current = Date.now() + TAP_COOLDOWN_MS;
    GAG_SOUND[g]();
    clearTimeout(gagTimer.current);
    gagTimer.current = window.setTimeout(() => setGag(null), GAG_MS[g]);
  };

  const stop = (lifted: boolean) => {
    if (!down.current) return;
    down.current = false;
    clearTimeout(strokeTimer.current);
    clearTimeout(purrTimer.current);
    if (!petting && lifted) poke();
    setPetting(false);
  };

  return (
    <div
      className={className}
      onPointerDown={start}
      onPointerUp={() => stop(true)}
      onPointerLeave={() => stop(false)}
      onPointerCancel={() => stop(false)}
      style={{ touchAction: 'none', cursor: 'pointer' }}
      data-testid="pettable-cat"
    >
      <Cat fullness={fullness} mood={mood} petting={petting} wear={wear} gag={gag} />
    </div>
  );
}
