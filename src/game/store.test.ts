import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Letter } from './letters';
import { ALL_LETTERS, BATCHES, STARTER_SET } from './letters';
import {
  NEEDED,
  WINDOW,
  blankProfile,
  isSolid,
  lettersSolid,
  recentScore,
  loadProfile,
  maybeUnlockBatch,
  noteSession,
  recordAnswer,
  recordConfusion,
  saveProfile,
  statFor,
  unlockAllLetters,
  withNameLetters,
} from './store';
import type { Profile } from './types';

const answer = (p: Profile, l: Letter, times: number, correct = true) => {
  let out = p;
  for (let i = 0; i < times; i++) out = recordAnswer(out, l, correct);
  return out;
};

const answerAll = (p: Profile, letters: Letter[], times: number) => {
  let out = p;
  for (const l of letters) out = answer(out, l, times);
  return out;
};

afterEach(() => {
  vi.useRealTimers();
});

describe('the recent window', () => {
  it('starts every letter unseen', () => {
    const s = statFor(blankProfile(), 'Q');
    expect(s).toEqual({ seen: 0, correct: 0, recent: [], lastSeenAt: -99 });
  });

  it('counts every showing but only credits a clean answer', () => {
    let p = blankProfile();
    p = recordAnswer(p, 'S', true);
    p = recordAnswer(p, 'S', false);
    const s = statFor(p, 'S');
    expect(s.seen).toBe(2);
    expect(s.correct).toBe(1);
  });

  it('keeps only the last few results, oldest first', () => {
    let p = answer(blankProfile(), 'S', WINDOW + 2);
    p = recordAnswer(p, 'S', false);
    expect(statFor(p, 'S').recent).toEqual([...Array(WINDOW - 1).fill(true), false]);
  });

  it('reads the slump, not the lifetime ratio', () => {
    // ten right then three wrong: the all-time ratio would still be 0.77
    let p = answer(blankProfile(), 'S', 10);
    p = answer(p, 'S', 3, false);
    const s = statFor(p, 'S');
    expect(s.correct / s.seen).toBeGreaterThan(0.7);
    expect(recentScore(p, 'S')).toBeLessThan(0.3);
  });

  it(`calls a letter solid at ${NEEDED} right out of the last ${WINDOW}`, () => {
    const p = blankProfile();
    expect(isSolid(answer(p, 'S', WINDOW), 'S')).toBe(true);
    // one miss inside the window is forgiven; two is not
    expect(isSolid(recordAnswer(answer(p, 'S', WINDOW), 'S', false), 'S')).toBe(true);
    expect(isSolid(answer(answer(p, 'S', WINDOW), 'S', 2, false), 'S')).toBe(false);
  });

  it('will not call a letter solid before it has been seen a full window', () => {
    const p = answer(blankProfile(), 'S', WINDOW - 1);
    expect(isSolid(p, 'S')).toBe(false);
  });

  it('lets a single miss cost him the standing only once the window fills', () => {
    // a good run stays good — this is what the running average used to break
    let p = answer(blankProfile(), 'S', 10);
    p = recordAnswer(p, 'S', false);
    expect(isSolid(p, 'S')).toBe(true);
  });

  it('counts how much of the alphabet has stuck', () => {
    const p = answerAll(blankProfile(), ['S', 'M'], 5);
    expect(lettersSolid(p)).toBe(2);
  });
});

describe('confusions', () => {
  it('tallies which wrong letter was reached for', () => {
    let p = recordConfusion(blankProfile(), 'M', 'N');
    p = recordConfusion(p, 'M', 'N');
    p = recordConfusion(p, 'M', 'W');
    expect(p.confusions.M).toEqual({ N: 2, W: 1 });
  });

  it('keeps the two directions apart', () => {
    const p = recordConfusion(blankProfile(), 'M', 'N');
    expect(p.confusions.N).toBeUndefined();
  });
});

describe('unlocking', () => {
  it('holds new letters back while more than a couple are still shaky', () => {
    const p = answerAll(blankProfile(), STARTER_SET.slice(0, -2), 5);
    expect(maybeUnlockBatch(p).unlocked).toEqual([]);
    expect(maybeUnlockBatch(p).profile.activeSet).toEqual(STARTER_SET);
  });

  /* The old rule wanted every letter solid at once. As the set grew, each
     letter got a smaller share of the same eight rounds, so one shaky letter
     held the whole alphabet shut and the game stopped progressing entirely. */
  it('does not let one lagging letter hold the alphabet shut', () => {
    const p = answerAll(blankProfile(), STARTER_SET.slice(0, -1), 5);
    expect(maybeUnlockBatch(p).unlocked).toEqual(BATCHES[0]);
  });

  it('opens exactly one batch at a time', () => {
    const p = answerAll(blankProfile(), STARTER_SET, 5);
    const { profile, unlocked } = maybeUnlockBatch(p);
    expect(unlocked).toEqual(BATCHES[0]);
    expect(profile.activeSet).toEqual([...STARTER_SET, ...BATCHES[0]]);
  });

  it('does not open a second batch until the new letters are solid too', () => {
    let p = answerAll(blankProfile(), STARTER_SET, 5);
    p = maybeUnlockBatch(p).profile;
    expect(maybeUnlockBatch(p).unlocked).toEqual([]);
  });

  it('reaches the whole alphabet, one batch per mastered set', () => {
    let p = blankProfile();
    for (let i = 0; i < BATCHES.length; i++) {
      p = answerAll(p, p.activeSet, 5);
      p = maybeUnlockBatch(p).profile;
    }
    expect([...p.activeSet].sort().join('')).toBe(ALL_LETTERS.join(''));
  });

  it('stops asking once every letter is in play', () => {
    const p = answerAll(unlockAllLetters(blankProfile()), ALL_LETTERS, 5);
    expect(maybeUnlockBatch(p).unlocked).toEqual([]);
  });

  it('lets a parent open the whole alphabet at once', () => {
    expect(unlockAllLetters(blankProfile()).activeSet).toEqual(ALL_LETTERS);
  });

  it("adds the child's own name letters without duplicating any", () => {
    const p = withNameLetters(blankProfile(), 'Sam!');
    expect(p.name).toBe('Sam!');
    expect(p.activeSet).toContain('A');
    expect(p.activeSet.filter((l) => l === 'S')).toHaveLength(1);
    expect(new Set(p.activeSet).size).toBe(p.activeSet.length);
  });
});

describe('persistence', () => {
  it('round-trips a profile', () => {
    const p = answer(blankProfile(), 'S', 3);
    saveProfile(p);
    expect(loadProfile()).toEqual(p);
  });

  it('starts fresh when there is nothing stored', () => {
    expect(loadProfile()).toEqual(blankProfile());
  });

  it('starts fresh rather than throwing on damaged storage', () => {
    localStorage.setItem('sushi-cat.profile.v2', '{not json');
    expect(loadProfile()).toEqual(blankProfile());
  });

  it('discards a profile written by an older version', () => {
    localStorage.setItem('sushi-cat.profile.v2', JSON.stringify({ version: 1, activeSet: ['S'] }));
    expect(loadProfile().activeSet).toEqual(STARTER_SET);
  });

  it('repairs an active set full of letters that no longer exist', () => {
    const p = { ...blankProfile(), activeSet: ['S', 'Æ', '1'] as unknown as Letter[] };
    saveProfile(p as Profile);
    // one survivor is not enough to build a round, so fall back to the starter set
    expect(loadProfile().activeSet).toEqual(STARTER_SET);
  });

  /* Profiles written before the window replaced the running average carry a
     `mastery` score instead of a result list. He keeps the standing he earned
     rather than being sent back to the start of the alphabet. */
  it('carries a profile written against the old mastery score across', () => {
    const old = {
      ...blankProfile(),
      activeSet: ['S', 'M', 'T', 'A', 'P', 'C'] as Letter[],
      letterStats: {
        S: { seen: 9, correct: 9, mastery: 0.97, lastSeenAt: 4 },
        M: { seen: 8, correct: 4, mastery: 0.2, lastSeenAt: 4 },
      },
    };
    localStorage.setItem('sushi-cat.profile.v2', JSON.stringify(old));
    const loaded = loadProfile();

    expect(statFor(loaded, 'S').recent).toHaveLength(WINDOW);
    expect(isSolid(loaded, 'S')).toBe(true);
    expect(isSolid(loaded, 'M')).toBe(false);
    expect(statFor(loaded, 'S').seen).toBe(9); // lifetime totals survive
  });

  it('leaves a letter he had barely started short of a full window', () => {
    localStorage.setItem(
      'sushi-cat.profile.v2',
      JSON.stringify({
        ...blankProfile(),
        letterStats: { S: { seen: 2, correct: 2, mastery: 0.56, lastSeenAt: 1 } },
      }),
    );
    expect(statFor(loadProfile(), 'S').recent).toHaveLength(2);
    expect(isSolid(loadProfile(), 'S')).toBe(false);
  });

  it('fills in settings added after the profile was written', () => {
    const p = blankProfile();
    saveProfile({ ...p, settings: { roundsPerMeal: 4 } as Profile['settings'] });
    const loaded = loadProfile();
    expect(loaded.settings.roundsPerMeal).toBe(4);
    expect(loaded.settings.gateChoices).toBe(false);
  });

  it('keeps playing when storage refuses to write', () => {
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded');
    });
    expect(() => saveProfile(blankProfile())).not.toThrow();
    spy.mockRestore();
  });
});

describe('day streak', () => {
  const on = (iso: string) => vi.setSystemTime(new Date(`${iso}T12:00:00Z`));

  it('starts a streak on the first session', () => {
    vi.useFakeTimers();
    on('2026-03-10');
    const p = noteSession(blankProfile());
    expect(p.dayStreak).toBe(1);
    expect(p.lastPlayed).toBe('2026-03-10');
  });

  it('counts a second session on the same day only once', () => {
    vi.useFakeTimers();
    on('2026-03-10');
    const p = noteSession(noteSession(blankProfile()));
    expect(p.dayStreak).toBe(1);
  });

  it('extends the streak the next day and resets after a gap', () => {
    vi.useFakeTimers();
    on('2026-03-10');
    let p = noteSession(blankProfile());
    on('2026-03-11');
    p = noteSession(p);
    expect(p.dayStreak).toBe(2);
    on('2026-03-15');
    p = noteSession(p);
    expect(p.dayStreak).toBe(1);
  });
});
