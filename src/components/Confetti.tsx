import { memo, useState } from 'react';

const COLORS = ['#FF8A65', '#F7C744', '#8FC46B', '#5EE7C0', '#E4574F', '#FFFBF2'];

interface Props {
  /** how many bits fall — a streak deserves less than the end of a meal */
  count?: number;
}

/**
 * Paper falling across the whole screen.
 *
 * `pointer-events-none` is not decoration here. This layer spans the viewport,
 * and the e2e suite sweeps every point of the replay button and every sushi to
 * prove nothing intercepts them; an overlay without it swallows the lot.
 */
function ConfettiRain({ count = 26 }: Props) {
  const [bits] = useState(() =>
    Array.from({ length: count }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.8,
      dur: 2.2 + Math.random() * 1.6,
      color: COLORS[i % COLORS.length],
    })),
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-20 overflow-hidden" aria-hidden>
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

export const Confetti = memo(ConfettiRain);
