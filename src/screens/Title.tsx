import { useState, type ReactNode } from 'react';
import { PettableCat } from '../components/PettableCat';
import { Picture } from '../components/Picture';
import { Counter, Restaurant } from '../components/Restaurant';
import { GiftIcon } from '../components/Wear';
import { audio, catSound } from '../game/audio';
import { giftById, toggleWear, wornBy } from '../game/gifts';
import type { GameMode, Profile } from '../game/types';
import { rollShopOpen } from '../game/words';

interface Props {
  profile: Profile;
  onStart: (mode: GameMode) => void;
  onParent: () => void;
  onProfileChange: (updater: (p: Profile) => Profile) => void;
}

/* The title screen is a street with four doors, and each door shows what is
   behind it.

   It used to be three round buttons with small icons, which looked alike and
   said nothing a four-year-old could read. A door is a thing he already knows
   how to use, each one is a different colour, and the picture in its window
   moves a little — the belt runs, the cup steams — so the game behind it can be
   told before he goes in.

   The roll shop stays shut, with a padlock on it, until he knows enough
   letters to make three different words. A shut door that he can see is a
   reason to go and learn them. */

interface DoorDef {
  mode: GameMode;
  label: string;
  wall: string;
  trim: string;
  scene: ReactNode;
}

const INK = '#2B2420';

const DOORS: DoorDef[] = [
  {
    mode: 'counter',
    label: 'play',
    wall: '#F7C744',
    trim: '#E4574F',
    scene: (
      <g transform="translate(46 80) scale(1.7)">
        {/* one piece of salmon nigiri, the thing he feeds the cat */}
        <rect x="6" y="18" width="28" height="13" rx="6.5" fill="#fff8ec" stroke={INK} strokeWidth="2.2" />
        <path d="M 5 19 Q 8 10 20 10 Q 32 10 35 19 Q 20 16 5 19 Z" fill="#ff8a65" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
        <path d="M 12 14 l 3 3 M 19 12.5 l 3 3.5 M 26 13 l 3 3" stroke="#fff8ec" strokeWidth="1.6" strokeLinecap="round" />
        <rect x="17" y="15" width="6" height="16" rx="1.5" fill={INK} />
      </g>
    ),
  },
  {
    mode: 'train',
    label: 'play sushi train',
    wall: '#FF8A65',
    trim: '#3E8E7E',
    scene: (
      <g transform="translate(46 80) scale(1.7)">
        {/* a piece riding a belt that runs */}
        <rect x="10" y="9" width="20" height="10" rx="5" fill="#fff8ec" stroke={INK} strokeWidth="2" />
        <rect x="10" y="7" width="20" height="6" rx="3" fill="#f26b4f" stroke={INK} strokeWidth="2" />
        <rect x="2" y="22" width="36" height="8" rx="4" fill={INK} />
        <path d="M 6 26 H 34" stroke="#fff8ec" strokeWidth="2.6" strokeLinecap="round" strokeDasharray="2 6" className="belt-run" />
        <path d="M 12 36 L 28 36 M 24 33 L 28 36 L 24 39" stroke={INK} strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    ),
  },
  {
    mode: 'cafe',
    label: 'play kitty cafe',
    wall: '#F29BB0',
    trim: '#8E5BB8',
    scene: (
      <g transform="translate(46 80) scale(1.7)">
        {/* a cup with cat ears */}
        <path d="M 10 14 L 13 7 L 17 13 M 23 13 L 27 7 L 30 14" fill="#fff8ec" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
        <path d="M 8 14 H 32 V 24 A 12 10 0 0 1 8 24 Z" fill="#fff8ec" stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
        <path d="M 32 17 h 2 a 3.5 3.5 0 0 1 0 7 h -2.500" fill="none" stroke={INK} strokeWidth="2.4" />
        <circle cx="15.5" cy="21" r="1.6" fill={INK} />
        <circle cx="24.5" cy="21" r="1.6" fill={INK} />
        <path d="M 18 25 q 2 2 4 0" fill="none" stroke={INK} strokeWidth="1.6" strokeLinecap="round" />
      </g>
    ),
  },
  {
    mode: 'rolls',
    label: 'play roll words',
    wall: '#8FC46B',
    trim: '#F7C744',
    scene: (
      <g>
        {/* three slices of roll, a letter in each: a word */}
        {['c', 'a', 't'].map((ch, i) => (
          <g key={ch} transform={`translate(${52 + i * 28} 114)`}>
            <circle r="14" fill="#fff8ec" stroke={INK} strokeWidth="4" />
            <circle r="7.500" fill={['#ff8a65', '#F7C744', '#8FC46B'][i]} />
            <text y="5.500" textAnchor="middle" fontSize="15" fontWeight="800" fill={INK} fontFamily="ui-rounded, system-ui">
              {ch}
            </text>
          </g>
        ))}
      </g>
    ),
  },
];

function Door({
  def,
  index,
  locked,
  onOpen,
}: {
  def: DoorDef;
  index: number;
  locked: boolean;
  onOpen: () => void;
}) {
  const [shake, setShake] = useState(0);
  return (
    <button
      type="button"
      aria-label={def.label}
      data-locked={locked || undefined}
      onPointerDown={() => {
        if (!locked) return onOpen();
        /* a shut door rattles and the cat wonders about it; nothing is said */
        audio.unlock();
        audio.tap();
        void audio.oneShot(catSound('curious'), 0.8);
        setShake((n) => n + 1);
      }}
      className={`door ${locked ? 'door-locked' : ''}`}
      style={{ animationDelay: `${index * 90}ms` }}
    >
      <svg viewBox="0 0 160 200" className={`h-full w-full overflow-visible ${shake ? 'door-shake' : ''}`} key={shake}>
        <ellipse cx="80" cy="192" rx="70" ry="8" fill="rgba(0,0,0,0.25)" />
        <g className="door-front">
          {/* the door: an arch, the colour of its shop */}
          <path d="M 18 190 V 78 A 62 62 0 0 1 142 78 V 190 Z" fill={def.wall} stroke={INK} strokeWidth="5" strokeLinejoin="round" />
          <path d="M 30 190 V 82 A 50 50 0 0 1 130 82 V 190" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="4" />
          {/* its window, with the game in it */}
          <circle cx="80" cy="114" r="46" fill="#FFFBF2" stroke={INK} strokeWidth="5" />
          <g className="door-sign">{def.scene}</g>
          {/* the handle and the step */}
          <circle cx="130" cy="172" r="6" fill={def.trim} stroke={INK} strokeWidth="4" />
          <rect x="8" y="184" width="144" height="12" rx="6" fill={def.trim} stroke={INK} strokeWidth="4" />
          {/* a striped awning over the top */}
          <path d="M 14 30 H 146 L 156 58 Q 143 70 130 58 Q 117 70 105 58 Q 92 70 80 58 Q 67 70 55 58 Q 42 70 30 58 Q 17 70 4 58 Z" fill="#FFFBF2" stroke={INK} strokeWidth="5" strokeLinejoin="round" />
          <path d="M 40 30 L 30 58 Q 42 70 55 58 L 60 30 Z M 100 30 L 105 58 Q 117 70 130 58 L 120 30 Z" fill={def.trim} />
          <path d="M 80 30 L 80 58" stroke="none" />
          <path d="M 14 30 H 146 L 156 58 Q 143 70 130 58 Q 117 70 105 58 Q 92 70 80 58 Q 67 70 55 58 Q 42 70 30 58 Q 17 70 4 58 Z" fill="none" stroke={INK} strokeWidth="5" strokeLinejoin="round" />
        </g>
      </svg>
      {locked && (
        <span className="door-lock pointer-events-none absolute top-[40%] left-1/2 block w-[40%] -translate-x-1/2">
          <Picture name="lock" className="w-full" />
        </span>
      )}
    </button>
  );
}

const TITLE = 'Feed the Sushi Cat';
const TITLE_COLORS = ['#FF8FB1', '#FFC65C', '#7FE0C2', '#B79CFF', '#FF9D6E', '#7FCBFF'];

export function Title({ profile, onStart, onParent, onProfileChange }: Props) {
  const wear = wornBy(profile);
  const gifts = profile.gifts ?? [];
  const rollsOpen = rollShopOpen(profile);
  /** which toy is in the middle of its trick, and a count to restart it */
  const [toy, setToy] = useState<{ id: string; n: number } | null>(null);

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      <div className="relative min-h-0 flex-1">
        <Restaurant unlocked={profile.decorations} />

        <div className="relative z-10 flex h-full flex-col items-center justify-center gap-[clamp(2px,1vh,10px)] px-2">
          {/* He can stroke the cat here for as long as he likes. Nothing is
              asked of him on this screen, and nothing is counted. */}
          <PettableCat
            fullness={0.15}
            mood="idle"
            wear={wear}
            className="min-h-0 h-[clamp(96px,25vh,290px)] w-[clamp(120px,30vh,348px)] shrink"
          />

          <h1 className="text-center text-[clamp(22px,4.6vw,50px)] leading-tight font-extrabold tracking-tight drop-shadow-[0_3px_0_rgba(0,0,0,0.35)]">
            {TITLE.split('').map((ch, i) =>
              ch === ' ' ? (
                ' '
              ) : (
                <span
                  key={i}
                  className="title-letter"
                  style={{ color: TITLE_COLORS[i % TITLE_COLORS.length], animationDelay: `${i * 90}ms` }}
                >
                  {ch}
                </span>
              ),
            )}
          </h1>

          {profile.dayStreak > 1 && (
            <div className="text-lg leading-none">{'🍣'.repeat(Math.min(profile.dayStreak, 7))}</div>
          )}

          <div className="mt-1 flex items-end justify-center gap-[clamp(6px,1.6vw,20px)]">
            {DOORS.map((d, i) => (
              <Door
                key={d.mode}
                def={d}
                index={i}
                locked={d.mode === 'rolls' && !rollsOpen}
                onOpen={() => onStart(d.mode)}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="relative h-[clamp(78px,13vh,132px)] shrink-0">
        <Counter />
        {/* His presents, on the counter. One he can wear goes on the cat when he
            presses it and comes off when he presses it again; a toy does its
            trick. */}
        {gifts.length > 0 && (
          <div
            className="absolute right-24 bottom-[30%] left-3 z-10 flex items-center gap-[clamp(6px,1.4vw,12px)] overflow-x-auto py-1.5 pl-1"
            style={{ touchAction: 'pan-x' }}
          >
            {gifts.map((id) => {
              const gift = giftById(id);
              if (!gift) return null;
              const isToy = gift.slot === 'toy';
              const playing = toy?.id === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-label={isToy ? `toy ${id}` : `wear ${id}`}
                  aria-pressed={isToy ? undefined : wear.includes(id)}
                  onPointerDown={() => {
                    audio.unlock();
                    if (isToy) {
                      setToy((t) => ({ id, n: (t?.n ?? 0) + 1 }));
                      if (id === 'yarn') audio.boing();
                      else audio.bubble();
                      return;
                    }
                    audio.tap();
                    audio.twinkle();
                    onProfileChange((p) => toggleWear(p, id));
                  }}
                  className={`shelf-item shrink-0 ${wear.includes(id) ? 'shelf-on' : ''}`}
                >
                  <span
                    key={playing ? toy!.n : 0}
                    className={`block h-full w-full ${playing ? (id === 'yarn' ? 'toy-roll' : 'toy-jump') : ''}`}
                  >
                    <GiftIcon id={id} className="h-full w-full overflow-visible" />
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <button
        type="button"
        onPointerDown={onParent}
        className="absolute right-3 bottom-3 z-20 rounded-full bg-black/20 px-4 py-2 text-sm font-bold text-white/80"
      >
        parents
      </button>
    </div>
  );
}
