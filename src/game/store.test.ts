import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Letter } from './letters';
import { ALL_LETTERS, BATCHES, STARTER_SET } from './letters';
import {
  blankProfile,
  isSolid,
  lettersSolid,
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

describe('mastery', () => {
  it('starts every letter unseen', () => {
    const s = statFor(blankProfile(), 'Q');
    expect(s).toEqual({ seen: 0, correct: 0, mastery: 0, lastSeenAt: -99 });
  });

  it('counts every showing but only credits a clean answer', () => {
    let p = blankProfile();
    p = recordAnswer(p, 'S', true);
    p = recordAnswer(p, 'S', false);
    const s = statFor(p, 'S');
    expect(s.seen).toBe(2);
    expect(s.correct).toBe(1);
  });

  it('moves mastery a fixed fraction of the way toward the result', () => {
    const p = recordAnswer(blankProfile(), 'S', true);
    expect(statFor(p, 'S').mastery).toBeCloseTo(0.34, 5);
    const q = recordAnswer(p, 'S', true);
    expect(statFor(q, 'S').mastery).toBeCloseTo(0.34 + 0.34 * (1 - 0.34), 5);
  });

  it('forgets a slump faster than a raw ratio would', () => {
    // ten correct then three wrong: the ratio would still be 0.77
    let p = answer(blankProfile(), 'S', 10);
    p = answer(p, 'S', 3, false);
    const s = statFor(p, 'S');
    expect(s.correct / s.seen).toBeGreaterThan(0.7);
    expect(s.mastery).toBeLessThan(0.35);
  });

  it('needs five clean answers before a letter counts as solid', () => {
    const p = blankProfile();
    expect(isSolid(answer(p, 'S', 4), 'S')).toBe(false);
    expect(isSolid(answer(p, 'S', 5), 'S')).toBe(true);
  });

  it('does not call a letter solid on a short perfect run', () => {
    // seen >= 4 is a floor as well as the mastery bar
    const p = answer(blankProfile(), 'S', 3);
    expect(statFor(p, 'S').seen).toBe(3);
    expect(isSolid(p, 'S')).toBe(false);
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
  it('holds new letters back until the whole active set is solid', () => {
    const p = answerAll(blankProfile(), STARTER_SET.slice(0, -1), 5);
    expect(maybeUnlockBatch(p).unlocked).toEqual([]);
    expect(maybeUnlockBatch(p).profile.activeSet).toEqual(STARTER_SET);
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
