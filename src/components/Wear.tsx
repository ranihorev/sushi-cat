import type { ReactNode } from 'react';

/* What the presents look like. Everything here is drawn in the cat's own
   coordinates (see Cat.tsx: the head is an ellipse at 120,100), so the same
   drawing is used on the cat and, cropped by `box`, as the picture of the
   present when he is choosing it. */

const LINE = { stroke: '#4A3530', strokeWidth: 3, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };

interface Art {
  /** the part of the cat's canvas this drawing fills: x y w h */
  box: string;
  /** drawn behind the eyes and whiskers (hats) or in front of them (glasses) */
  layer: 'hat' | 'front';
  art: ReactNode;
}

const glasses = (lens: (cx: number) => ReactNode) => (
  <g>
    <path d="M 108 106 q 12 -7 24 0" fill="none" {...LINE} strokeWidth={4} />
    <path d="M 70 104 L 56 98 M 170 104 L 184 98" fill="none" {...LINE} strokeWidth={4} />
    {lens(90)}
    {lens(150)}
  </g>
);

export const WEAR: Record<string, Art> = {
  'party-hat': {
    box: '84 -14 72 76',
    layer: 'hat',
    art: (
      <g transform="rotate(-8 120 50)">
        <path d="M 120 -4 L 146 54 Q 120 62 94 54 Z" fill="#FF7AA8" {...LINE} />
        <path d="M 110 20 L 132 24 M 103 36 L 139 42" stroke="#FFE27A" strokeWidth="5" strokeLinecap="round" />
        <circle cx="120" cy="-4" r="8" fill="#FFE27A" {...LINE} />
      </g>
    ),
  },
  crown: {
    box: '82 2 76 60',
    layer: 'hat',
    art: (
      <g transform="rotate(-6 120 50)">
        <path d="M 92 54 L 88 20 L 106 36 L 120 12 L 134 36 L 152 20 L 148 54 Z" fill="#F7C744" {...LINE} />
        <circle cx="120" cy="42" r="5" fill="#E4574F" />
        <circle cx="102" cy="45" r="3.5" fill="#5EC8E7" />
        <circle cx="138" cy="45" r="3.5" fill="#5EC8E7" />
      </g>
    ),
  },
  'top-hat': {
    box: '80 -8 80 70',
    layer: 'hat',
    art: (
      <g transform="rotate(-8 120 50)">
        <rect x="98" y="0" width="44" height="50" rx="5" fill="#3A3340" {...LINE} />
        <rect x="98" y="36" width="44" height="10" fill="#E4574F" />
        <rect x="84" y="46" width="72" height="11" rx="5.5" fill="#3A3340" {...LINE} />
      </g>
    ),
  },
  bow: {
    box: '42 18 60 46',
    layer: 'hat',
    art: (
      <g transform="rotate(-18 72 42)">
        <path d="M 72 42 L 50 28 Q 44 42 50 56 Z" fill="#FF7AA8" {...LINE} />
        <path d="M 72 42 L 94 28 Q 100 42 94 56 Z" fill="#FF7AA8" {...LINE} />
        <circle cx="72" cy="42" r="7" fill="#FFB3CC" {...LINE} />
      </g>
    ),
  },
  flower: {
    box: '138 18 56 56',
    layer: 'hat',
    art: (
      <g>
        {[0, 72, 144, 216, 288].map((a) => (
          <ellipse key={a} cx="166" cy="32" rx="8" ry="12" fill="#FFFFFF" {...LINE} strokeWidth={2.5} transform={`rotate(${a} 166 46)`} />
        ))}
        <circle cx="166" cy="46" r="8" fill="#F7C744" {...LINE} strokeWidth={2.5} />
      </g>
    ),
  },
  sunglasses: {
    box: '50 82 140 48',
    layer: 'front',
    art: glasses((cx) => <rect x={cx - 22} y="94" width="44" height="30" rx="13" fill="#2B2A33" {...LINE} />),
  },
  'heart-glasses': {
    box: '50 82 140 50',
    layer: 'front',
    art: glasses((cx) => (
      <path
        d={`M ${cx} 100 c -6 -10 -22 -6 -22 6 c 0 11 14 18 22 24 c 8 -6 22 -13 22 -24 c 0 -12 -16 -16 -22 -6 Z`}
        fill="#FF5C8A"
        fillOpacity="0.85"
        {...LINE}
      />
    )),
  },
  'bow-tie': {
    box: '84 140 72 44',
    layer: 'front',
    art: (
      <g>
        <path d="M 120 162 L 96 148 Q 90 162 96 176 Z" fill="#5E8BE7" {...LINE} />
        <path d="M 120 162 L 144 148 Q 150 162 144 176 Z" fill="#5E8BE7" {...LINE} />
        <circle cx="120" cy="162" r="7" fill="#9DB9F5" {...LINE} />
      </g>
    ),
  },
  bell: {
    box: '78 142 84 46',
    layer: 'front',
    art: (
      <g>
        <path d="M 84 152 Q 120 170 156 152" fill="none" stroke="#E4574F" strokeWidth="8" strokeLinecap="round" />
        <circle cx="120" cy="172" r="11" fill="#F7C744" {...LINE} />
        <path d="M 112 172 h 16 M 120 172 v 8" stroke="#4A3530" strokeWidth="2.5" strokeLinecap="round" />
      </g>
    ),
  },
  scarf: {
    box: '70 140 100 60',
    layer: 'front',
    art: (
      <g>
        <path d="M 78 150 Q 120 172 162 150 L 164 164 Q 120 186 76 164 Z" fill="#5EC8A0" {...LINE} />
        <path d="M 136 168 L 150 166 L 156 194 L 140 196 Z" fill="#5EC8A0" {...LINE} />
        <path d="M 96 163 l 2 12 M 116 168 l 0 12 M 144 176 l 9 -1 M 146 186 l 9 -1" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" opacity="0.8" />
      </g>
    ),
  },
  /* toys are never worn; `box` and `art` are their picture and their drawing */
  yarn: {
    box: '0 0 60 60',
    layer: 'front',
    art: (
      <g>
        <circle cx="30" cy="32" r="22" fill="#FF7AA8" {...LINE} />
        <path d="M 12 26 q 18 -12 36 0 M 10 36 q 20 -10 40 2 M 18 48 q 14 -22 26 -30" fill="none" stroke="#FFB3CC" strokeWidth="3" strokeLinecap="round" />
        <path d="M 48 46 q 10 6 6 12" fill="none" stroke="#FF7AA8" strokeWidth="4" strokeLinecap="round" />
      </g>
    ),
  },
  'fish-toy': {
    box: '0 0 60 60',
    layer: 'front',
    art: (
      <g>
        <path d="M 8 30 q 16 -20 34 0 q -18 20 -34 0 Z" fill="#5EC8E7" {...LINE} />
        <path d="M 42 30 l 12 -11 l 0 22 Z" fill="#5EC8E7" {...LINE} />
        <circle cx="19" cy="27" r="3" fill="#2B1F1C" />
        <path d="M 28 22 q 4 8 0 16" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" opacity="0.8" />
      </g>
    ),
  },
};

/** The picture of a present, on its own — for the gift boxes and the shelf. */
export function GiftIcon({ id, className }: { id: string; className?: string }) {
  const w = WEAR[id];
  if (!w) return null;
  return (
    <svg viewBox={w.box} className={className} data-gift={id}>
      {w.art}
    </svg>
  );
}

/** What the cat has on, for one layer of the drawing. */
export function Worn({ ids, layer }: { ids: readonly string[]; layer: Art['layer'] }) {
  return (
    <>
      {ids.map((id) => (WEAR[id]?.layer === layer ? <g key={id}>{WEAR[id].art}</g> : null))}
    </>
  );
}
