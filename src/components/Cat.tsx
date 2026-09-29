import { memo, useEffect, useId, useState } from 'react';

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

/**
 * What the cat does after he swallows.
 *
 * The single loudest complaint about the old game was that every mouthful was
 * identical: one chomp, one pleased face, next question. The reaction is the
 * prize, so there has to be more than one of them — a child comes back to find
 * out which one he gets, not to be told he was right again.
 *
 * Every reaction is built from the same head and body. They differ in the eyes,
 * the mouth, one animation and one small piece of overlay art, which is what
 * keeps sixteen of them affordable.
 */
export const REACTIONS = [
  'hiccup',
  'burp',
  'spicy',
  'balloon',
  'sleepy',
  'hearts',
  'stars',
  'dizzy',
  'bubble',
  'gulp',
  'fishbone',
  'lick',
  'dance',
  'huge',
  'sneeze',
  'float',
] as const;

export type Reaction = (typeof REACTIONS)[number];

interface Props {
  /** 0..1 — the cat rounds out as the meal goes on */
  fullness: number;
  mood: Mood;
  /** -1..1 — which way the eyes drift */
  look?: number;
  /** which of the sixteen he does after swallowing — only read while `happy` */
  reaction?: Reaction | null;
  /** he is being stroked: eyes shut, a lean into the finger, hearts */
  petting?: boolean;
  /** which cat this is — the sushi cat is calico, the cafe has the others */
  coat?: CoatName;
  /** the sushi chef's headband; the cafe cats are off duty */
  chef?: boolean;
}

/**
 * A cat's colouring. Everything but `fur` is optional, and each extra is one
 * layer drawn over the same shapes, so a new cat is a few colours rather than
 * a new drawing.
 */
interface Coat {
  fur: string;
  /** the lit side of the fur gradient */
  light: string;
  /** chest, paw lines, the lump when he gulps */
  shade: string;
  /** the big warm patch over one ear and eye, and on the tail */
  patch?: string;
  /** the smaller dark patch over the other ear and on the back */
  patch2?: string;
  /** tabby stripes on the forehead, cheeks, sides and tail */
  stripes?: string;
  /** siamese points: ears, muzzle, paws and tail */
  points?: string;
}

export const COATS = {
  calico: { fur: '#FFF7EA', light: '#FFFDF7', shade: '#F2E4CE', patch: '#F4A261', patch2: '#5E534D' },
  ginger: { fur: '#F7A95E', light: '#FFC994', shade: '#E8904A', stripes: '#D5742C' },
  grey: { fur: '#AEB8C2', light: '#D0D8DF', shade: '#97A3AE', stripes: '#7C8793' },
  siamese: { fur: '#F5E9D8', light: '#FFF8EE', shade: '#E6D5BD', points: '#6E5242' },
  cream: { fur: '#FFF7EA', light: '#FFFDF7', shade: '#F2E4CE' },
  tabby: { fur: '#CDA57C', light: '#E6C59E', shade: '#B88E63', stripes: '#8E6843' },
} satisfies Record<string, Coat>;

export type CoatName = keyof typeof COATS;

const NORI = '#20302A';
const INK = '#20302A';
const BLUSH = '#FFB3A0';
/** one outline round the whole animal, so head, body and paws read as separate shapes */
const LINE = '#3A2F2C';
const OUTLINE = { stroke: LINE, strokeWidth: 2.6, strokeLinejoin: 'round' as const };

const TAIL =
  'M 166 186 C 202 192, 222 170, 212 136 C 209 125, 202 117, 198 122 C 205 134, 204 154, 187 164 C 179 169, 172 171, 166 172 Z';
const BODY =
  'M 62 196 C 55 189, 52 178, 52 164 C 52 136, 82 118, 120 118 C 158 118, 188 136, 188 164 C 188 178, 185 189, 178 196 Z';

/** The plain pleased face, for the beats where no reaction is running. */
const PleasedExtras = () => (
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
);

/* One SVG, driven entirely by { fullness, mood }. Nothing about the game logic
   reaches in here — swapping this for illustrated art later means replacing this
   file and nothing else.

   The small idle behaviours (blinking, ear twitches, tail flicks) are what stop
   it reading as a static picture. They run on their own timers so the game
   never has to think about them. */
function CatArt({
  fullness,
  mood,
  look = 0,
  reaction = null,
  petting = false,
  coat: coatName = 'calico',
  chef = true,
}: Props) {
  const coat: Coat = COATS[coatName];
  const FUR = coat.fur;
  const FUR_SHADE = coat.shade;
  /* Ids have to be unique on the page: the cafe draws several cats at once, and
     a second cat's gradient under the same id would paint the first one. */
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = (name: string) => `${name}-${uid}`;
  const url = (name: string) => `url(#${id(name)})`;

  const [blinking, setBlinking] = useState(false);
  const [fidget, setFidget] = useState<'none' | 'ear' | 'tail'>('none');
  const [chewing, setChewing] = useState(false);

  const restful = (mood === 'idle' || mood === 'anticipate') && !petting;

  /** the reaction only exists in the pleased beat right after he swallows */
  const rx: Reaction | null = mood === 'happy' ? reaction : null;

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

  /* He is visibly rounder by the end of a meal. At the old 0.16 the change was
     spread so thinly across eight mouthfuls that nobody ever saw it, and
     "look what you did" is the clearest thing this channel can say. */
  const grow = (1 + fullness * 0.3) * (rx === 'huge' ? 1.16 : 1);
  const px = look * 3.2;

  /* Some reactions need the eyes open, and a few replace them altogether. */
  const eyesWide =
    rx === 'hiccup' || rx === 'sneeze' || rx === 'huge' || rx === 'balloon' || rx === 'spicy';
  const eyesDrawn = rx === 'hearts' || rx === 'stars' || rx === 'dizzy';
  const eyesClosed =
    !eyesWide &&
    !eyesDrawn &&
    (asleep || petting || happy || yuck || (eating && chewing) || blinking);

  const Eye = ({ cx }: { cx: number }) => {
    if (rx === 'hearts') {
      return (
        <path
          className="cat-eye-pulse"
          d={`M ${cx} ${109} c -5 -8 -16 -4 -16 5 c 0 7 10 12 16 17 c 6 -5 16 -10 16 -17 c 0 -9 -11 -13 -16 -5 Z`}
          fill="#FF5A7A"
          style={{ transformOrigin: `${cx}px 106px` }}
        />
      );
    }
    if (rx === 'stars') {
      return (
        <path
          className="cat-eye-pulse"
          d={`M ${cx} 86 l 4.5 12 l 12.5 0.6 l -9.8 8 l 3.4 12.2 l -10.6 -7 l -10.6 7 l 3.4 -12.2 l -9.8 -8 l 12.5 -0.6 Z`}
          fill="#F7C744"
          style={{ transformOrigin: `${cx}px 100px` }}
        />
      );
    }
    if (rx === 'dizzy') {
      return (
        <g
          className="cat-spin-slow"
          style={{ transformOrigin: `${cx}px 100px` }}
          stroke={INK}
          strokeWidth="2.6"
          fill="none"
          strokeLinecap="round"
        >
          <path
            d={`M ${cx} 100 m 0 -2 a 2 2 0 1 1 -2 2 a 5 5 0 1 0 5 -5 a 8.5 8.5 0 1 0 -8.5 8.5`}
          />
        </g>
      );
    }
    if (rx === 'sleepy') {
      // half shut, the lid coming down over the top of the eye
      return (
        <g>
          <path
            d={`M ${cx - 9} 100 a 9 9 0 0 0 18 0 Z`}
            fill={INK}
          />
          <path
            d={`M ${cx - 10} 100 h 20`}
            stroke={INK}
            strokeWidth="3.4"
            strokeLinecap="round"
          />
        </g>
      );
    }
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
    const r = eyesWide ? 1.34 : anticipating ? 1.18 : 1;
    const cy = sniffing ? 105 : 100;
    return (
      <g>
        <ellipse cx={cx + px} cy={cy} rx={9.5 * r} ry={11 * r} fill={INK} />
        {/* a warm glint low in the eye — the cheapest way to make them shine */}
        <ellipse cx={cx + px} cy={cy + 5 * r} rx={6 * r} ry={3.5 * r} fill="#4E7A5E" opacity="0.8" />
        <circle cx={cx + px + 3.4} cy={cy - 4.4} r={3.6 * r} fill="#fff" />
        <circle cx={cx + px - 2.5} cy={cy + 3.5} r="1.5" fill="#fff" opacity="0.75" />
      </g>
    );
  };

  /* A grin, a gape or a tongue. The mouth carries most of the difference
     between one reaction and the next, so it is switched before anything the
     mood would otherwise have chosen. */
  const grin = (
    <g>
      <path d="M 104 120 q 16 18 32 0 q -3 17 -16 17 q -13 0 -16 -17 Z" fill="#7A2E33" />
      <path d="M 112 132 q 8 -3 16 0 q -2 10 -8 10 q -6 0 -8 -10 Z" fill="#F4837E" />
    </g>
  );
  const gape = (open: number) => (
    <g>
      <ellipse cx="120" cy="128" rx={open} ry={open * 0.92} fill="#7A2E33" />
      <ellipse cx="120" cy={132} rx={open * 0.55} ry={open * 0.4} fill="#F4837E" />
    </g>
  );
  const smile = (
    <g>
      <path
        d="M 106 122 q 14 16 28 0"
        stroke={INK}
        strokeWidth="3.4"
        fill="none"
        strokeLinecap="round"
      />
      <path d="M 111 128 q 9 8 18 0" fill="#F4837E" />
    </g>
  );

  const rxMouth =
    rx === 'hiccup' ? gape(9)
    : rx === 'burp' ? gape(19)
    : rx === 'sneeze' ? gape(21)
    : rx === 'stars' || rx === 'dance' || rx === 'huge' ? grin
    : rx === 'spicy' ? (
        <g>
          <path d="M 102 120 q 18 20 36 0 q -4 20 -18 20 q -14 0 -18 -20 Z" fill="#7A2E33" />
          <path
            d="M 112 134 q 8 -4 16 0 q 2 20 -8 22 q -10 -2 -8 -22 Z"
            fill="#F4837E"
            stroke="#D9605C"
            strokeWidth="1.4"
          />
        </g>
      )
    : rx === 'lick' ? (
        <g>
          <path d="M 108 122 q 12 12 24 0" stroke={INK} strokeWidth="3.2" fill="none" strokeLinecap="round" />
          <path
            className="cat-tongue-lick"
            d="M 128 124 q 16 -2 15 10 q -1 11 -15 8 Z"
            fill="#F4837E"
            stroke="#D9605C"
            strokeWidth="1.3"
            style={{ transformOrigin: '126px 128px' }}
          />
        </g>
      )
    : rx === 'balloon' || rx === 'gulp' ? (
        <path d="M 111 126 q 9 5 18 0" stroke={INK} strokeWidth="3.4" fill="none" strokeLinecap="round" />
      )
    : rx === 'dizzy' ? (
        <path
          d="M 105 127 q 6 -7 12 0 q 6 7 12 0 q 6 -7 6 0"
          stroke={INK}
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
      )
    : rx === 'sleepy' ? <ellipse cx="120" cy="130" rx="10" ry="13" fill="#7A2E33" />
    : rx === 'bubble' || rx === 'fishbone' ? gape(8)
    : rx === 'hearts' || rx === 'float' ? smile
    : null;

  const mouth = rxMouth ?? (eating ? (
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
  ) : happy || petting ? (
    smile
  ) : asleep ? (
    <path d="M 114 124 q 6 5 12 0" stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" />
  ) : (
    <g stroke={INK} strokeWidth="3.2" fill="none" strokeLinecap="round">
      <path d="M 108 123 q 6 7 12 0" />
      <path d="M 120 123 q 6 7 12 0" />
    </g>
  ));

  const RX_BODY: Record<Reaction, string> = {
    hiccup: 'cat-hiccup',
    burp: 'cat-bounce',
    spicy: 'cat-shiver',
    balloon: 'cat-inflate',
    sleepy: 'cat-nod',
    hearts: 'cat-bounce',
    stars: 'cat-bounce',
    dizzy: 'cat-wobble',
    bubble: 'cat-bob',
    gulp: 'cat-chomp',
    fishbone: 'cat-bounce',
    lick: 'cat-bob',
    dance: 'cat-dance',
    huge: 'cat-bounce',
    sneeze: 'cat-sneeze',
    float: 'cat-float',
  };

  const bodyClass = rx
    ? RX_BODY[rx]
    : petting
      ? 'cat-nuzzle'
      : eating
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
    /* `data-reaction` is the only handle anything outside this file has on which
       of the sixteen is running. It costs one attribute and it is what lets a
       test prove he is not being shown the same mouthful twice in a row. */
    <svg
      viewBox="0 0 240 210"
      className="h-full w-full overflow-visible"
      data-reaction={rx ?? undefined}
    >
      <defs>
        <radialGradient id={id('fur')} cx="42%" cy="30%" r="78%">
          <stop offset="0%" stopColor={coat.light} />
          <stop offset="100%" stopColor={FUR} />
        </radialGradient>
        <radialGradient id={id('chin')} cx="50%" cy="50%" r="50%">
          <stop offset="52%" stopColor="#000" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id('band')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#2B4038" />
          <stop offset="50%" stopColor={NORI} />
          <stop offset="100%" stopColor="#2B4038" />
        </linearGradient>
        <clipPath id={id('head')}>
          <ellipse cx="120" cy="98" rx="55" ry="49" />
        </clipPath>
        <clipPath id={id('tail')}>
          <path d={TAIL} />
        </clipPath>
        <clipPath id={id('body')}>
          <path d={BODY} />
        </clipPath>
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
          <g
            className={fidget === 'tail' ? 'cat-tail-flick' : 'cat-tail'}
            style={{ transformOrigin: '168px 180px' }}
          >
            <path d={TAIL} fill={coat.points ?? coat.patch ?? FUR} {...OUTLINE} />
            {coat.stripes && (
              <g
                clipPath={url('tail')}
                stroke={coat.stripes}
                strokeWidth="5"
                strokeLinecap="round"
              >
                <path d="M 186 158 l 14 14" />
                <path d="M 198 146 l 16 4" />
                <path d="M 202 130 l 14 -6" />
              </g>
            )}
            <path d={TAIL} fill="none" {...OUTLINE} />
          </g>

          {/* body — a sitting silhouette, wide at the base and narrowing to the
              shoulders. An ellipse read as a ball with a head stuck on it. */}
          <path d={BODY} fill={url('fur')} {...OUTLINE} />
          <g clipPath={url('body')}>
            {coat.patch2 && <ellipse cx="66" cy="150" rx="24" ry="20" fill={coat.patch2} />}
            {coat.patch && <ellipse cx="182" cy="178" rx="26" ry="22" fill={coat.patch} />}
            {coat.stripes && (
              <g stroke={coat.stripes} strokeWidth="5" strokeLinecap="round" fill="none">
                <path d="M 52 150 q 12 2 18 10" />
                <path d="M 54 170 q 12 0 17 8" />
                <path d="M 188 150 q -12 2 -18 10" />
                <path d="M 186 170 q -12 0 -17 8" />
              </g>
            )}
          </g>
          {/* chest marking — a pale bib, which is what makes him look fluffy */}
          <ellipse cx="120" cy="170" rx="34" ry="25" fill="#FFFDF7" opacity={coat.stripes ? 0.55 : 0.5} />

          {/* front paws */}
          <ellipse cx="93" cy="190" rx="18" ry="10" fill={coat.points ?? coat.light} {...OUTLINE} />
          <ellipse cx="147" cy="190" rx="18" ry="10" fill={coat.points ?? coat.light} {...OUTLINE} />
          <g stroke={coat.points ? coat.light : LINE} strokeWidth="1.8" strokeLinecap="round" opacity="0.6">
            <line x1="89" y1="185" x2="89" y2="193" />
            <line x1="97" y1="184" x2="97" y2="193" />
            <line x1="143" y1="185" x2="143" y2="193" />
            <line x1="151" y1="184" x2="151" y2="193" />
          </g>

          {/* the head casts onto the chest — without this the two shapes merge
              into a single blob and the cat has no chin. Soft-edged: a plain
              ellipse here reads as a grey smudge on the chest. */}
          <ellipse cx="120" cy="118" rx="58" ry="48" fill={url('chin')} />

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
              <path d="M 78 80 Q 60 44 66 28 Q 92 38 112 58 Z" fill={coat.points ?? coat.patch2 ?? FUR} {...OUTLINE} />
              <path d="M 86 72 Q 74 50 76 40 Q 92 48 104 60 Z" fill={BLUSH} />
            </g>
            <g
              className={yuck ? 'cat-ear-flat-r' : undefined}
              style={{ transformOrigin: '160px 76px' }}
            >
              <path d="M 162 80 Q 180 44 174 28 Q 148 38 128 58 Z" fill={coat.points ?? coat.patch ?? FUR} {...OUTLINE} />
              <path d="M 154 72 Q 166 50 164 40 Q 148 48 136 60 Z" fill={BLUSH} />
            </g>

            {/* head */}
            <ellipse cx="120" cy="98" rx="55" ry="49" fill={url('fur')} {...OUTLINE} />
            <g clipPath={url('head')}>
              {coat.patch && <ellipse cx="156" cy="70" rx="32" ry="28" fill={coat.patch} />}
              {coat.patch2 && <ellipse cx="80" cy="58" rx="22" ry="16" fill={coat.patch2} />}
              {coat.points && (
                <ellipse cx="120" cy="120" rx="26" ry="20" fill={coat.points} opacity="0.75" />
              )}
              {coat.stripes && (
                <g stroke={coat.stripes} strokeWidth="4" strokeLinecap="round" fill="none">
                  <path d="M 110 52 l 3 13" />
                  <path d="M 120 50 v 15" />
                  <path d="M 130 52 l -3 13" />
                  <path d="M 66 100 h 12" />
                  <path d="M 67 110 h 10" />
                  <path d="M 174 100 h -12" />
                  <path d="M 173 110 h -10" />
                </g>
              )}
              {/* the pale muzzle, which gives the mouth something to sit on */}
              <ellipse cx="111" cy="124" rx="13" ry="10" fill="#FFFDF7" opacity="0.5" />
              <ellipse cx="129" cy="124" rx="13" ry="10" fill="#FFFDF7" opacity="0.5" />
            </g>
            {/* redrawn over the patches, so they sit inside the outline */}
            <ellipse cx="120" cy="98" rx="55" ry="49" fill="none" {...OUTLINE} />

            {/* hachimaki — high on the head, clear of the eyes, knotted at the
                side with two ends trailing off it */}
            {chef && (
              <g>
                <path
                  d="M 70 70 Q 120 46 170 70 L 172 82 Q 120 58 68 82 Z"
                  fill={url('band')}
                  {...OUTLINE}
                  strokeWidth={2}
                />
                <path d="M 168 72 q 16 -4 22 -14 q 2 10 -8 18 Z" fill={NORI} {...OUTLINE} strokeWidth={2} />
                <path d="M 168 78 q 18 4 24 16 q -12 0 -20 -8 Z" fill={NORI} {...OUTLINE} strokeWidth={2} />
                <circle cx="168" cy="76" r="5" fill="#FF8A65" {...OUTLINE} strokeWidth={2} />
              </g>
            )}


            <Eye cx={100} />
            <Eye cx={140} />

            {/* blush — deepens when pleased or full */}
            <ellipse
              cx="91"
              cy="131"
              rx="10.5"
              ry="6.5"
              fill={BLUSH}
              opacity={rx === 'spicy' ? 1 : happy || eating || petting ? 0.78 : 0.42 + fullness * 0.25}
            />
            <ellipse
              cx="149"
              cy="131"
              rx="10.5"
              ry="6.5"
              fill={BLUSH}
              opacity={rx === 'spicy' ? 1 : happy || eating || petting ? 0.78 : 0.42 + fullness * 0.25}
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
          {(happy || petting) && !rx && <PleasedExtras />}
          {petting && (
            <g className="cat-heart" fill="#FF5A7A">
              <path d="M 176 46 c -4 -6 -14 -3 -14 5 c 0 7 9 12 14 17 c 5 -5 14 -10 14 -17 c 0 -8 -10 -11 -14 -5 Z" />
            </g>
          )}

          {/* ---- what comes out of him, one reaction at a time ---- */}

          {rx === 'hiccup' && (
            <g fill="#BFE3D0" opacity="0.9">
              <circle className="cat-puff" cx="152" cy="118" r="6" />
              <circle className="cat-puff cat-puff-2" cx="166" cy="110" r="4" />
            </g>
          )}

          {rx === 'burp' && (
            <g className="cat-burp-cloud" fill="#8FC46B" opacity="0.75">
              <ellipse cx="150" cy="128" rx="15" ry="11" />
              <ellipse cx="170" cy="120" rx="11" ry="8" />
              <ellipse cx="186" cy="113" rx="7" ry="5.5" />
            </g>
          )}

          {rx === 'spicy' && (
            <g>
              <g stroke="#FFD9CC" strokeLinecap="round" fill="none" strokeWidth="3.4" opacity="0.9">
                <path className="cat-whiff" d="M 74 42 q -10 -12 0 -22 q 10 -10 0 -20" />
                <path className="cat-whiff cat-whiff-2" d="M 166 42 q 10 -12 0 -22 q -10 -10 0 -20" />
              </g>
              <path
                className="cat-drop"
                d="M 178 78 q 7 10 0 15 q -7 -5 0 -15 Z"
                fill="#8FD3F4"
              />
            </g>
          )}

          {rx === 'sleepy' && (
            <text className="cat-zzz" x="180" y="60" fontSize="22" fontWeight="800" fill="#BFE3D0">
              z
            </text>
          )}

          {rx === 'hearts' && (
            <g fill="#FF5A7A">
              <path
                className="cat-heart"
                d="M 168 52 c -4 -6 -14 -3 -14 5 c 0 7 9 12 14 17 c 5 -5 14 -10 14 -17 c 0 -8 -10 -11 -14 -5 Z"
              />
              <path
                className="cat-heart cat-heart-2"
                d="M 62 58 c -3 -5 -11 -2 -11 4 c 0 6 7 10 11 14 c 4 -4 11 -8 11 -14 c 0 -6 -8 -9 -11 -4 Z"
              />
            </g>
          )}

          {rx === 'stars' && (
            <g fill="#F7C744">
              <path
                className="cat-sparkle"
                d="M 186 46 l 5 12 l 12 5 l -12 5 l -5 12 l -5 -12 l -12 -5 l 12 -5 Z"
              />
              <path
                className="cat-sparkle cat-sparkle-2"
                d="M 46 62 l 4 9 l 9 4 l -9 4 l -4 9 l -4 -9 l -9 -4 l 9 -4 Z"
              />
            </g>
          )}

          {rx === 'dizzy' && (
            <g className="cat-orbit" style={{ transformOrigin: '120px 40px' }} fill="#F7C744">
              <path d="M 156 40 l 4 9 l 9 4 l -9 4 l -4 9 l -4 -9 l -9 -4 l 9 -4 Z" />
              <path d="M 84 40 l 3 7 l 7 3 l -7 3 l -3 7 l -3 -7 l -7 -3 l 7 -3 Z" opacity="0.8" />
            </g>
          )}

          {rx === 'bubble' && (
            <g className="cat-bubble" style={{ transformOrigin: '120px 132px' }}>
              <circle cx="120" cy="150" r="22" fill="#BFE3D0" opacity="0.42" />
              <circle cx="120" cy="150" r="22" fill="none" stroke="#EAFBF2" strokeWidth="2" />
              <circle cx="111" cy="142" r="5" fill="#FFFFFF" opacity="0.85" />
            </g>
          )}

          {rx === 'gulp' && (
            <ellipse className="cat-lump" cx="120" cy="140" rx="13" ry="11" fill={FUR_SHADE} />
          )}

          {rx === 'fishbone' && (
            <g
              className="cat-float-up"
              stroke="#EAFBF2"
              strokeWidth="2.6"
              fill="none"
              strokeLinecap="round"
            >
              <path d="M 150 128 l 26 0" />
              <path d="M 156 122 l 0 12 M 163 120 l 0 16 M 170 122 l 0 12" />
              <path d="M 176 128 l 9 -7 l 0 14 Z" />
              <circle cx="150" cy="128" r="3" fill="#EAFBF2" />
            </g>
          )}

          {rx === 'lick' && (
            <g fill="#F7C744" opacity="0.8">
              <circle className="cat-puff" cx="150" cy="126" r="3" />
              <circle className="cat-puff cat-puff-2" cx="90" cy="130" r="2.6" />
            </g>
          )}

          {rx === 'dance' && (
            <g fill="#BFE3D0">
              <g className="cat-note">
                <ellipse cx="176" cy="66" rx="6" ry="4.5" transform="rotate(-20 176 66)" />
                <path d="M 181 64 L 181 44 L 192 40 L 192 46 L 184 49" />
              </g>
              <g className="cat-note cat-note-2">
                <ellipse cx="56" cy="78" rx="5" ry="4" transform="rotate(-20 56 78)" />
                <path d="M 60 76 L 60 60 L 69 57 L 69 62 L 62 64" />
              </g>
            </g>
          )}

          {rx === 'huge' && (
            <g className="cat-sparkle" fill="#F7C744">
              <path d="M 190 60 l 6 14 l 14 6 l -14 6 l -6 14 l -6 -14 l -14 -6 l 14 -6 Z" />
              <path d="M 44 70 l 5 11 l 11 5 l -11 5 l -5 11 l -5 -11 l -11 -5 l 11 -5 Z" />
            </g>
          )}

          {rx === 'sneeze' && (
            <g className="cat-spray" fill="#BFE3D0" opacity="0.85">
              <circle cx="150" cy="126" r="4" />
              <circle cx="166" cy="118" r="3" />
              <circle cx="164" cy="136" r="2.6" />
              <circle cx="180" cy="128" r="2.2" />
            </g>
          )}

          {rx === 'float' && (
            <g className="cat-sparkle" fill="#F7C744" opacity="0.9">
              <path d="M 70 176 l 4 9 l 9 4 l -9 4 l -4 9 l -4 -9 l -9 -4 l 9 -4 Z" />
              <path d="M 174 180 l 4 9 l 9 4 l -9 4 l -4 9 l -4 -9 l -9 -4 l 9 -4 Z" />
            </g>
          )}
        </g>
      </g>
    </svg>
  );
}

export const Cat = memo(CatArt);
