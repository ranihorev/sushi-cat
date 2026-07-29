import { memo } from 'react';

/* The cat's little restaurant. One decoration is earned per finished meal —
   this is the thing that pulls him back tomorrow.

   Two layers, because a single stretched SVG either crops things off the sides
   or floats the standing props in mid-air: hanging decorations are anchored to
   the ceiling, standing ones to the counter. Both use `meet` so nothing is ever
   cropped, at any aspect ratio. */

export interface Decoration {
  id: string;
  anchor: 'top' | 'bottom';
  render: (key: string) => React.ReactNode;
}

const HANGING_VB = { w: 800, h: 300 };
const STANDING_VB = { w: 800, h: 300 };

const lantern = (x: number, color: string, key: string) => (
  <g key={key} className="deco-sway" style={{ transformOrigin: `${x}px 0px` }}>
    <line x1={x} y1="0" x2={x} y2="52" stroke="#3A4A42" strokeWidth="3" />
    <ellipse cx={x} cy="86" rx="26" ry="34" fill={color} />
    <g stroke="rgba(0,0,0,0.16)" strokeWidth="2">
      <line x1={x - 24} y1="74" x2={x + 24} y2="74" />
      <line x1={x - 26} y1="86" x2={x + 26} y2="86" />
      <line x1={x - 24} y1="98" x2={x + 24} y2="98" />
    </g>
    <rect x={x - 12} y="50" width="24" height="8" rx="3" fill="#2C3A34" />
    <rect x={x - 12} y="114" width="24" height="8" rx="3" fill="#2C3A34" />
    <ellipse cx={x} cy="86" rx="44" ry="52" fill={color} opacity="0.14" />
  </g>
);

export const DECORATIONS: Decoration[] = [
  { id: 'lantern-left', anchor: 'top', render: (k) => lantern(64, '#FF8A65', k) },
  { id: 'lantern-right', anchor: 'top', render: (k) => lantern(736, '#F7C744', k) },
  {
    id: 'bonsai',
    anchor: 'bottom',
    render: (k) => (
      <g key={k} className="deco-pop">
        <rect x="176" y="268" width="58" height="32" rx="7" fill="#8E5527" />
        <rect x="170" y="260" width="70" height="12" rx="5" fill="#A2653A" />
        <path d="M 205 262 L 205 216" stroke="#6B4426" strokeWidth="8" strokeLinecap="round" />
        <path d="M 205 232 q -22 -8 -28 -22" stroke="#6B4426" strokeWidth="5" fill="none" strokeLinecap="round" />
        <ellipse cx="205" cy="204" rx="38" ry="20" fill="#6FA34D" />
        <ellipse cx="173" cy="198" rx="22" ry="13" fill="#8FC46B" />
        <ellipse cx="232" cy="193" rx="20" ry="12" fill="#8FC46B" />
      </g>
    ),
  },
  {
    id: 'koi-poster',
    anchor: 'top',
    render: (k) => (
      <g key={k} className="deco-pop">
        <rect x="136" y="40" width="96" height="126" rx="7" fill="#F6EEDC" stroke="#C9B893" strokeWidth="3" />
        <path d="M 162 124 q 20 -38 44 -20 q 18 14 -2 29 q -22 15 -42 -9 Z" fill="#E4574F" />
        <path d="M 162 124 q -16 -11 -20 2 q 13 11 20 -2 Z" fill="#E4574F" />
        <circle cx="194" cy="109" r="3.5" fill="#20302A" />
        <g stroke="#8FA8B8" strokeWidth="3" opacity="0.55" strokeLinecap="round">
          <path d="M 150 70 q 22 -9 42 0" />
          <path d="M 163 82 q 20 -8 38 0" />
        </g>
      </g>
    ),
  },
  {
    id: 'neon-fish',
    anchor: 'top',
    render: (k) => (
      <g key={k} className="deco-glow">
        <path
          d="M 540 118 q 34 -32 68 0 q -34 32 -68 0 Z M 540 118 l -22 -17 l 0 34 Z"
          fill="none"
          stroke="#5EE7C0"
          strokeWidth="5"
          strokeLinejoin="round"
        />
        <circle cx="591" cy="110" r="3.5" fill="#5EE7C0" />
      </g>
    ),
  },
  {
    id: 'plant',
    anchor: 'bottom',
    render: (k) => (
      <g key={k} className="deco-pop">
        <path d="M 626 300 l 10 -54 h 42 l 10 54 Z" fill="#C9793F" />
        <g stroke="#6FA34D" strokeWidth="6" fill="none" strokeLinecap="round">
          <path d="M 657 248 q -6 -40 -32 -54" />
          <path d="M 657 248 q 8 -42 36 -52" />
          <path d="M 657 248 q 0 -34 2 -52" />
        </g>
        <g fill="#8FC46B">
          <ellipse cx="623" cy="190" rx="15" ry="10" transform="rotate(-30 623 190)" />
          <ellipse cx="695" cy="192" rx="15" ry="10" transform="rotate(28 695 192)" />
          <ellipse cx="659" cy="190" rx="12" ry="17" />
        </g>
      </g>
    ),
  },
  {
    id: 'cat-clock',
    anchor: 'top',
    render: (k) => (
      <g key={k} className="deco-pop">
        <circle cx="650" cy="76" r="36" fill="#F6EEDC" stroke="#C9B893" strokeWidth="3" />
        <path
          d="M 624 50 l -5 -18 l 20 10 Z M 676 50 l 5 -18 l -20 10 Z"
          fill="#F6EEDC"
          stroke="#C9B893"
          strokeWidth="3"
        />
        <g
          className="deco-tick"
          stroke="#20302A"
          strokeWidth="4"
          strokeLinecap="round"
          style={{ transformOrigin: '650px 76px' }}
        >
          <line x1="650" y1="76" x2="650" y2="54" />
        </g>
        <line x1="650" y1="76" x2="667" y2="86" stroke="#20302A" strokeWidth="3.5" strokeLinecap="round" />
        <circle cx="650" cy="76" r="4" fill="#E4574F" />
      </g>
    ),
  },
  {
    id: 'sake',
    anchor: 'bottom',
    render: (k) => (
      <g key={k} className="deco-pop">
        {[520, 552, 584].map((x, i) => (
          <g key={x}>
            <path
              d={`M ${x} 300 l 0 -34 l -5 -10 l 0 -10 l 15 0 l 0 10 l -5 10 l 0 34 Z`}
              fill={i === 1 ? '#EFE6D2' : '#BFD8CC'}
            />
            <rect x={x - 5} y="256" width="15" height="12" fill="#E4574F" opacity="0.85" />
          </g>
        ))}
      </g>
    ),
  },
  {
    id: 'bamboo',
    anchor: 'bottom',
    render: (k) => (
      <g key={k} className="deco-pop">
        {[44, 66].map((x, i) => (
          <g key={x}>
            <rect x={x} y={90 + i * 20} width="13" height={210 - i * 20} rx="6" fill="#6FA34D" />
            <g stroke="#4E7C35" strokeWidth="2.5">
              {[0, 1, 2, 3].map((j) => (
                <line key={j} x1={x} y1={132 + i * 20 + j * 42} x2={x + 13} y2={132 + i * 20 + j * 42} />
              ))}
            </g>
          </g>
        ))}
        <ellipse cx="34" cy="120" rx="22" ry="8" fill="#8FC46B" transform="rotate(-20 34 120)" />
        <ellipse cx="94" cy="150" rx="22" ry="8" fill="#8FC46B" transform="rotate(18 94 150)" />
      </g>
    ),
  },
  {
    id: 'koinobori',
    anchor: 'bottom',
    render: (k) => (
      <g key={k} className="deco-wave" style={{ transformOrigin: '742px 70px' }}>
        <line x1="742" y1="40" x2="742" y2="300" stroke="#6B4426" strokeWidth="5" />
        <path d="M 742 60 q 44 -16 68 14 q -24 30 -68 14 Z" fill="#E4574F" />
        <circle cx="762" cy="70" r="5" fill="#FFFBF2" />
      </g>
    ),
  },
  {
    id: 'frame',
    anchor: 'top',
    render: (k) => (
      <g key={k} className="deco-pop">
        <rect x="130" y="196" width="112" height="80" rx="6" fill="#6B4426" />
        <rect x="138" y="204" width="96" height="64" rx="4" fill="#2D5F6E" />
        <circle cx="166" cy="228" r="10" fill="#F7C744" />
        <path d="M 138 260 q 26 -26 48 -7 q 18 14 48 -9 l 0 24 l -96 0 Z" fill="#3E7C6B" />
      </g>
    ),
  },
];

interface Props {
  unlocked: string[];
  /** id of the decoration to spotlight (just unlocked) */
  spotlight?: string | null;
  dim?: boolean;
}

function Layer({
  anchor,
  items,
  spotlight,
}: {
  anchor: 'top' | 'bottom';
  items: Decoration[];
  spotlight?: string | null;
}) {
  const vb = anchor === 'top' ? HANGING_VB : STANDING_VB;
  return (
    <svg
      viewBox={`0 0 ${vb.w} ${vb.h}`}
      preserveAspectRatio={anchor === 'top' ? 'xMidYMin meet' : 'xMidYMax meet'}
      className="absolute inset-0 h-full w-full"
      aria-hidden
    >
      {items.map((d) => (
        <g
          key={d.id}
          className={spotlight === d.id ? 'deco-reveal' : undefined}
          opacity={spotlight && spotlight !== d.id ? 0.5 : 1}
          style={{ transition: 'opacity 400ms' }}
        >
          {d.render(d.id)}
        </g>
      ))}
    </svg>
  );
}

function RestaurantScene({ unlocked, spotlight, dim }: Props) {
  const shown = DECORATIONS.filter((d) => unlocked.includes(d.id));

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {/* wall */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 80% at 50% 0%, rgba(255,178,94,0.22) 0%, rgba(255,178,94,0) 60%), linear-gradient(180deg,#123A3A 0%,#0E2E30 55%,#0A2426 100%)',
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(180deg,transparent 0 68px,#ffffff 68px 70px)',
        }}
      />

      {/* noren curtain */}
      <svg
        viewBox="0 0 800 70"
        preserveAspectRatio="none"
        className="absolute inset-x-0 top-0 h-[clamp(40px,7vh,74px)] w-full"
      >
        <rect x="0" y="0" width="800" height="14" fill="#1A2B26" />
        {[0, 1, 2, 3, 4].map((i) => (
          <path
            key={i}
            d={`M ${i * 160} 12 h 152 v 46 q -76 14 -152 0 Z`}
            fill={i % 2 ? '#25493F' : '#1F3C35'}
          />
        ))}
      </svg>

      <div
        className="absolute inset-0"
        style={{ opacity: dim ? 0.55 : 1, transition: 'opacity 500ms' }}
      >
        <Layer anchor="top" items={shown.filter((d) => d.anchor === 'top')} spotlight={spotlight} />
        <Layer
          anchor="bottom"
          items={shown.filter((d) => d.anchor === 'bottom')}
          spotlight={spotlight}
        />
      </div>
    </div>
  );
}

export const Restaurant = memo(RestaurantScene);

/** The wooden counter the sushi actually sit on. */
export const Counter = memo(function Counter() {
  return (
    <div
      className="absolute inset-0"
      style={{
        background: 'linear-gradient(180deg,#D9A369 0 7px,#C08A50 7px,#8E5C2F 100%)',
      }}
    >
      <div
        className="absolute inset-x-0 top-2 bottom-0 opacity-25"
        style={{
          backgroundImage:
            'repeating-linear-gradient(90deg,transparent 0 118px,rgba(0,0,0,.35) 118px 121px)',
        }}
      />
      <div className="absolute inset-x-0 top-2 h-6 bg-gradient-to-b from-black/25 to-transparent" />
    </div>
  );
});
