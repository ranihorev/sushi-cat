import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CAT_CLIPS } from '../game/audio';
import type { Letter } from '../game/letters';
import { blankProfile } from '../game/store';
import type { Profile } from '../game/types';
import { CLIP_MS, clipDurations, cutLog, playLog } from '../test/audio-stub';
import { Play } from './Play';

/* jsdom has no layout, so every element's rect is 0x0 at the origin. `overCat`
   accepts a generous box around the cat's rect, which puts the origin inside it
   and anywhere far away outside it — enough to drive both branches. The real
   geometry is checked against a browser in e2e/play.spec.ts. */
const ON_CAT = { x: 0, y: 0 };
const AWAY = { x: 900, y: 900 };

let mealResult: Letter[] | null = null;
let exited = false;
let profileSeen: Profile;

function Harness({ initial }: { initial: Profile }) {
  const [profile, setProfile] = useState(initial);
  profileSeen = profile;
  return (
    <Play
      profile={profile}
      onProfileChange={(fn) => setProfile((p) => fn(p))}
      onMealComplete={(eaten) => {
        mealResult = eaten;
      }}
      onExit={() => {
        exited = true;
      }}
    />
  );
}

const start = async (overrides: Partial<Profile> = {}) => {
  const initial = { ...blankProfile(), ...overrides };
  profileSeen = initial;
  render(<Harness initial={initial} />);
  await tick(2200); // the cat's hello, then a beat, then the prompt
};

const tick = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

/** the round is over and the next prompt has landed */
const settleRound = () => tick(6000);

/**
 * Advance the clock in slices, recording when each voice clip started.
 *
 * Pacing tests used to name absolute times — "there must be nothing at 1800ms"
 * — which meant that shortening any wait anywhere failed a test about a
 * completely different wait. What the pacing rules actually say is that the gap
 * between one thing and the next must be big enough, so that is what this
 * measures. Synthesized effects are skipped: they carry no words, they cannot
 * be talked over, and they all arrive in the log under the same name.
 */
const voiceTimeline = async (ms: number, step = 20) => {
  const marks: { at: number; clip: string }[] = [];
  let seen = 0;
  for (let at = step; at <= ms; at += step) {
    await tick(step);
    while (seen < playLog.length) {
      const clip = playLog[seen++];
      if (clip.includes('/')) marks.push({ at, clip });
    }
  }
  return marks;
};

/** The prompt names the letter it wants, so the log says what the answer is. */
const targetOnScreen = (): Letter => {
  const spoken = [...playLog].reverse().find((c) => /^(prompt|name|letter)\//.test(c));
  if (!spoken) throw new Error(`no prompt played yet — log: ${playLog.join(', ')}`);
  return spoken.split('/')[1] as Letter;
};

const optionsOnScreen = (): Letter[] =>
  screen
    .getAllByLabelText(/^letter /)
    .map((el) => el.getAttribute('aria-label')!.replace('letter ', '') as Letter);

const distractorOnScreen = (): Letter => {
  const target = targetOnScreen();
  const other = optionsOnScreen().find((l) => l !== target);
  if (!other) throw new Error('round has only one piece');
  return other;
};

const piece = (letter: Letter) => screen.getByLabelText(`letter ${letter}`);

/** carry a piece and let go of it somewhere */
const dragTo = (letter: Letter, to: { x: number; y: number }) => {
  fireEvent.pointerDown(piece(letter), { pointerId: 1, clientX: 0, clientY: -140 });
  fireEvent.pointerMove(window, { pointerId: 1, clientX: to.x, clientY: to.y - 40 });
  fireEvent.pointerMove(window, { pointerId: 1, clientX: to.x, clientY: to.y });
  fireEvent.pointerUp(window, { pointerId: 1, clientX: to.x, clientY: to.y });
};

/** press it without moving — what a child used to tapping does */
const tapPiece = (letter: Letter) => {
  fireEvent.pointerDown(piece(letter), { pointerId: 1, clientX: 10, clientY: 10 });
  fireEvent.pointerUp(window, { pointerId: 1, clientX: 10, clientY: 10 });
};

const feedCorrect = async () => {
  const target = targetOnScreen();
  dragTo(target, ON_CAT);
  await settleRound();
  return target;
};

beforeEach(() => {
  vi.useFakeTimers();
  mealResult = null;
  exited = false;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('the prompt', () => {
  it('names the letter and then says its sound', async () => {
    await start();
    const target = targetOnScreen();
    expect(playLog).toEqual(['cat/greet', `letter/${target}`, `prompt/${target}`]);
  });

  /* The greeting used to be fired off as the screen opened while the prompt ran
     on its own timer, so the prompt's stopVoice() chopped the meow in half and
     the two arrived on top of each other. It rides in the prompt's own chain
     now, which is what keeps them in order. */
  it('lets the cat finish saying hello before it asks anything', async () => {
    clipDurations.set('cat/greet', 900); // the real meow is nearly a second long
    await start();
    expect(playLog[0]).toBe('cat/greet');
    expect(cutLog).not.toContain('cat/greet');
  });

  it('puts the answer on the counter', async () => {
    await start();
    expect(optionsOnScreen()).toContain(targetOnScreen());
  });

  it('starts with two pieces, which is all a beginner should face', async () => {
    await start();
    expect(optionsOnScreen()).toHaveLength(2);
  });

  it('offers four pieces once he has been promoted', async () => {
    await start({ level: 3 });
    expect(optionsOnScreen()).toHaveLength(4);
  });

  it('says it again when he stalls', async () => {
    await start();
    const target = targetOnScreen();
    playLog.length = 0;
    await tick(9000);
    expect(playLog).toEqual([`letter/${target}`, `prompt/${target}`]);
  });
});

describe('the say-it-again button', () => {
  /* This button spent a while sitting under an invisible container that ate the
     press. The geometry is guarded in the e2e suite; this guards the wiring. */
  it('replays the prompt', async () => {
    await start();
    const target = targetOnScreen();
    playLog.length = 0;

    fireEvent.pointerDown(screen.getByLabelText('say it again'));
    await tick(1000);

    expect(playLog).toEqual([`letter/${target}`, `prompt/${target}`]);
  });

  it('can be pressed over and over without getting stuck', async () => {
    await start();
    const target = targetOnScreen();
    const button = screen.getByLabelText('say it again');
    playLog.length = 0;

    for (let i = 0; i < 4; i++) {
      fireEvent.pointerDown(button);
      await tick(30);
    }
    await tick(1000);

    // whatever got cut off along the way, the last press must be heard in full
    expect(playLog.slice(-2)).toEqual([`letter/${target}`, `prompt/${target}`]);
  });

  /* The nudge used to keep the deadline it was given when the round opened, so
     pressing the button at six seconds got the question repeated at seven —
     the game talking over itself a moment after he asked it to speak. */
  it('buys him another quiet stretch to think in', async () => {
    await start();
    await tick(6000);
    playLog.length = 0;

    fireEvent.pointerDown(screen.getByLabelText('say it again'));
    await tick(1000);
    const heard = playLog.length;

    await tick(3000); // past the original nudge, but not past the new one
    expect(playLog).toHaveLength(heard);
  });

  it('is not an answer', async () => {
    await start();
    fireEvent.pointerDown(screen.getByLabelText('say it again'));
    await settleRound();
    expect(profileSeen.letterStats).toEqual({});
  });
});

describe('feeding the cat', () => {
  it('eats the right piece and moves on', async () => {
    await start();
    const target = targetOnScreen();
    playLog.length = 0;

    dragTo(target, ON_CAT);
    await settleRound();

    expect(playLog).toContain('cat/nom');
    expect(playLog.some((c) => CAT_CLIPS.includes(c))).toBe(true);
    expect(profileSeen.letterStats[target]).toMatchObject({ seen: 1, correct: 1 });
  });

  /* He heard the letter in the question and he found it. Reading it back to him
     afterwards taught him nothing and put two more letter sounds between him and
     the next question, which is what made the game drag. */
  it('does not read the letter back to him', async () => {
    await start();
    const target = targetOnScreen();
    playLog.length = 0;

    dragTo(target, ON_CAT);
    await tick(1600); // the cat has chewed and answered, the next round has not begun

    expect(playLog).not.toContain(`confirm/${target}`);
    expect(playLog).not.toContain(`letter/${target}`);
    expect(playLog).not.toContain(`prompt/${target}`);
  });

  it('asks a new question afterwards', async () => {
    await start();
    const first = await feedCorrect();
    expect(targetOnScreen()).not.toBe(first);
    expect(optionsOnScreen()).toContain(targetOnScreen());
  });

  /* Silence is the only thing marking where one question ended and the next
     began. Without it the cat's reply and the new prompt run together into one
     stream that is hard to follow. */
  it('leaves a silence between the cat and the next question', async () => {
    // 0.5 is above the praise threshold, so the reply is the meow alone and its
    // length is fixed — otherwise the quiet stretch moves from run to run
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    await start();
    const target = targetOnScreen();
    playLog.length = 0;

    dragTo(target, ON_CAT);
    const marks = await voiceTimeline(6000);

    const reply = marks.filter((m) => CAT_CLIPS.includes(m.clip)).pop();
    expect(reply, `the cat never answered — heard ${marks.map((m) => m.clip)}`).toBeTruthy();

    const question = marks.find((m) => m.at > reply!.at && !m.clip.startsWith('cat/'));
    expect(question, 'the next question never came').toBeTruthy();

    // the meow itself, and then a real stretch of quiet before the next question
    const quiet = question!.at - (reply!.at + CLIP_MS);
    expect(quiet, `only ${quiet}ms of silence between the two`).toBeGreaterThanOrEqual(900);

    expect(targetOnScreen()).not.toBe(target);
  });

  it('fills the plate one piece at a time', async () => {
    await start({ settings: { gateChoices: false, roundsPerMeal: 3 } });
    await feedCorrect();
    expect(screen.getByLabelText(/1 of 3/)).toBeTruthy();
    await feedCorrect();
    expect(screen.getByLabelText(/2 of 3/)).toBeTruthy();
  });

  it('ends the meal after the last piece', async () => {
    await start({ settings: { gateChoices: false, roundsPerMeal: 3 } });
    const eaten: Letter[] = [];
    for (let i = 0; i < 3; i++) eaten.push(await feedCorrect());
    await tick(2000);
    expect(mealResult).toEqual(eaten);
  });
});

describe('a wrong piece', () => {
  it('is never punished — the cat turns it down and asks again', async () => {
    await start();
    const target = targetOnScreen();
    const wrong = distractorOnScreen();
    playLog.length = 0;

    dragTo(wrong, ON_CAT);
    await settleRound();

    expect(playLog.some((c) => CAT_CLIPS.includes(c))).toBe(true);
    expect(playLog).not.toContain('cat/nom'); // he never swallowed it
    expect(playLog.slice(-2)).toEqual([`letter/${target}`, `prompt/${target}`]);
  });

  /* The whole point of the refusal. A wrong piece that disappears in silence
     teaches nothing; hearing "B ... /b/" a beat before the question comes back
     as "M ... /mmm/" puts the two sounds next to each other. */
  it('says out loud what he was actually given', async () => {
    await start();
    const target = targetOnScreen();
    const wrong = distractorOnScreen();
    playLog.length = 0;

    dragTo(wrong, ON_CAT);
    await settleRound();

    expect(playLog).toContain(`letter/${wrong}`);
    expect(playLog).toContain(`prompt/${wrong}`);
    // named first, then the question again — never the other way round
    expect(playLog.indexOf(`prompt/${wrong}`)).toBeLessThan(playLog.indexOf(`prompt/${target}`));
  });

  it('takes the piece to his nose before he turns it down', async () => {
    await start();
    const wrong = distractorOnScreen();

    dragTo(wrong, ON_CAT);
    await tick(300);
    expect(piece(wrong).className).toContain('sushi-sniff');
  });

  it('gives the piece back to the counter afterwards', async () => {
    await start();
    const wrong = distractorOnScreen();

    dragTo(wrong, ON_CAT);
    await settleRound();

    expect(piece(wrong).className).not.toContain('sushi-sniff');
    expect(piece(wrong).className).not.toContain('sushi-spit');
  });

  /* He has the piece in his mouth. Letting a second one be dropped on top of it
     runs two refusals at once, and both of them are then unintelligible. */
  it('cannot be fed again while he still has the last piece', async () => {
    await start({ level: 3 });
    const target = targetOnScreen();
    const wrong = optionsOnScreen().filter((l) => l !== target);

    dragTo(wrong[0], ON_CAT);
    await tick(300);
    playLog.length = 0;

    dragTo(wrong[1], ON_CAT);
    await tick(300);
    expect(playLog).not.toContain(`letter/${wrong[1]}`);
    expect(profileSeen.confusions[target]).toEqual({ [wrong[0]]: 1 });
  });

  it('lets him answer again once the piece is back on the counter', async () => {
    await start();
    const target = targetOnScreen();

    dragTo(distractorOnScreen(), ON_CAT);
    await settleRound();
    dragTo(target, ON_CAT);
    await settleRound();

    expect(profileSeen.letterStats[target]).toMatchObject({ seen: 1 });
  });

  it('keeps the same question up, with the same pieces', async () => {
    await start();
    const target = targetOnScreen();
    const before = optionsOnScreen();

    dragTo(distractorOnScreen(), ON_CAT);
    await settleRound();

    expect(targetOnScreen()).toBe(target);
    expect(optionsOnScreen()).toEqual(before);
  });

  it('remembers which letter he reached for', async () => {
    await start();
    const target = targetOnScreen();
    const wrong = distractorOnScreen();

    dragTo(wrong, ON_CAT);
    await settleRound();

    expect(profileSeen.confusions[target]).toEqual({ [wrong]: 1 });
  });

  it('counts against the letter only once he finally gets it', async () => {
    await start();
    const target = targetOnScreen();

    dragTo(distractorOnScreen(), ON_CAT);
    await settleRound();
    expect(profileSeen.letterStats[target]).toBeUndefined();

    dragTo(target, ON_CAT);
    await settleRound();
    // right in the end, but not first time — that is not mastery
    expect(profileSeen.letterStats[target]).toMatchObject({ seen: 1, correct: 0 });
  });

  it('lights up the right piece after a second miss', async () => {
    await start({ level: 3 });
    const target = targetOnScreen();
    const wrong = optionsOnScreen().filter((l) => l !== target);

    dragTo(wrong[0], ON_CAT);
    await settleRound();
    expect(piece(target).className).not.toContain('sushi-hint');

    dragTo(wrong[1], ON_CAT);
    await settleRound();
    expect(piece(target).className).toContain('sushi-hint');
  });

  it('makes the round easier after repeated misses', async () => {
    await start({ level: 3 });
    const target = targetOnScreen();
    const wrong = optionsOnScreen().filter((l) => l !== target);

    dragTo(wrong[0], ON_CAT);
    await settleRound();
    dragTo(wrong[1], ON_CAT);
    await settleRound();

    expect(profileSeen.level).toBe(2);
  });
});

describe('gestures that are not an answer', () => {
  it('ignores a piece let go of anywhere but the cat', async () => {
    await start();
    const target = targetOnScreen();
    playLog.length = 0;

    dragTo(target, AWAY);
    await settleRound();

    expect(playLog).not.toContain('cat/nom');
    expect(profileSeen.letterStats).toEqual({});
  });

  it('nudges rather than answers when he taps instead of dragging', async () => {
    await start();
    const target = targetOnScreen();
    playLog.length = 0;

    tapPiece(target);
    expect(piece(target).className).toContain('sushi-hop');

    await settleRound();
    expect(profileSeen.letterStats).toEqual({});
    expect(playLog).toEqual([`letter/${target}`, `prompt/${target}`]);
  });

  it('holds the pieces shut until the prompt has been heard, when asked to', async () => {
    render(<Harness initial={{ ...blankProfile(), settings: { gateChoices: true, roundsPerMeal: 8 } }} />);
    await tick(1400); // the prompt has started but not finished
    const target = targetOnScreen();

    dragTo(target, ON_CAT);
    await tick(100);
    expect(playLog).not.toContain('cat/nom');

    await tick(3000);
    dragTo(targetOnScreen(), ON_CAT);
    await settleRound();
    expect(playLog).toContain('cat/nom');
  });
});

describe('the piece in his hand', () => {
  /* Endless Alphabet's trick, and the one thing here that teaches before the
     game has judged anything: hold a piece and it says its own sound, so he can
     hear what he is carrying against what he was asked for. */
  it('wakes up and says its own sound when he holds it', async () => {
    await start();
    const target = targetOnScreen();
    playLog.length = 0;

    fireEvent.pointerDown(piece(target), { pointerId: 1, clientX: 0, clientY: -140 });
    await tick(500);

    expect(piece(target).className).toContain('sushi-alive');
    expect(playLog).toContain(`prompt/${target}`);
  });

  it('goes quiet again the moment he lets go', async () => {
    await start();
    const target = targetOnScreen();

    fireEvent.pointerDown(piece(target), { pointerId: 1, clientX: 0, clientY: -140 });
    await tick(500);
    // carried away and put down, not tapped — a tap replays the question, which
    // would put the same clip in the log for a completely different reason
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 900, clientY: 900 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 900, clientY: 900 });
    playLog.length = 0;

    await tick(4000);
    expect(playLog).not.toContain(`prompt/${target}`);
    expect(piece(target).className).not.toContain('sushi-alive');
  });

  /* A four-year-old's hand rests on the counter constantly. If a brush woke a
     piece, the game would be talking over its own question all day. */
  it('is not woken by a touch too short to be a hold', async () => {
    await start();
    const target = targetOnScreen();

    fireEvent.pointerDown(piece(target), { pointerId: 1, clientX: 10, clientY: 10 });
    await tick(200);
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 10, clientY: 10 });

    expect(piece(target).className).not.toContain('sushi-alive');
  });
});

describe('what the cat does with a mouthful', () => {
  const reactionShowing = () =>
    document.querySelector('svg[data-reaction]')?.getAttribute('data-reaction') ?? null;

  /* The old game had exactly one: chomp, pleased face, next question, eight
     times a meal, every day. Sixteen of them are dealt from a shuffled pack, so
     four in a row can never repeat. */
  it('does something different every time', async () => {
    await start();
    const seen = new Set<string>();

    for (let i = 0; i < 4; i++) {
      dragTo(targetOnScreen(), ON_CAT);
      await tick(900); // swallowed, and the reaction is on screen
      const rx = reactionShowing();
      expect(rx, 'no reaction was showing after he swallowed').toBeTruthy();
      seen.add(rx!);
      await settleRound();
    }

    expect(seen.size).toBe(4);
  });

  it('is over before the next question starts', async () => {
    await start();
    dragTo(targetOnScreen(), ON_CAT);
    await settleRound();
    expect(reactionShowing()).toBeNull();
  });
});

describe('the gold round', () => {
  /* One round a meal arrives gold. Every piece in it is gold, never just the
     answer — a single shimmering piece would point straight at the right one
     and the round would stop being a question at all. */
  it('turns every piece gold, so the gold gives nothing away', async () => {
    await start({ settings: { gateChoices: false, roundsPerMeal: 1 } });
    const gold = document.querySelectorAll('.sushi-gold');
    expect(gold).toHaveLength(optionsOnScreen().length);
  });

  it('hands over a decoration while he is still watching', async () => {
    await start({ settings: { gateChoices: false, roundsPerMeal: 1 } });
    const before = profileSeen.decorations.length;

    dragTo(targetOnScreen(), ON_CAT);
    await tick(900);

    expect(profileSeen.decorations.length).toBe(before + 1);
  });

  /* The gold used to be worked out from the number of pieces eaten, which goes
     up the moment an answer is accepted — so the piece left over from the round
     before turned gold while the cat was still chewing, a full round early. */
  it('does not turn gold while the cat is still eating the round before', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.6); // the gold is the second of two
    await start({ settings: { gateChoices: false, roundsPerMeal: 2 } });
    expect(document.querySelectorAll('.sushi-gold')).toHaveLength(0);

    dragTo(targetOnScreen(), ON_CAT);
    await tick(900); // swallowed and reacting, but the next round has not opened
    expect(document.querySelectorAll('.sushi-gold')).toHaveLength(0);

    await settleRound();
    expect(document.querySelectorAll('.sushi-gold').length).toBeGreaterThan(0);
  });

  it('leaves the ordinary rounds alone', async () => {
    // 0.99 puts the gold round last, so the first one is a plain one
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    await start({ settings: { gateChoices: false, roundsPerMeal: 8 } });
    expect(document.querySelectorAll('.sushi-gold')).toHaveLength(0);
  });
});

describe('a run of right answers', () => {
  /* It builds rather than being announced once: the room lights at three, the
     paper comes down at five. */
  it('brings the paper down at five in a row, and not before', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // and keeps the gold round out of the way
    await start({ settings: { gateChoices: false, roundsPerMeal: 8 } });

    for (let i = 0; i < 4; i++) await feedCorrect();
    expect(document.querySelectorAll('.confetti')).toHaveLength(0);

    await feedCorrect();
    expect(document.querySelectorAll('.confetti').length).toBeGreaterThan(0);
  });
});

describe('under StrictMode', () => {
  /* React mounts, throws away and remounts every component in development. A
     screen that treats the first unmount as "the child has left" goes silent
     after one bite — which is what this game did, in dev only, until the
     alive flag was reset on the way back in. */
  it('still finishes a round after being mounted twice', async () => {
    const initial = blankProfile();
    profileSeen = initial;
    render(
      <StrictMode>
        <Harness initial={initial} />
      </StrictMode>,
    );
    await tick(2200);

    const target = targetOnScreen();
    dragTo(target, ON_CAT);
    await settleRound();

    expect(playLog).toContain('cat/nom');
    expect(profileSeen.letterStats[target]).toMatchObject({ seen: 1, correct: 1 });
    expect(screen.getByLabelText(/1 of 8/)).toBeTruthy();
  });
});

describe('the way out', () => {
  it('goes home when the home button is pressed', async () => {
    await start();
    expect(exited).toBe(false);
    fireEvent.pointerDown(screen.getByLabelText('home'));
    expect(exited).toBe(true);
  });
});
