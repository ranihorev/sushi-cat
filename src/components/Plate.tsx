import { memo } from 'react';
import type { Letter } from '../game/letters';
import { LETTERS, TOPPING_COLORS } from '../game/letters';

interface Props {
  eaten: Letter[];
  total: number;
}

/** Progress, expressed as food. No numbers, no score. */
function PlateRow({ eaten, total }: Props) {
  return (
    <div
      role="img"
      aria-label={`${eaten.length} of ${total} eaten`}
      className="flex items-center justify-center gap-1.5 sm:gap-2"
    >
      {Array.from({ length: total }, (_, i) => {
        const letter = eaten[i];
        return (
          <div
            key={i}
            className={`grid place-items-center transition-all duration-300 ${
              letter ? 'plate-pop' : ''
            }`}
            style={{ width: 'clamp(22px, 3.4vw, 34px)', height: 'clamp(22px, 3.4vw, 34px)' }}
          >
            {letter ? (
              <svg viewBox="0 0 40 30" className="h-full w-full">
                <rect x="2" y="12" width="36" height="16" rx="8" fill="#FFFBF2" />
                <path
                  d="M 2 14 q 18 -13 36 0 q -4 5 -18 5 q -14 0 -18 -5 Z"
                  fill={TOPPING_COLORS[LETTERS[letter].topping].fill}
                />
                <rect x="15" y="9" width="11" height="20" rx="2.5" fill="#20302A" />
              </svg>
            ) : (
              <div className="h-2.5 w-2.5 rounded-full bg-white/15" />
            )}
          </div>
        );
      })}
    </div>
  );
}

export const Plate = memo(PlateRow);
