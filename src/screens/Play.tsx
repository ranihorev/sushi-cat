import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Cat, type Mood } from '../components/Cat';
import { Plate } from '../components/Plate';
import { Counter, Restaurant } from '../components/Restaurant';
import { Sushi, type PieceState } from '../components/Sushi';
import {
  audio,
  catSound,
  fallbackIdentify,
  fallbackPrompt,
  identifyClips,
  promptClips,
  randomPraise,
} from '../game/audio';
import { demote, nextRound, optionCountFor, promote } from '../game/engine';
import type { Letter } from '../game/letters';
import { LETTERS } from '../game/letters';
import { recordAnswer, recordConfusion } from '../game/store';
import type { Level, Profile, Round } from '../game/types';

interface Props {
  profile: Profile;
  onProfileChange: (updater: (p: Profile) => Profile) => void;
  onMealComplete: (eaten: Letter[]) => void;
  onExit: () => void;
}

const IDLE_NUDGE_MS = 7000;

/* Pacing.
   A right answer is not read back to him. He heard the letter in the question,
   he found it, and the cat ate it — saying "/mmm/ ... M!" on top of that told
   him nothing he did not already know and put two more letter sounds between
   him and the next question. The cat's delighted meow is the whole reply, and
   silence is what marks the boundary after it. */
const PROMPT_LEAD_MS = 450; // between the new pieces appearing and the prompt
const ROUND_GAP_MS = 600; // after the cat's reply, before the next round starts
const RETRY_GAP_MS = 450; // after the refusal, before the question comes back
const SNIFF_MS = 620; // the wrong piece travels to his nose and he smells it
const YUCK_MS = 700; // the recoil, and the piece tumbling back to the counter

/** Where a piece is held while he smells it, as a fraction of the cat's box.
    Low enough that it sits under the muzzle instead of across the face — the
    eyes and the nose are doing the acting, and they have to stay visible. */
const MUZZLE = { x: 0.5, y: 0.82 };
const GREETING_GAP_MS = 700; // after the cat's hello, before the very first prompt

/* The cat says hello before the first question rather than underneath it. This
   rides in the same chain as the prompt, so the prompt waits for the meow
   instead of cutting it off — which is what happened when the greeting was
   fired separately as the screen opened. */
const GREETING: Array<string | number> = ['cat/greet', GREETING_GAP_MS];

export function Play({ profile, onProfileChange, onMealComplete, onExit }: Props) {
  const total = profile.settings.roundsPerMeal;

  const [level, setLevel] = useState<Level>(profile.level);
  const [round, setRound] = useState<Round>(() => nextRound(profile, profile.level, []));
  const [eaten, setEaten] = useState<Letter[]>([]);
  const [streak, setStreak] = useState(0);
  const [misses, setMisses] = useState(0);
  const [pieceState, setPieceState] = useState<Partial<Record<Letter, PieceState>>>({});
  const [mood, setMood] = useState<Mood>('idle');
  const [locked, setLocked] = useState(true);
  const [gated, setGated] = useState(profile.settings.gateChoices);
  const [look, setLook] = useState(0);
  const [cheer, setCheer] = useState<string | null>(null);
  /** bumped whenever he asks to hear the prompt again, to restart the idle clock */
  const [heard, setHeard] = useState(0);

  const catRef = useRef<HTMLDivElement>(null);
  const pieceRefs = useRef(new Map<Letter, HTMLDivElement>());
  const idleTimer = useRef<number | undefined>(undefined);
  const timers = useRef<number[]>([]);
  const recentTargets = useRef<Letter[]>([]);

  // the freshest profile, for generating the next round after stats have landed
  const profileRef = useRef(profile);
  profileRef.current = profile;

  const alive = useRef(true);

  /* Feeding is a drag, not a tap. Carrying the piece to the cat is a more
     deliberate act than tapping — it makes him commit to a choice rather than
     batting at whatever is nearest. */
  const grabRef = useRef<{ letter: Letter; x: number; y: number; id: number; moved: boolean } | null>(
    null,
  );
  const [drag, setDrag] = useState<{ letter: Letter; dx: number; dy: number; over: boolean } | null>(
    null,
  );
  const onMoveRef = useRef<(e: PointerEvent) => void>(() => {});
  const onUpRef = useRef<(e: PointerEvent) => void>(() => {});

  const after = useCallback((ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  /* Set on the way in as well as cleared on the way out: StrictMode mounts,
     unmounts and mounts again, and a flag that is only ever cleared would leave
     the live screen believing it had been thrown away — every round would go
     silent after the first bite. */
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      timers.current.forEach(clearTimeout);
      clearTimeout(idleTimer.current);
      audio.stopVoice();
    };
  }, []);

  // listeners live on the window so the drag survives the finger leaving the
  // piece; the refs keep them pointed at the current render's closure
  useEffect(() => {
    const move = (e: PointerEvent) => onMoveRef.current(e);
    const up = (e: PointerEvent) => onUpRef.current(e);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, []);

  const speakPrompt = useCallback((r: Round) => {
    void audio.speak(promptClips(r), fallbackPrompt(r));
  }, []);

  /* He asked to hear it again, so give him another quiet stretch to think in.
     Without this the idle nudge keeps its original deadline and the game can
     repeat the question a moment after he pressed the button — the same
     talking-over-itself that makes the whole thing hard to follow. */
  const replayPrompt = useCallback(
    (r: Round) => {
      speakPrompt(r);
      setHeard((n) => n + 1);
    },
    [speakPrompt],
  );

  /* -------- start of a round: play the prompt, then open up the choices -------- */
  const beginRound = useCallback(
    (r: Round, intro: Array<string | number> = []) => {
      setRound(r);
      setPieceState({});
      setMisses(0);
      setMood('idle');
      setLocked(true);
      setGated(profile.settings.gateChoices);
      recentTargets.current = [...recentTargets.current, r.target].slice(-4);

      after(PROMPT_LEAD_MS, () => {
        void audio.speak([...intro, ...promptClips(r)], fallbackPrompt(r)).then(() => {
          setGated(false);
        });
        // never leave him unable to tap, even if audio fails to load
        const stuck = 2600 + (intro.length ? 2000 : 0);
        after(profile.settings.gateChoices ? stuck : 0, () => setGated(false));
        setLocked(false);
      });
    },
    [after, profile.settings.gateChoices],
  );

  // first round — the cat greets him, then asks
  useEffect(() => {
    beginRound(round, GREETING);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // idle nudge — replay the prompt if he stalls
  useEffect(() => {
    if (locked) return;
    clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => speakPrompt(round), IDLE_NUDGE_MS);
    return () => clearTimeout(idleTimer.current);
  }, [round, locked, misses, heard, speakPrompt]);

  /**
   * Where the sushi has to be let go for the cat to eat it. Deliberately much
   * bigger than the cat itself — a four-year-old's aim is approximate, and
   * being fussy about the drop point punishes motor control rather than
   * testing whether he knows the letter.
   */
  const overCat = (x: number, y: number) => {
    const c = catRef.current?.getBoundingClientRect();
    if (!c) return false;
    return x > c.left - 110 && x < c.right + 110 && y > c.top - 160 && y < c.bottom + 40;
  };

  const handlePick = (letter: Letter, drop: { dx: number; dy: number }) => {
    if (locked || gated) return;
    audio.unlock();
    clearTimeout(idleTimer.current);
    setLook(round.options.indexOf(letter) < round.options.length / 2 ? -1 : 1);

    // the piece is eaten where he let go of it, not from its slot on the counter
    const el = pieceRefs.current.get(letter);
    el?.style.setProperty('--drop-x', `${drop.dx}px`);
    el?.style.setProperty('--drop-y', `${drop.dy}px`);

    if (letter === round.target) {
      setLocked(true);
      audio.tap();
      audio.whoosh();
      setPieceState({ [letter]: 'swallow' });
      setMood('anticipate');

      after(380, () => {
        setMood('eating');
        audio.chomp();
      });

      const first = misses === 0;
      const nextEaten = [...eaten, letter];
      const nextStreak = first ? streak + 1 : 0;
      let nextLevel = level;
      if (first && nextStreak > 0 && nextStreak % 3 === 0 && level < 3) nextLevel = promote(level);

      after(760, async () => {
        /* One ordered chain, not a pile of timers. Chewing, then the cat's
           reaction, then maybe a word of praise — each waits for the last to
           finish, and the next round only begins when the whole thing is done.
           Firing these independently meant the meow talked over the praise and
           the praise talked over the next prompt. */
        await audio.speak(['cat/nom']);
        if (!alive.current) return;

        setMood('happy');
        audio.happy();
        setEaten(nextEaten);
        onProfileChange((p) => recordAnswer(p, round.target, first));
        setStreak(nextStreak);
        if (nextLevel !== level) {
          setLevel(nextLevel);
          onProfileChange((p) => ({ ...p, level: nextLevel }));
        }
        if (nextStreak >= 3) {
          setCheer(nextStreak >= 6 ? '🎉' : '⭐️');
          audio.sparkle();
          after(1400, () => setCheer(null));
        }

        /* No reading the letter back to him — just the cat being pleased, and
           now and then a word for it. */
        const praise = Math.random() < 0.35;
        await audio.speak([
          catSound(nextStreak >= 3 ? 'excited' : 'happy'),
          ...(praise ? [320, randomPraise()] : []),
        ]);
        if (!alive.current) return;

        if (nextEaten.length >= total) {
          setMood('asleep');
          audio.fanfare();
          await audio.speak(['cat/yawn']);
          if (alive.current) onMealComplete(nextEaten);
          return;
        }

        /* A real pause before the next question. The cat stays looking pleased
           through it, so the quiet reads as "that was right" rather than as the
           game having stalled. */
        after(ROUND_GAP_MS, () =>
          beginRound(nextRound(profileRef.current, nextLevel, recentTargets.current)),
        );
      });

      return;
    }

    /* A wrong piece is not eaten where it was let go — it is carried the rest of
       the way up to the muzzle, because a cat cannot be seen to smell something
       he is holding against his chest. The drop zone is deliberately loose, so
       without this the piece can end up anywhere from over his eyes to off his
       shoulder. */
    if (el) {
      const c = catRef.current?.getBoundingClientRect();
      /* The slot on the counter, not where the finger is: the ref is on the
         wrapper, and a transform on the sushi inside it does not move its
         parent's box. */
      const slot = el.getBoundingClientRect();
      if (c) {
        el.style.setProperty(
          '--drop-x',
          `${c.left + c.width * MUZZLE.x - (slot.left + slot.width / 2)}px`,
        );
        el.style.setProperty(
          '--drop-y',
          `${c.top + c.height * MUZZLE.y - (slot.top + slot.height / 2)}px`,
        );
      }
    }

    /* Wrong piece — no penalty, and no red mark. The cat takes it anyway, holds
       it under his nose, says out loud what he was actually given, and only then
       turns it down. Three things come out of doing it that way:

       the piece goes to the cat whether it is right or wrong, so carrying it
       over is never the thing that was mistaken;

       he hears "B ... /b/" a beat before the question comes back as "M ... /mmm/",
       which puts the two sounds side by side instead of letting the wrong one
       disappear in silence — this is the part that teaches;

       and the refusal is a cat refusing food, not a machine marking an answer. */
    const m = misses + 1;
    setMisses(m);
    setStreak(0);
    setLocked(true);
    audio.tap();
    audio.whoosh();
    setPieceState({ [letter]: 'sniff' });
    setMood('sniff');
    onProfileChange((p) => recordConfusion(p, round.target, letter));

    if (m >= 2 && level > 1) {
      const down = demote(level);
      setLevel(down);
      onProfileChange((p) => ({ ...p, level: down }));
    }

    after(260, () => audio.sniff());

    after(SNIFF_MS, async () => {
      /* One chain again: the enquiring mrrp, then the naming, then the refusal.
         Fired separately these three talk over each other, and what is left is
         noise at the exact moment he is trying to work out what he got wrong. */
      await audio.speak(
        [catSound('curious'), 260, ...identifyClips(round, letter)],
        fallbackIdentify(round, letter),
      );
      if (!alive.current) return;

      setMood('yuck');
      audio.yuck();
      setPieceState({ [letter]: 'spit' });

      after(YUCK_MS, () => {
        setMood('idle');
        setLocked(false);
        setPieceState(m >= 2 ? { [round.target]: 'hint' } : {});
        /* On the second miss the right piece starts glowing, so the glow does the
           pointing. Saying "this one" on top of it just added a phrase he has to
           decode; replaying the sound is the thing that actually teaches. The beat
           first gives the glow a moment to land before the sound arrives. */
        void audio.speak([RETRY_GAP_MS, ...promptClips(round)], fallbackPrompt(round));
      });
    });
  };

  const grab = (letter: Letter, e: React.PointerEvent) => {
    if (locked || gated) return;
    audio.unlock();
    audio.tap();
    clearTimeout(idleTimer.current);
    grabRef.current = { letter, x: e.clientX, y: e.clientY, id: e.pointerId, moved: false };
    setDrag({ letter, dx: 0, dy: 0, over: false });
  };

  onMoveRef.current = (e: PointerEvent) => {
    const g = grabRef.current;
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (Math.hypot(dx, dy) > 8) g.moved = true;
    const over = overCat(e.clientX, e.clientY);
    setDrag({ letter: g.letter, dx, dy, over });
    // the cat opens up as the food comes near, which is the cue that he can let go
    if (!locked) setMood(over ? 'anticipate' : 'idle');
  };

  onUpRef.current = (e: PointerEvent) => {
    const g = grabRef.current;
    if (!g || e.pointerId !== g.id) return;
    grabRef.current = null;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    const over = overCat(e.clientX, e.clientY);
    setDrag(null);

    if (over && g.moved) {
      handlePick(g.letter, { dx, dy });
      return;
    }
    if (!locked) setMood('idle');
    if (!g.moved) {
      /* He tapped instead of dragging. Rather than nothing happening, the piece
         hops to show it wants to be carried, and the sound plays again. */
      setPieceState({ [g.letter]: 'hop' });
      after(700, () => setPieceState((prev) => (prev[g.letter] === 'hop' ? {} : prev)));
      replayPrompt(round);
    }
  };

  const fullness = eaten.length / total;
  const optionCount = optionCountFor(level);
  const wordHint = round.kind === 'word' ? LETTERS[round.target].word : null;

  /* A piece that has left the counter has to stay in front of the cat, or the
     whole refusal happens behind his head where none of it can be seen. */
  const atTheCat = Object.values(pieceState).some((s) => s === 'sniff' || s === 'spit');

  const pieces = useMemo(
    () =>
      round.options.map((l, i) => (
        <div
          key={`${round.target}-${l}`}
          className="pointer-events-auto"
          ref={(el) => {
            if (el) pieceRefs.current.set(l, el);
            else pieceRefs.current.delete(l);
          }}
          style={{
            opacity: gated ? 0 : 1,
            transform: gated ? 'translateY(18px) scale(0.9)' : 'none',
            transition: 'opacity 260ms ease, transform 260ms ease',
          }}
        >
          <Sushi
            letter={l}
            index={i}
            state={pieceState[l] ?? 'rest'}
            disabled={locked || gated}
            drag={drag?.letter === l ? { dx: drag.dx, dy: drag.dy } : null}
            over={drag?.letter === l ? drag.over : false}
            onGrab={(e) => grab(l, e)}
          />
        </div>
      )),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [round, pieceState, locked, gated, drag],
  );

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      {/* parent escape hatch — long-press the corner, invisible to him */}
      <button
        type="button"
        aria-label="exit"
        onPointerDown={(e) => {
          const t = window.setTimeout(onExit, 900);
          const cancel = () => {
            clearTimeout(t);
            e.currentTarget?.removeEventListener('pointerup', cancel);
          };
          e.currentTarget.addEventListener('pointerup', cancel, { once: true });
          e.currentTarget.addEventListener('pointerleave', cancel, { once: true });
        }}
        className="absolute top-0 left-0 z-30 h-16 w-16 opacity-0"
      />

      {/* the restaurant, with the cat waiting behind the counter */}
      <div className="relative min-h-0 flex-1">
        <Restaurant unlocked={profile.decorations} dim />

        {/* Sits above the counter so the sushi can never cover the replay button.
            The column itself is click-through — it spans the whole room, and the
            sushi poke up into it — so only the controls take presses. */}
        <div className="pointer-events-none relative z-20 flex h-full flex-col items-center justify-end gap-1 pb-[clamp(76px,12vh,124px)]">
          {cheer && (
            <div className="float-up pointer-events-none absolute top-[16%] text-6xl">{cheer}</div>
          )}

          <div
            ref={catRef}
            className="h-[clamp(170px,34vh,360px)] w-[clamp(210px,40vh,420px)] shrink"
          >
            <Cat fullness={fullness} mood={mood} look={look} />
          </div>

          <Plate eaten={eaten} total={total} />

          <div className="mt-1 flex items-center gap-3">
            {wordHint && (
              <span className="rounded-full bg-black/35 px-4 py-1.5 text-lg font-bold text-white/75">
                {wordHint}
              </span>
            )}
            <button
              type="button"
              aria-label="say it again"
              onPointerDown={() => {
                audio.unlock();
                replayPrompt(round);
              }}
              className="pointer-events-auto relative grid h-[clamp(54px,8vh,72px)] w-[clamp(54px,8vh,72px)] place-items-center rounded-full bg-white/12 active:scale-95"
            >
              <span className="pulse-ring absolute inset-0 rounded-full border-4 border-tamago/40" />
              <svg viewBox="0 0 24 24" className="h-1/2 w-1/2 fill-rice">
                <path d="M4 9v6h4l5 4V5L8 9H4z" />
                <path
                  d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  className="stroke-rice"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* The counter — sushi rest on it, poking up well above it. While a piece
          is being carried this layer jumps above the room so the piece travels
          over the cat rather than behind it. */}
      <div
        className="relative h-[clamp(78px,13vh,132px)] shrink-0"
        style={{ zIndex: drag || atTheCat ? 40 : 10 }}
      >
        <Counter />
        {/* click-through: the row is far taller than the sushi drawn in it, and
            an invisible box must not swallow presses meant for the room above */}
        <div className="pointer-events-none absolute inset-x-0 bottom-[34%] flex items-end justify-center gap-[clamp(8px,2.5vw,32px)] px-3">
          {pieces}
        </div>
      </div>

      {/* level breadcrumb for the parent only — three faint dots */}
      <div className="pointer-events-none absolute right-3 bottom-2 z-20 flex gap-1 opacity-25">
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className={`h-1.5 w-1.5 rounded-full ${n <= level ? 'bg-rice' : 'bg-rice/30'}`}
          />
        ))}
        <span className="sr-only">{optionCount} choices</span>
      </div>
    </div>
  );
}
