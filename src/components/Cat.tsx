import { memo, useEffect, useState } from 'react';

export type Mood =
  | 'idle'
  | 'anticipate'
  | 'eating'
  /** leaning over a piece he has been handed, having a good smell of it */
  | 'sniff'
  /** he has smelled it, and he does not want it */
  | 'yuck'
  | 'happy'
  | 'asleep';

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
    if (!restful) return;
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
  }, [restful]);

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
  const sniffing = mood === 'sniff';
  const yuck = mood === 'yuck';
  const happy = mood === 'happy';

  const grow = 1 + fullness * 0.16;
  const px = look * 3.2;
  const eyesClosed = asleep || happy || yuck || (eating && chewing) || blinking;

  const Eye = ({ cx }: { cx: number }) => {
    if (eyesClosed) {
      /* Closed and curving up when pleased. Squeezed the other way for `yuck`,
         which is the difference between a cat enjoying itself and a cat trying
         not to taste something. */
      const dir = yuck ? 1 : happy || eating || asleep ? -1 : 0.15;
      return (
        <path
          d={`M ${cx - 9} ${yuck ? 103 : 101} q 9 ${8 * dir} 18 0`}
          stroke={INK}
          strokeWidth={yuck ? 4.6 : 4}
          strokeLinecap="round"
          fill="none"
        />
      );
    }
    // pupils widen when a piece is on the way in, and drop to the piece he sniffs
    const r = anticipating ? 1.18 : 1;
    const cy = sniffing ? 105 : 100;
    return (
      <g>
        <ellipse cx={cx + px} cy={cy} rx={8.5 * r} ry={10 * r} fill={INK} />
        <circle cx={cx + px + 3} cy={cy - 4} r={3 * r} fill="#fff" />
        <circle cx={cx + px - 2.5} cy={cy + 3.5} r="1.5" fill="#fff" opacity="0.75" />
      </g>
    );
  };

  const mouth = eating ? (
    <g className={chewing ? 'cat-chew' : undefined} style={{ transformOrigin: '120px 124px' }}>
      <ellipse cx="120" cy="127" rx={chewing ? 11 : 17} ry={chewing ? 9 : 15} fill="#7A2E33" />
      <ellipse cx="120" cy={chewing ? 131 : 134} rx={chewing ? 7 : 10} ry={5} fill="#F4837E" />
    </g>
  ) : anticipating ? (
    <ellipse cx="120" cy="126" rx="11" ry="10" fill="#7A2E33" />
  ) : sniffing ? (
    // pursed, the way a mouth goes when the nose is doing the work
    <ellipse cx="120" cy="126" rx="5.5" ry="4.5" fill="#7A2E33" />
  ) : yuck ? (
    /* Open, flat, and with the tongue right out. This is the one pose in the
       whole game that says "no" without a word in it, so it is drawn big. */
    <g>
      <path d="M 104 122 q 16 12 32 0 q -4 14 -16 14 q -12 0 -16 -14 Z" fill="#7A2E33" />
      <path
        d="M 113 133 q 7 -3 14 0 q 1 14 -7 15 q -8 -1 -7 -15 Z"
        fill="#F4837E"
        stroke="#D9605C"
        strokeWidth="1.4"
      />
      <line
        x1="120"
        y1="138"
        x2="120"
        y2="146"
        stroke="#D9605C"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </g>
  ) : happy ? (
    <g>
      <path d="M 106 122 q 14 16 28 0" stroke={INK} strokeWidth="3.4" fill="none" strokeLinecap="round" />
      <path d="M 111 128 q 9 8 18 0" fill="#F4837E" />
    </g>
  ) : asleep ? (
    <path d="M 114 124 q 6 5 12 0" stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" />
  ) : (
    <g stroke={INK} strokeWidth="3.2" fill="none" strokeLinecap="round">
      <path d="M 108 123 q 6 7 12 0" />
      <path d="M 120 123 q 6 7 12 0" />
    </g>
  );

  const bodyClass = eating
    ? 'cat-chomp'
    : asleep
      ? 'cat-sleep'
      : happy
        ? 'cat-bounce'
        : yuck
          ? 'cat-recoil'
          : anticipating || sniffing
            ? 'cat-lean'
            : 'cat-bob';

  return (
    <svg viewBox="0 0 240 210" className="h-full w-full overflow-visible">
      <defs>
        <radialGradient id="fur" cx="42%" cy="30%" r="78%">
          <stop offset="0%" stopColor="#FFFDF7" />
          <stop offset="100%" stopColor={FUR} />
        </radialGradient>
        <radialGradient id="chin" cx="50%" cy="50%" r="50%">
          <stop offset="52%" stopColor="#000" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
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
          {/* tail — a tapered shape rather than a uniform stroke, so it reads
              as part of the animal instead of a rope stuck to its side */}
          <path
            className={fidget === 'tail' ? 'cat-tail-flick' : 'cat-tail'}
            d="M 166 186 C 202 192, 222 170, 212 136 C 209 125, 202 117, 198 122 C 205 134, 204 154, 187 164 C 179 169, 172 171, 166 172 Z"
            fill={FUR}
            style={{ transformOrigin: '168px 180px' }}
          />

          {/* body — a sitting silhouette, wide at the base and narrowing to the
              shoulders. An ellipse read as a ball with a head stuck on it. */}
          <path
            d="M 62 196 C 55 189, 52 178, 52 164 C 52 136, 82 118, 120 118 C 158 118, 188 136, 188 164 C 188 178, 185 189, 178 196 Z"
            fill="url(#fur)"
          />
          {/* chest marking */}
          <ellipse cx="120" cy="170" rx="40" ry="27" fill={FUR_SHADE} opacity="0.38" />

          {/* front paws */}
          <ellipse cx="93" cy="190" rx="18" ry="10" fill="url(#fur)" />
          <ellipse cx="147" cy="190" rx="18" ry="10" fill="url(#fur)" />
          <g stroke={FUR_SHADE} strokeWidth="1.6" strokeLinecap="round">
            <line x1="89" y1="185" x2="89" y2="193" />
            <line x1="97" y1="184" x2="97" y2="193" />
            <line x1="143" y1="185" x2="143" y2="193" />
            <line x1="151" y1="184" x2="151" y2="193" />
          </g>

          {/* the head casts onto the chest — without this the two shapes merge
              into a single blob and the cat has no chin. Soft-edged: a plain
              ellipse here reads as a grey smudge on the chest. */}
          <ellipse cx="120" cy="118" rx="58" ry="48" fill="url(#chin)" />

          {/* head — cranes forward over food, shakes itself clear of a bad smell */}
          <g
            className={yuck ? 'cat-headshake' : anticipating || sniffing ? 'cat-crane' : undefined}
            style={{ transformOrigin: '120px 140px' }}
          >
            {/* ears, behind the head so their bases disappear into it. They go
                flat against the head for `yuck` — the tell every child who has
                met a cat already knows how to read. */}
            <g
              className={
                yuck ? 'cat-ear-flat-l' : fidget === 'ear' ? 'cat-ear-twitch' : undefined
              }
              style={{ transformOrigin: '80px 76px' }}
            >
              <path d="M 78 80 L 63 26 L 112 58 Z" fill="url(#fur)" />
              <path d="M 85 73 L 75 40 L 104 60 Z" fill={BLUSH} />
            </g>
            <g
              className={yuck ? 'cat-ear-flat-r' : undefined}
              style={{ transformOrigin: '160px 76px' }}
            >
              <path d="M 162 80 L 177 26 L 128 58 Z" fill="url(#fur)" />
              <path d="M 155 73 L 165 40 L 136 60 Z" fill={BLUSH} />
            </g>

            {/* head */}
            <ellipse cx="120" cy="98" rx="55" ry="49" fill="url(#fur)" />

            {/* hachimaki — follows the curve of the forehead, knotted at the
                side with two ends trailing off it */}
            <path d="M 67 82 Q 120 61 173 82 L 173 94 Q 120 73 67 94 Z" fill="url(#band)" />
            <circle cx="120" cy="74" r="6.5" fill="#FF8A65" />


            <Eye cx={100} />
            <Eye cx={140} />

            {/* blush — deepens when pleased or full */}
            <ellipse
              cx="91"
              cy="131"
              rx="10.5"
              ry="6.5"
              fill={BLUSH}
              opacity={happy || eating ? 0.78 : 0.42 + fullness * 0.25}
            />
            <ellipse
              cx="149"
              cy="131"
              rx="10.5"
              ry="6.5"
              fill={BLUSH}
              opacity={happy || eating ? 0.78 : 0.42 + fullness * 0.25}
            />

            {/* nose — it twitches while he works out what he has been given */}
            <g
              className={sniffing ? 'cat-nose-twitch' : undefined}
              style={{ transformOrigin: '120px 117px' }}
            >
              <path d="M 114 114 L 126 114 L 120 121 Z" fill="#FF8A65" />
              <line x1="120" y1="121" x2="120" y2="124" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
            </g>
            {/* the wrinkle over the nose that comes with the tongue */}
            {yuck && (
              <g stroke={INK} strokeWidth="2.2" strokeLinecap="round" fill="none" opacity="0.55">
                <path d="M 112 108 q 8 -5 16 0" />
                <path d="M 114 103 q 6 -4 12 0" />
              </g>
            )}

            {mouth}

            {/* whiskers — rooted at the muzzle and curved. Anchored out at the
                edge of the head they read as loose scratches floating in air. */}
            <g
              stroke="#A2988A"
              strokeWidth="1.8"
              strokeLinecap="round"
              fill="none"
              opacity="0.75"
            >
              <path d="M 108 113 Q 86 109 54 103" />
              <path d="M 108 120 Q 86 122 52 127" />
              <path d="M 132 113 Q 154 109 186 103" />
              <path d="M 132 120 Q 154 122 188 127" />
            </g>
          </g>

          {/* mood extras */}
          {asleep && (
            <g fill="#BFE3D0" fontWeight="800" fontFamily="ui-rounded, system-ui">
              <text className="cat-zzz" x="182" y="58" fontSize="22">z</text>
              <text className="cat-zzz cat-zzz-2" x="203" y="40" fontSize="16">z</text>
            </g>
          )}
          {/* the curls of smell coming off whatever is under his nose. Kept
              clear of the head, where they would cross the headband. */}
          {sniffing && (
            <g stroke="#BFE3D0" strokeLinecap="round" fill="none">
              <path className="cat-whiff" d="M 184 120 q 9 -9 0 -18 q -9 -9 0 -18" strokeWidth="3" />
              <path
                className="cat-whiff cat-whiff-2"
                d="M 199 116 q 7 -7 0 -14 q -7 -7 0 -14"
                strokeWidth="2.4"
                opacity="0.75"
              />
            </g>
          )}
          {/* No cross, no red mark, nothing that scores him. The flat ears and
              the tongue are the whole message, and they read as a cat being a
              cat rather than as the game telling him he is wrong. */}
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
