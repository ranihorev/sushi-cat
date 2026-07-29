import { useEffect, useState } from 'react';
import { Cat } from '../components/Cat';
import { Counter, Restaurant } from '../components/Restaurant';
import { audio } from '../game/audio';
import type { Letter } from '../game/letters';
import { LETTERS, TOPPING_COLORS } from '../game/letters';
import type { Profile } from '../game/types';

interface Props {
  profile: Profile;
  eaten: Letter[];
  newDecoration: string | null;
  unlockedLetters: Letter[];
  onAgain: () => void;
  onHome: () => void;
}

const COLORS = ['#FF8A65', '#F7C744', '#8FC46B', '#5EE7C0', '#E4574F', '#FFFBF2'];

function Confetti() {
  const [bits] = useState(() =>
    Array.from({ length: 26 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.8,
      dur: 2.2 + Math.random() * 1.6,
      color: COLORS[i % COLORS.length],
    })),
  );
  return (
    <div className="pointer-events-none fixed inset-0 z-20 overflow-hidden">
      {bits.map((b) => (
        <span
          key={b.id}
          className="confetti"
          style={{
            left: `${b.left}%`,
            background: b.color,
            animationDelay: `${b.delay}s`,
            animationDuration: `${b.dur}s`,
          }}
        />
      ))}
    </div>
  );
}

export function Rest({
  profile,
  eaten,
  newDecoration,
  unlockedLetters,
  onAgain,
  onHome,
}: Props) {
  const [showReward, setShowReward] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setShowReward(true);
      if (newDecoration || unlockedLetters.length) audio.sparkle();
    }, 900);
    return () => clearTimeout(t);
  }, [newDecoration, unlockedLetters.length]);

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      <Confetti />
      <div className="relative min-h-0 flex-1">
        <Restaurant unlocked={profile.decorations} spotlight={showReward ? newDecoration : null} />

        <div className="relative z-10 flex h-full flex-col items-center justify-center gap-3 px-4 pb-[clamp(50px,8vh,90px)]">
          <div className="h-[clamp(150px,28vh,290px)] w-[clamp(190px,34vh,350px)]">
            <Cat fullness={1} mood="asleep" />
          </div>

        {/* what he ate */}
        <div className="flex max-w-lg flex-wrap justify-center gap-2">
          {eaten.map((l, i) => (
            <div
              key={i}
              className="plate-pop grid h-11 w-11 place-items-center rounded-xl text-xl font-extrabold text-nori"
              style={{
                background: TOPPING_COLORS[LETTERS[l].topping].fill,
                animationDelay: `${i * 70}ms`,
              }}
            >
              {l}
            </div>
          ))}
        </div>

        {showReward && unlockedLetters.length > 0 && (
          <div className="cat-pop flex items-center gap-2 rounded-2xl bg-black/35 px-5 py-3">
            <span className="text-2xl">✨</span>
            {unlockedLetters.map((l) => (
              <span key={l} className="text-3xl font-extrabold text-tamago">
                {l}
              </span>
            ))}
          </div>
        )}

          <div className="mt-2 flex items-center gap-4">
            <button
              type="button"
              onPointerDown={onHome}
              aria-label="home"
              className="big-btn grid h-[clamp(62px,9vh,80px)] w-[clamp(62px,9vh,80px)] place-items-center rounded-full bg-white/15"
            >
              <svg viewBox="0 0 24 24" className="h-1/2 w-1/2 fill-rice">
                <path d="M12 3 2 12h3v9h6v-6h2v6h6v-9h3L12 3z" />
              </svg>
            </button>
            <button
              type="button"
              onPointerDown={onAgain}
              aria-label="play again"
              className="big-btn grid h-[clamp(88px,13vh,120px)] w-[clamp(88px,13vh,120px)] place-items-center rounded-full bg-tamago text-nori"
            >
              <svg viewBox="0 0 40 40" className="h-1/2 w-1/2">
                <path d="M 13 8 L 33 20 L 13 32 Z" fill="currentColor" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div className="relative h-[clamp(78px,13vh,132px)] shrink-0">
        <Counter />
      </div>
    </div>
  );
}
