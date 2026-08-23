import { useEffect, useRef, useState } from 'react';
import { audio } from '../game/audio';
import { Cat, type Mood } from './Cat';

interface Props {
  fullness: number;
  mood: Mood;
  className?: string;
}

/**
 * The cat, on the screens where nothing is being asked of him.
 *
 * Stroke him and he purrs, shuts his eyes and leans into the finger. There is
 * nothing to get right and nothing to collect — it is the only place in the
 * game where the child touches the animal rather than the food, and it is the
 * reason to open the app when he does not feel like a lesson.
 *
 * `cat/purr` has been downloaded and decoded on every session since the game
 * was built and has never once been played. This is where it goes.
 */
export function PettableCat({ fullness, mood, className }: Props) {
  const [petting, setPetting] = useState(false);
  const purrTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => clearTimeout(purrTimer.current), []);

  /* The purr renews itself while the finger is down rather than looping a fixed
     number of times — he decides how long it lasts, which is the whole point. */
  const purr = () => {
    void audio.oneShot('cat/purr', 0.9);
    purrTimer.current = window.setTimeout(purr, 2000);
  };

  const start = () => {
    if (petting) return;
    audio.unlock();
    setPetting(true);
    purr();
  };

  const stop = () => {
    clearTimeout(purrTimer.current);
    setPetting(false);
  };

  return (
    <div
      className={className}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      style={{ touchAction: 'none', cursor: 'pointer' }}
    >
      <Cat fullness={fullness} mood={mood} petting={petting} />
    </div>
  );
}
