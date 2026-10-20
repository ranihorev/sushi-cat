import { useEffect, useState } from 'react';
import { Confetti } from '../components/Confetti';
import { PettableCat } from '../components/PettableCat';
import { Counter, Restaurant } from '../components/Restaurant';
import { audio, confirmClip } from '../game/audio';
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
          <PettableCat
            fullness={1}
            mood="asleep"
            className="h-[clamp(150px,28vh,290px)] w-[clamp(190px,34vh,350px)]"
          />

        {/* What he ate — and every tile says itself back when he presses it.
            These are the `confirm/*` recordings, "/mmm/ ... M!", all twenty-six
            of which have been shipped and preloaded since the game was built
            and never played to him once. They were taken off the correct-answer
            path on purpose, because reading the letter back mid-round put two
            more sounds between him and the next question. Here there is no next
            question, so they are free. */}
        <div className="flex max-w-lg flex-wrap justify-center gap-2">
          {eaten.map((l, i) => (
            <button
              key={i}
              type="button"
              aria-label={`say ${l}`}
              onPointerDown={() => {
                audio.unlock();
                void audio.oneShot(confirmClip(l));
              }}
              className="plate-pop grid h-[clamp(44px,7vh,60px)] w-[clamp(44px,7vh,60px)] place-items-center rounded-2xl border-4 border-white text-[clamp(22px,3.6vh,32px)] font-bold text-ink shadow-[0_5px_0_rgba(59,42,58,0.25)] active:scale-90"
              style={{
                background: TOPPING_COLORS[LETTERS[l].topping].fill,
                animationDelay: `${i * 70}ms`,
                transition: 'transform 120ms ease',
              }}
            >
              {l}
            </button>
          ))}
        </div>

        {showReward && unlockedLetters.length > 0 && (
          <div className="cat-pop flex items-center gap-3 rounded-3xl border-4 border-tamago bg-white px-6 py-3 shadow-[0_6px_0_rgba(59,42,58,0.25)]">
            <span className="text-3xl">🌟</span>
            {unlockedLetters.map((l) => (
              <span key={l} className="text-4xl font-bold text-berry">
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
              className="big-btn grid h-[clamp(66px,9.5vh,86px)] w-[clamp(66px,9.5vh,86px)] place-items-center rounded-full bg-sky"
            >
              <svg viewBox="0 0 24 24" className="h-1/2 w-1/2 fill-white">
                <path d="M12 3 2 12h3v9h6v-6h2v6h6v-9h3L12 3z" />
              </svg>
            </button>
            <button
              type="button"
              onPointerDown={onAgain}
              aria-label="play again"
              className="big-btn grid h-[clamp(92px,14vh,128px)] w-[clamp(92px,14vh,128px)] place-items-center rounded-full bg-tamago text-ink"
            >
              <svg viewBox="0 0 40 40" className="btn-breathe h-1/2 w-1/2">
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
