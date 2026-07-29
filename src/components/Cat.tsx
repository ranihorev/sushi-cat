import { memo, useEffect, useState } from 'react';

export type Mood = 'idle' | 'anticipate' | 'eating' | 'confused' | 'happy' | 'asleep';

interface Props {
  /** 0..1 — the cat rounds out as the meal goes on */
  fullness: number;
  mood: Mood;
  /** -1..1 — which way the eyes drift */
  look?: number;
}

const FUR = '#FFF7EA';
const FUR_SHADE = '#F2E4CE';
const NORI = '#20302A';
const INK = '#20302A';
const BLUSH = '#FFB3A0';

/* One SVG, driven entirely by { fullness, mood }. Nothing about the game logic
   reaches in here — swapping this for illustrated art later means replacing this
   file and nothing else.

   The small idle behaviours (blinking, ear twitches, tail flicks) are what stop
   it reading as a static picture. They run on their own timers so the game
   never has to think about them. */
function CatArt({ fullness, mood, look = 0 }: Props) {
  const [blinking, setBlinking] = useState(false);
  const [fidget, setFidget] = useState<'none' | 'ear' | 'tail'>('none');
  const [chewing, setChewing] = useState(false);

  const restful = mood === 'idle' || mood === 'anticipate';

  // blink on a human-ish irregular rhythm, sometimes twice
  useEffect(() => {
    if (!restful && mood !== 'confused') return;
    let stop = false;
    let timer: number;

    const schedule = () => {
      timer = window.setTimeout(
        () => {
          if (stop) return;
          setBlinking(true);
          window.setTimeout(() => {
            setBlinking(false);
            if (Math.random() < 0.3) {
              window.setTimeout(() => {
                setBlinking(true);
                window.setTimeout(() => setBlinking(false), 110);
              }, 150);
            }
            schedule();
          }, 120);
        },
        2200 + Math.random() * 3800,
      );
    };
    schedule();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [restful, mood]);

  // an ear twitch or a tail flick now and then
  useEffect(() => {
    if (!restful) return;
    let stop = false;
    let timer: number;
    const schedule = () => {
      timer = window.setTimeout(
        () => {
          if (stop) return;
          setFidget(Math.random() < 0.55 ? 'ear' : 'tail');
          window.setTimeout(() => setFidget('none'), 700);
          schedule();
        },
        3500 + Math.random() * 4500,
      );
    };
    schedule();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [restful]);

  // eating is a sequence, not a pose: mouth opens, then two chews
  useEffect(() => {
    if (mood !== 'eating') {
      setChewing(false);
      return;
    }
    const t = window.setTimeout(() => setChewing(true), 340);
    return () => clearTimeout(t);
  }, [mood]);

  const eating = mood === 'eating';
  const anticipating = mood === 'anticipate';
  const asleep = mood === 'asleep';
  const confused = mood === 'confused';
  const happy = mood === 'happy';

  const grow = 1 + fullness * 0.16;
  const px = look * 3.2;
  const eyesClosed = asleep || happy || (eating && chewing) || blinking;

  const Eye = ({ cx }: { cx: number }) => {
    if (eyesClosed) {
      // closed and curving up when pleased, flat when just blinking
      const dir = happy || eating || asleep ? -1 : 0.15;
      return (
        <path
          d={`M ${cx - 9} 103 q 9 ${8 * dir} 18 0`}
          stroke={INK}
          strokeWidth="4"
          strokeLinecap="round"
          fill="none"
        />
      );
    }
    // pupils widen when a piece is on the way in
    const r = anticipating ? 1.18 : 1;
    return (
      <g>
        <ellipse cx={cx + px} cy="102" rx={8.5 * r} ry={10 * r} fill={INK} />
        <circle cx={cx + px + 3} cy={98} r={3 * r} fill="#fff" />
        <circle cx={cx + px - 2.5} cy="105.5" r="1.5" fill="#fff" opacity="0.75" />
      </g>
    );
  };

  const mouth = eating ? (
    <g className={chewing ? 'cat-chew' : undefined} style={{ transformOrigin: '120px 126px' }}>
      <ellipse cx="120" cy="129" rx={chewing ? 11 : 17} ry={chewing ? 9 : 15} fill="#7A2E33" />
      <ellipse cx="120" cy={chewing ? 133 : 136} rx={chewing ? 7 : 10} ry={5} fill="#F4837E" />
    </g>
  ) : anticipating ? (
    <ellipse cx="120" cy="128" rx="11" ry="10" fill="#7A2E33" />
  ) : confused ? (
    <path
      d="M 110 128 q 5 -5 10 0 q 5 5 10 0"
      stroke={INK}
      strokeWidth="3"
      fill="none"
      strokeLinecap="round"
    />
  ) : happy ? (
    <g>
      <path d="M 106 124 q 14 16 28 0" stroke={INK} strokeWidth="3.4" fill="none" strokeLinecap="round" />
      <path d="M 111 130 q 9 8 18 0" fill="#F4837E" />
    </g>
  ) : asleep ? (
    <path d="M 114 126 q 6 5 12 0" stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" />
  ) : (
    <g stroke={INK} strokeWidth="3.2" fill="none" strokeLinecap="round">
      <path d="M 108 124 q 6 7 12 0" />
      <path d="M 120 124 q 6 7 12 0" />
    </g>
  );

  const bodyClass = eating
    ? 'cat-chomp'
    : asleep
      ? 'cat-sleep'
      : happy
        ? 'cat-bounce'
        : anticipating
          ? 'cat-lean'
          : 'cat-bob';

  return (
    <svg viewBox="0 0 240 210" className="h-full w-full overflow-visible">
      <defs>
        <radialGradient id="fur" cx="42%" cy="30%" r="78%">
          <stop offset="0%" stopColor="#FFFDF7" />
          <stop offset="100%" stopColor={FUR} />
        </radialGradient>
        <linearGradient id="band" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#2B4038" />
          <stop offset="50%" stopColor={NORI} />
          <stop offset="100%" stopColor="#2B4038" />
        </linearGradient>
      </defs>

      {/* ground shadow — grows with the cat */}
      <ellipse cx="120" cy="196" rx={64 * grow} ry="9" fill="rgba(0,0,0,0.28)" />

      <g
        style={{
          transform: `scale(${grow})`,
          transformOrigin: '120px 196px',
          transition: 'transform 700ms cubic-bezier(.34,1.56,.64,1)',
        }}
      >
        <g className={bodyClass}>
          {/* tail */}
          <path
            className={fidget === 'tail' ? 'cat-tail-flick' : 'cat-tail'}
            d="M 178 172 q 42 -4 34 -46"
            stroke={FUR}
            strokeWidth="15"
            strokeLinecap="round"
            fill="none"
            style={{ transformOrigin: '178px 172px' }}
          />

          {/* body */}
          <ellipse cx="120" cy="160" rx="66" ry="45" fill="url(#fur)" />
          <ellipse cx="120" cy="168" rx="44" ry="31" fill={FUR_SHADE} opacity="0.55" />
          {/* front paws */}
          <ellipse cx="93" cy="192" rx="18" ry="11" fill="url(#fur)" />
          <ellipse cx="147" cy="192" rx="18" ry="11" fill="url(#fur)" />
          <g stroke={FUR_SHADE} strokeWidth="1.6" strokeLinecap="round">
            <line x1="89" y1="188" x2="89" y2="195" />
            <line x1="96" y1="187" x2="96" y2="195" />
            <line x1="143" y1="188" x2="143" y2="195" />
            <line x1="150" y1="187" x2="150" y2="195" />
          </g>

          {/* head — tilts when puzzled, cranes forward when food is coming */}
          <g
            className={confused ? 'cat-tilt' : anticipating ? 'cat-crane' : undefined}
            style={{ transformOrigin: '120px 140px' }}
          >
            {/* ears */}
            <g
              className={fidget === 'ear' ? 'cat-ear-twitch' : undefined}
              style={{ transformOrigin: '74px 78px' }}
            >
              <path d="M 74 82 L 68 44 L 104 68 Z" fill="url(#fur)" />
              <path d="M 81 78 L 78 55 L 97 68 Z" fill={BLUSH} />
            </g>
            <path d="M 166 82 L 172 44 L 136 68 Z" fill="url(#fur)" />
            <path d="M 159 78 L 162 55 L 143 68 Z" fill={BLUSH} />

            {/* head */}
            <ellipse cx="120" cy="106" rx="57" ry="51" fill="url(#fur)" />

            {/* chef's headband */}
            <path d="M 66 84 q 54 -18 108 0 l 0 12 q -54 -18 -108 0 Z" fill="url(#band)" />
            <circle cx="120" cy="83" r="7" fill="#FF8A65" />
            <path
              d="M 66 88 q -12 4 -16 16 q 10 -6 18 -6"
              fill={NORI}
              className="cat-ribbon"
              style={{ transformOrigin: '66px 88px' }}
            />

            <Eye cx={100} />
            <Eye cx={140} />

            {/* blush — deepens when pleased or full */}
            <ellipse
              cx="86"
              cy="119"
              rx="11"
              ry="7"
              fill={BLUSH}
              opacity={happy || eating ? 0.78 : 0.42 + fullness * 0.25}
            />
            <ellipse
              cx="154"
              cy="119"
              rx="11"
              ry="7"
              fill={BLUSH}
              opacity={happy || eating ? 0.78 : 0.42 + fullness * 0.25}
            />

            {/* nose */}
            <path d="M 115 117 L 125 117 L 120 123 Z" fill="#FF8A65" />
            <line x1="120" y1="123" x2="120" y2="126" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />

            {mouth}

            {/* whiskers */}
            <g stroke={INK} strokeWidth="2.2" strokeLinecap="round" opacity="0.55">
              <line x1="66" y1="114" x2="38" y2="107" />
              <line x1="66" y1="121" x2="38" y2="124" />
              <line x1="174" y1="114" x2="202" y2="107" />
              <line x1="174" y1="121" x2="202" y2="124" />
            </g>
          </g>

          {/* mood extras */}
          {asleep && (
            <g fill="#BFE3D0" fontWeight="800" fontFamily="ui-rounded, system-ui">
              <text className="cat-zzz" x="182" y="58" fontSize="22">z</text>
              <text className="cat-zzz cat-zzz-2" x="203" y="40" fontSize="16">z</text>
            </g>
          )}
          {confused && (
            <text
              className="cat-pop"
              x="188"
              y="56"
              fontSize="40"
              fontWeight="900"
              fill="#F7C744"
              fontFamily="ui-rounded, system-ui"
            >
              ?
            </text>
          )}
          {happy && (
            <g>
              <g className="cat-sparkle" fill="#F7C744">
                <path d="M 186 52 l 4 10 l 10 4 l -10 4 l -4 10 l -4 -10 l -10 -4 l 10 -4 Z" />
              </g>
              <g className="cat-sparkle cat-sparkle-2" fill="#F7C744">
                <path d="M 46 66 l 3 7 l 7 3 l -7 3 l -3 7 l -3 -7 l -7 -3 l 7 -3 Z" />
              </g>
              <g className="cat-heart" fill="#FF8A65">
                <path d="M 152 44 c -4 -6 -14 -3 -14 5 c 0 7 9 12 14 17 c 5 -5 14 -10 14 -17 c 0 -8 -10 -11 -14 -5 Z" />
              </g>
            </g>
          )}
        </g>
      </g>
    </svg>
  );
}

export const Cat = memo(CatArt);
