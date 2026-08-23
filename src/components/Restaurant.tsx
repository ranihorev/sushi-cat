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

  /* Everything below exists because the old list ran out.
     Two of the eleven were granted at the start and one was earned per meal, so
     from about the ninth finished meal the end screen had nothing left to give
     and quietly stopped sparkling — which is roughly when a child who plays
     most days stops asking for it. The gold piece hands one out mid-meal as
     well, so the shelf has to be deep enough to survive two a day. */

  {
    id: 'fish-tank',
    anchor: 'bottom',
    render: (k) => (
      <g key={k} className="deco-pop">
        <rect x="288" y="212" width="104" height="66" rx="6" fill="#1E5E6B" opacity="0.9" />
        <rect x="288" y="212" width="104" height="66" rx="6" fill="none" stroke="#8FA8B8" strokeWidth="3" />
        <rect x="284" y="276" width="112" height="10" rx="4" fill="#6B4426" />
        <path d="M 292 262 q 24 -12 48 0 q 26 12 52 0 l 0 14 l -100 0 Z" fill="#C9A46A" opacity="0.8" />
        <g className="deco-wave" style={{ transformOrigin: '320px 268px' }}>
          <path d="M 316 268 q -8 -22 2 -34" stroke="#6FA34D" strokeWidth="5" fill="none" strokeLinecap="round" />
          <path d="M 328 268 q 6 -18 -2 -28" stroke="#8FC46B" strokeWidth="4" fill="none" strokeLinecap="round" />
        </g>
        <g className="deco-sway" style={{ transformOrigin: '360px 236px' }}>
          <path d="M 352 236 q 12 -9 24 0 q -12 9 -24 0 Z M 352 236 l -8 -6 l 0 12 Z" fill="#FF8A65" />
          <circle cx="368" cy="234" r="1.8" fill="#20302A" />
        </g>
      </g>
    ),
  },
  {
    id: 'maneki',
    anchor: 'bottom',
    render: (k) => (
      <g key={k} className="deco-pop">
        <ellipse cx="452" cy="278" rx="30" ry="22" fill="#FFF7EA" />
        <circle cx="452" cy="240" r="24" fill="#FFF7EA" />
        <path d="M 434 224 L 429 206 L 447 216 Z M 470 224 L 475 206 L 457 216 Z" fill="#FFF7EA" />
        <circle cx="444" cy="238" r="3" fill="#20302A" />
        <circle cx="460" cy="238" r="3" fill="#20302A" />
        <path d="M 448 246 q 4 4 8 0" stroke="#20302A" strokeWidth="2" fill="none" strokeLinecap="round" />
        <ellipse cx="452" cy="262" rx="14" ry="8" fill="#E4574F" />
        <circle cx="452" cy="262" r="4" fill="#F7C744" />
        {/* the beckoning paw, always going */}
        <g className="deco-wave" style={{ transformOrigin: '474px 262px' }}>
          <ellipse cx="478" cy="250" rx="8" ry="11" fill="#FFF7EA" />
        </g>
      </g>
    ),
  },
  {
    id: 'menu-board',
    anchor: 'top',
    render: (k) => (
      <g key={k} className="deco-pop">
        <rect x="286" y="34" width="74" height="112" rx="5" fill="#F1E4C6" stroke="#8E5527" strokeWidth="4" />
        <g stroke="#5E4630" strokeWidth="4" strokeLinecap="round" opacity="0.55">
          <path d="M 300 58 h 46" />
          <path d="M 300 76 h 34" />
          <path d="M 300 94 h 44" />
          <path d="M 300 112 h 28" />
        </g>
        <circle cx="323" cy="30" r="5" fill="#8E5527" />
      </g>
    ),
  },
  {
    id: 'steam-pot',
    anchor: 'bottom',
    render: (k) => (
      <g key={k} className="deco-pop">
        <rect x="112" y="248" width="62" height="38" rx="8" fill="#3A4A42" />
        <rect x="106" y="240" width="74" height="12" rx="6" fill="#55665C" />
        <circle cx="143" cy="238" r="5" fill="#8E5527" />
        <g stroke="#BFE3D0" strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.6">
          <path className="cat-whiff" d="M 128 234 q -8 -14 0 -26 q 8 -12 0 -22" />
          <path className="cat-whiff cat-whiff-2" d="M 158 234 q 8 -14 0 -26 q -8 -12 0 -22" />
        </g>
      </g>
    ),
  },
  {
    id: 'window-moon',
    anchor: 'top',
    render: (k) => (
      <g key={k} className="deco-pop">
        <rect x="404" y="36" width="96" height="88" rx="5" fill="#123049" stroke="#6B4426" strokeWidth="5" />
        <circle cx="470" cy="62" r="14" fill="#F6EEDC" />
        <circle cx="464" cy="58" r="12" fill="#123049" />
        <g fill="#FFFBF2" opacity="0.75">
          <circle cx="424" cy="56" r="2" />
          <circle cx="440" cy="78" r="1.6" />
          <circle cx="418" cy="96" r="1.8" />
          <circle cx="480" cy="100" r="2.2" />
        </g>
        <line x1="452" y1="36" x2="452" y2="124" stroke="#6B4426" strokeWidth="4" />
        <line x1="404" y1="80" x2="500" y2="80" stroke="#6B4426" strokeWidth="4" />
      </g>
    ),
  },
  {
    id: 'chopstick-jar',
    anchor: 'bottom',
    render: (k) => (
      <g key={k} className="deco-pop">
        <path d="M 246 300 l 4 -46 l 34 0 l 4 46 Z" fill="#BFD8CC" />
        <g stroke="#C9A46A" strokeWidth="4" strokeLinecap="round">
          <line x1="258" y1="256" x2="252" y2="216" />
          <line x1="266" y1="256" x2="266" y2="212" />
          <line x1="274" y1="256" x2="281" y2="218" />
        </g>
        <rect x="244" y="250" width="46" height="9" rx="4" fill="#8FA8B8" />
      </g>
    ),
  },
  {
    id: 'tea-set',
    anchor: 'bottom',
    render: (k) => (
      <g key={k} className="deco-pop">
        <path d="M 396 300 l 0 -26 q 0 -14 18 -14 q 18 0 18 14 l 0 26 Z" fill="#3E7C6B" />
        <path d="M 432 272 q 12 4 8 16" stroke="#3E7C6B" strokeWidth="5" fill="none" />
        <path d="M 402 262 l -10 -8" stroke="#3E7C6B" strokeWidth="5" strokeLinecap="round" />
        <circle cx="414" cy="256" r="4" fill="#F7C744" />
        {[444, 466].map((x) => (
          <path key={x} d={`M ${x} 300 l 0 -12 q 0 -8 9 -8 q 9 0 9 8 l 0 12 Z`} fill="#BFD8CC" />
        ))}
      </g>
    ),
  },
  {
    id: 'wave-banner',
    anchor: 'top',
    render: (k) => (
      <g key={k} className="deco-pop">
        <rect x="520" y="188" width="140" height="60" rx="6" fill="#1F4B63" />
        <path
          d="M 528 226 q 18 -22 36 0 q 18 22 36 0 q 18 -22 36 0 q 10 12 16 4 l 0 12 l -124 0 Z"
          fill="#5EE7C0"
          opacity="0.85"
        />
        <path
          d="M 528 216 q 18 -20 36 0 q 18 20 36 0 q 18 -20 36 0"
          stroke="#FFFBF2"
          strokeWidth="3"
          fill="none"
          opacity="0.7"
        />
        <circle cx="640" cy="204" r="9" fill="#F7C744" />
      </g>
    ),
  },
  {
    id: 'string-lights',
    anchor: 'top',
    render: (k) => (
      <g key={k}>
        <path d="M 250 22 q 150 44 300 0" stroke="#3A4A42" strokeWidth="3" fill="none" />
        {[
          [290, 32, '#FF8A65'],
          [340, 40, '#F7C744'],
          [400, 44, '#8FC46B'],
          [460, 40, '#5EE7C0'],
          [510, 32, '#E4574F'],
        ].map(([x, y, c], i) => (
          <g key={i} className="deco-glow" style={{ animationDelay: `${i * 0.3}s` }}>
            <line x1={x as number} y1={(y as number) - 8} x2={x as number} y2={y as number} stroke="#3A4A42" strokeWidth="2" />
            <circle cx={x as number} cy={(y as number) + 7} r="7" fill={c as string} />
          </g>
        ))}
      </g>
    ),
  },
  {
    id: 'daruma',
    anchor: 'bottom',
    render: (k) => (
      <g key={k} className="deco-pop">
        <path d="M 496 300 q -18 -12 -18 -34 q 0 -30 24 -30 q 24 0 24 30 q 0 22 -18 34 Z" fill="#E4574F" />
        <ellipse cx="502" cy="252" rx="15" ry="12" fill="#F6EEDC" />
        <circle cx="496" cy="252" r="3.4" fill="#20302A" />
        <circle cx="508" cy="252" r="3.4" fill="#20302A" />
        <path d="M 494 262 q 8 5 16 0" stroke="#20302A" strokeWidth="2" fill="none" strokeLinecap="round" />
      </g>
    ),
  },
];

interface Props {
  unlocked: string[];
  /** id of the decoration to spotlight (just unlocked) */
  spotlight?: string | null;
  dim?: boolean;
  /** he is on a run — the room comes up to full and warms over */
  fever?: boolean;
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

function RestaurantScene({ unlocked, spotlight, dim, fever }: Props) {
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

      {/* The lights coming up on a run of right answers. It is the only reward
          in the game that arrives without stopping the game to hand it over. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(90% 70% at 50% 25%, rgba(255,196,96,0.55) 0%, rgba(255,150,60,0) 65%)',
          opacity: fever ? 1 : 0,
          transition: 'opacity 600ms',
        }}
      >
        {fever && <div className="absolute inset-0" style={{ animation: 'feverGlow 1.8s ease-in-out infinite' }} />}
      </div>

      {/* Dimming used to run at 0.55, which faded the thing he had earned at
          exactly the moment he was looking at it. It is only deep enough now to
          keep the sushi ahead of the background. */}
      <div
        className="absolute inset-0"
        style={{ opacity: fever ? 1 : dim ? 0.82 : 1, transition: 'opacity 500ms' }}
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
