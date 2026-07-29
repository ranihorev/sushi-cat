import { memo } from 'react';
import type { Letter } from '../game/letters';
import { LETTERS, TOPPING_COLORS } from '../game/letters';

export type PieceState = 'rest' | 'flying' | 'reject' | 'hint';

interface Props {
  letter: Letter;
  state: PieceState;
  index: number;
  disabled?: boolean;
  onPick: () => void;
}

const RICE = '#FFFBF2';
const RICE_EDGE = '#EADCC2';
const NORI = '#20302A';

/** Each topping reads differently at a glance — variety without hurting the letter. */
function Topping({ kind }: { kind: keyof typeof TOPPING_COLORS }) {
  const { fill, shade } = TOPPING_COLORS[kind];
  const slab = (
    <path d="M 10 62 q 55 -38 110 0 q -8 15 -55 15 q -47 0 -55 -15 Z" fill={fill} />
  );

  switch (kind) {
    case 'salmon':
      return (
        <g>
          {slab}
          <g stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" opacity="0.75" fill="none">
            <path d="M 26 58 q 38 -22 78 -2" />
            <path d="M 22 68 q 40 -16 84 -2" />
          </g>
        </g>
      );
    case 'tuna':
      return (
        <g>
          {slab}
          <path d="M 24 56 q 40 -24 82 -2" stroke={shade} strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.6" />
        </g>
      );
    case 'tamago':
      return (
        <g>
          <path d="M 12 60 q 54 -34 106 0 l 0 14 q -53 12 -106 0 Z" fill={fill} />
          <path d="M 14 66 q 52 -12 102 0" stroke={shade} strokeWidth="2.5" fill="none" opacity="0.7" />
        </g>
      );
    case 'ebi':
      return (
        <g>
          {slab}
          <g stroke={shade} strokeWidth="3" strokeLinecap="round" opacity="0.7" fill="none">
            <path d="M 44 46 q 4 16 0 30" />
            <path d="M 66 42 q 4 18 0 34" />
            <path d="M 88 46 q 4 16 0 30" />
          </g>
        </g>
      );
    case 'avocado':
      return (
        <g>
          {slab}
          <g fill={shade} opacity="0.55">
            <ellipse cx="42" cy="58" rx="13" ry="9" />
            <ellipse cx="68" cy="53" rx="13" ry="9" />
            <ellipse cx="94" cy="58" rx="13" ry="9" />
          </g>
        </g>
      );
    case 'ika':
      return (
        <g>
          {slab}
          <g stroke={shade} strokeWidth="2.6" strokeLinecap="round" opacity="0.8">
            <line x1="40" y1="50" x2="40" y2="70" />
            <line x1="58" y1="46" x2="58" y2="72" />
            <line x1="76" y1="46" x2="76" y2="72" />
            <line x1="94" y1="50" x2="94" y2="70" />
          </g>
        </g>
      );
    case 'unagi':
      return (
        <g>
          {slab}
          <path d="M 20 58 q 45 -20 90 0" stroke="#5E3313" strokeWidth="4" fill="none" opacity="0.5" />
          <path d="M 30 52 q 34 -12 68 0" stroke="#FFE9A8" strokeWidth="3" fill="none" opacity="0.6" strokeLinecap="round" />
        </g>
      );
    case 'roe':
      return (
        <g>
          <path d="M 12 62 q 54 -26 106 0 q -10 12 -53 12 q -43 0 -53 -12 Z" fill="#F7E7C8" />
          <g fill={fill}>
            {[
              [30, 54], [46, 48], [62, 45], [78, 48], [94, 54],
              [38, 62], [54, 58], [70, 57], [86, 62], [102, 62],
            ].map(([cx, cy], i) => (
              <circle key={i} cx={cx} cy={cy} r="7.5" />
            ))}
          </g>
          <g fill="#FFFFFF" opacity="0.55">
            {[[28, 51], [44, 45], [60, 42], [76, 45], [92, 51]].map(([cx, cy], i) => (
              <circle key={i} cx={cx} cy={cy} r="2.2" />
            ))}
          </g>
        </g>
      );
  }
}

function SushiPiece({ letter, state, index, disabled, onPick }: Props) {
  const cls =
    state === 'flying' ? 'sushi-fly'
    : state === 'reject' ? 'sushi-reject'
    : state === 'hint' ? 'sushi-hint'
    : 'sushi-rest';

  return (
    <button
      type="button"
      onPointerDown={(e) => {
        e.preventDefault();
        if (!disabled) onPick();
      }}
      disabled={disabled}
      aria-label={`letter ${letter}`}
      className={`sushi-btn ${cls}`}
      style={{ animationDelay: state === 'rest' ? `${index * 70}ms` : undefined }}
    >
      <svg viewBox="0 0 130 118" className="h-full w-full overflow-visible">
        <ellipse cx="65" cy="108" rx="46" ry="7" fill="rgba(0,0,0,0.22)" />

        {/* rice */}
        <rect
          x="12"
          y="58"
          width="106"
          height="48"
          rx="23"
          fill={RICE}
          stroke={RICE_EDGE}
          strokeWidth="2"
        />
        <g fill={RICE_EDGE} opacity="0.5">
          <ellipse cx="30" cy="90" rx="5" ry="3.5" />
          <ellipse cx="100" cy="88" rx="5" ry="3.5" />
        </g>

        <g transform="translate(5,0)">
          <Topping kind={LETTERS[letter].topping} />
        </g>

        {/* nori band carrying the letter */}
        <rect x="47" y="46" width="38" height="62" rx="6" fill={NORI} />
        <rect x="47" y="46" width="38" height="62" rx="6" fill="url(#noriSheen)" />
        <text
          x="66"
          y="90"
          textAnchor="middle"
          fill="#FFFBF2"
          fontSize="38"
          fontWeight="800"
          className="sushi-letter"
        >
          {letter}
        </text>

        <defs>
          <linearGradient id="noriSheen" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.14" />
            <stop offset="45%" stopColor="#fff" stopOpacity="0" />
            <stop offset="100%" stopColor="#000" stopOpacity="0.12" />
          </linearGradient>
        </defs>
      </svg>
    </button>
  );
}

export const Sushi = memo(SushiPiece);
