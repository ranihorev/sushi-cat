import { Cat } from '../components/Cat';
import { Counter, Restaurant } from '../components/Restaurant';
import type { Profile } from '../game/types';

interface Props {
  profile: Profile;
  onStart: () => void;
  onParent: () => void;
}

export function Title({ profile, onStart, onParent }: Props) {
  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      <div className="relative min-h-0 flex-1">
        <Restaurant unlocked={profile.decorations} />

        <div className="relative z-10 flex h-full flex-col items-center justify-center gap-1 pb-[clamp(60px,9vh,100px)]">
          <div className="h-[clamp(170px,32vh,330px)] w-[clamp(210px,38vh,390px)]">
            <Cat fullness={0.15} mood="idle" />
          </div>

          <h1 className="text-center text-[clamp(28px,5vw,52px)] leading-tight font-extrabold tracking-tight text-rice drop-shadow-[0_3px_0_rgba(0,0,0,0.35)]">
            Feed the Sushi Cat
          </h1>

          {profile.dayStreak > 1 && (
            <div className="text-lg">{'🍣'.repeat(Math.min(profile.dayStreak, 7))}</div>
          )}

          <button
            type="button"
            onPointerDown={onStart}
            aria-label="play"
            className="big-btn mt-3 grid h-[clamp(88px,14vh,124px)] w-[clamp(88px,14vh,124px)] place-items-center rounded-full bg-tamago text-nori"
          >
            <svg viewBox="0 0 40 40" className="h-1/2 w-1/2">
              <path d="M 13 8 L 33 20 L 13 32 Z" fill="currentColor" />
            </svg>
          </button>
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
