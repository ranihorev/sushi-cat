import { PettableCat } from '../components/PettableCat';
import { Counter, Restaurant } from '../components/Restaurant';
import type { GameMode, Profile } from '../game/types';

interface Props {
  profile: Profile;
  onStart: (mode: GameMode) => void;
  onParent: () => void;
}

export function Title({ profile, onStart, onParent }: Props) {
  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      <div className="relative min-h-0 flex-1">
        <Restaurant unlocked={profile.decorations} />

        <div className="relative z-10 flex h-full flex-col items-center justify-center gap-1 pb-[clamp(60px,9vh,100px)]">
          {/* He can stroke the cat here for as long as he likes. Nothing is
              asked of him on this screen, and nothing is counted. */}
          <PettableCat
            fullness={0.15}
            mood="idle"
            className="h-[clamp(170px,32vh,330px)] w-[clamp(210px,38vh,390px)]"
          />

          <h1 className="text-center text-[clamp(28px,5vw,52px)] leading-tight font-extrabold tracking-tight text-rice drop-shadow-[0_3px_0_rgba(0,0,0,0.35)]">
            Feed the Sushi Cat
          </h1>

          {profile.dayStreak > 1 && (
            <div className="text-lg">{'🍣'.repeat(Math.min(profile.dayStreak, 7))}</div>
          )}

          {/* Three ways to play, told apart by picture alone: the plain play
              button is the still counter, the one with the belt under it sends
              the pieces riding round, and the cup with ears is the kitty cafe. */}
          <div className="mt-3 flex items-center gap-[clamp(20px,5vw,48px)]">
            <button
              type="button"
              onPointerDown={() => onStart('counter')}
              aria-label="play"
              className="big-btn grid h-[clamp(88px,14vh,124px)] w-[clamp(88px,14vh,124px)] place-items-center rounded-full bg-tamago text-nori"
            >
              <svg viewBox="0 0 40 40" className="h-1/2 w-1/2">
                <path d="M 13 8 L 33 20 L 13 32 Z" fill="currentColor" />
              </svg>
            </button>

            <button
              type="button"
              onPointerDown={() => onStart('train')}
              aria-label="play sushi train"
              className="big-btn grid h-[clamp(88px,14vh,124px)] w-[clamp(88px,14vh,124px)] place-items-center rounded-full bg-salmon text-nori"
            >
              <svg viewBox="0 0 40 40" className="h-3/5 w-3/5">
                {/* a piece riding a belt, with the belt's direction under it */}
                <rect x="10" y="11" width="20" height="10" rx="5" fill="#fff8ec" />
                <rect x="10" y="9" width="20" height="5" rx="2.5" fill="#f26b4f" />
                <rect x="4" y="23" width="32" height="6" rx="3" fill="currentColor" />
                <circle cx="9" cy="26" r="1.4" fill="#fff8ec" />
                <circle cx="20" cy="26" r="1.4" fill="#fff8ec" />
                <circle cx="31" cy="26" r="1.4" fill="#fff8ec" />
                <path d="M 12 33 L 28 33 M 24 30 L 28 33 L 24 36" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            <button
              type="button"
              onPointerDown={() => onStart('cafe')}
              aria-label="play kitty cafe"
              className="big-btn grid h-[clamp(88px,14vh,124px)] w-[clamp(88px,14vh,124px)] place-items-center rounded-full bg-[#F0A6B8] text-nori"
            >
              <svg viewBox="0 0 40 40" className="h-3/5 w-3/5">
                {/* a cup with cat ears */}
                <path d="M 10 14 L 13 7 L 17 13 M 23 13 L 27 7 L 30 14" fill="#fff8ec" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                <path d="M 8 14 H 32 V 24 A 12 10 0 0 1 8 24 Z" fill="#fff8ec" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
                <path d="M 32 17 h 2 a 3.5 3.5 0 0 1 0 7 h -2.5" fill="none" stroke="currentColor" strokeWidth="2.4" />
                <circle cx="15.5" cy="21" r="1.6" fill="currentColor" />
                <circle cx="24.5" cy="21" r="1.6" fill="currentColor" />
                <path d="M 18 25 q 2 2 4 0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div className="relative h-[clamp(78px,13vh,132px)] shrink-0">
        <Counter />
      </div>

      <button
        type="button"
        onPointerDown={onParent}
        className="absolute right-3 bottom-3 z-20 rounded-full bg-black/25 px-4 py-2 text-sm font-bold text-white/60"
      >
        parents
      </button>
    </div>
  );
}
