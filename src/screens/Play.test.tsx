import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CAT_CLIPS } from '../game/audio';
import type { Letter } from '../game/letters';
import { blankProfile } from '../game/store';
import type { Profile } from '../game/types';
import { playLog } from '../test/audio-stub';
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
  await tick(1000); // the prompt is held back briefly at the start of a round
};

const tick = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

/** the round is over and the next prompt has landed */
const settleRound = () => tick(4000);

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
    expect(playLog).toEqual([`letter/${target}`, `prompt/${target}`]);
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
    expect(playLog).toContain(`confirm/${target}`);
    expect(profileSeen.letterStats[target]).toMatchObject({ seen: 1, correct: 1 });
  });

  it('asks a new question afterwards', async () => {
    await start();
    const first = await feedCorrect();
    expect(targetOnScreen()).not.toBe(first);
    expect(optionsOnScreen()).toContain(targetOnScreen());
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
  it('is never punished — the cat just looks puzzled and asks again', async () => {
    await start();
    const target = targetOnScreen();
    const wrong = distractorOnScreen();
    playLog.length = 0;

    dragTo(wrong, ON_CAT);
    await settleRound();

    expect(playLog.some((c) => CAT_CLIPS.includes(c))).toBe(true);
    expect(playLog).not.toContain(`confirm/${wrong}`);
    expect(playLog.slice(-2)).toEqual([`letter/${target}`, `prompt/${target}`]);
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
    await tick(400);
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
    await tick(1000);

    const target = targetOnScreen();
    dragTo(target, ON_CAT);
    await settleRound();

    expect(playLog).toContain(`confirm/${target}`);
    expect(profileSeen.letterStats[target]).toMatchObject({ seen: 1, correct: 1 });
    expect(screen.getByLabelText(/1 of 8/)).toBeTruthy();
  });
});

describe('the way out', () => {
  it('needs a long press in the corner, so he cannot leave by accident', async () => {
    await start();
    const exit = screen.getByLabelText('exit');

    fireEvent.pointerDown(exit);
    await tick(300);
    fireEvent.pointerUp(exit);
    await tick(2000);
    expect(exited).toBe(false);

    fireEvent.pointerDown(exit);
    await tick(1200);
    expect(exited).toBe(true);
  });
});
