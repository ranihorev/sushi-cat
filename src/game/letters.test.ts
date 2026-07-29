import { describe, expect, it } from 'vitest';
import type { Letter } from './letters';
import {
  ALL_LETTERS,
  BATCHES,
  HOMOPHONES,
  LETTERS,
  STARTER_SET,
  TOPPING_COLORS,
  looksAlike,
  soundsAlike,
} from './letters';

/** every unlock stage, from the starter set to the full alphabet */
const stages = (): Letter[][] => {
  const out: Letter[][] = [[...STARTER_SET]];
  for (const batch of BATCHES) out.push([...out[out.length - 1], ...batch]);
  return out;
};

describe('letter data', () => {
  it('covers the whole alphabet exactly once', () => {
    expect(ALL_LETTERS).toHaveLength(26);
    expect(ALL_LETTERS.join('')).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
  });

  it('gives every letter a sound, an arpabet spelling, a word and a real topping', () => {
    for (const l of ALL_LETTERS) {
      const info = LETTERS[l];
      expect(info.sound, l).toMatch(/^\/.+\/$/);
      expect(info.arpa.trim(), l).not.toBe('');
      expect(info.word.trim(), l).not.toBe('');
      expect(TOPPING_COLORS[info.topping], `${l} topping`).toBeDefined();
    }
  });

  it('picks example words that start with the letter', () => {
    for (const l of ALL_LETTERS) {
      // X is the exception every phonics scheme makes: /ks/ is word-final
      if (l === 'X') continue;
      expect(LETTERS[l].word[0].toUpperCase(), l).toBe(l);
    }
  });
});

describe('progression', () => {
  it('unlocks every letter exactly once', () => {
    const ordered = [...STARTER_SET, ...BATCHES.flat()];
    expect(new Set(ordered).size).toBe(ordered.length);
    expect([...ordered].sort().join('')).toBe(ALL_LETTERS.join(''));
  });

  it('starts with enough letters to fill the hardest round', () => {
    // level 3 puts four pieces on the counter
    expect(STARTER_SET.length).toBeGreaterThanOrEqual(4);
  });

  it('never repeats a topping inside a group unlocked together', () => {
    for (const group of [STARTER_SET, ...BATCHES]) {
      const toppings = group.map((l) => LETTERS[l].topping);
      expect(new Set(toppings).size, group.join('')).toBe(group.length);
    }
  });

  it('always leaves four distinct toppings available to draw from', () => {
    for (const stage of stages()) {
      const toppings = new Set(stage.map((l) => LETTERS[l].topping));
      expect(toppings.size, stage.join('')).toBeGreaterThanOrEqual(4);
    }
  });

  it('never introduces a letter that sounds identical to one already in play', () => {
    // C and K are both /k/; showing them together would make a round unanswerable
    for (const group of [STARTER_SET, ...BATCHES]) {
      for (const a of group) {
        for (const b of group) expect(soundsAlike(a, b), `${a}${b}`).toBe(false);
      }
    }
  });
});

describe('confusability', () => {
  it('treats sounding alike as symmetric and never self-referential', () => {
    for (const a of ALL_LETTERS) {
      expect(soundsAlike(a, a)).toBe(false);
      for (const b of ALL_LETTERS) expect(soundsAlike(a, b)).toBe(soundsAlike(b, a));
    }
  });

  it('treats looking alike as symmetric and never self-referential', () => {
    for (const a of ALL_LETTERS) {
      expect(looksAlike(a, a)).toBe(false);
      for (const b of ALL_LETTERS) expect(looksAlike(a, b)).toBe(looksAlike(b, a));
    }
  });

  it('knows C and K share a sound', () => {
    expect(soundsAlike('C', 'K')).toBe(true);
    expect(HOMOPHONES.flat()).toContain('C');
  });

  it('knows the classic reversals look alike', () => {
    expect(looksAlike('M', 'W')).toBe(true);
    expect(looksAlike('E', 'F')).toBe(true);
    expect(looksAlike('M', 'S')).toBe(false);
  });

  it('leaves every letter at least three lookalike-free partners', () => {
    // otherwise a level 1 or 2 round could not be built without relaxing the rules
    for (const a of ALL_LETTERS) {
      const safe = ALL_LETTERS.filter((b) => b !== a && !looksAlike(a, b) && !soundsAlike(a, b));
      expect(safe.length, a).toBeGreaterThanOrEqual(3);
    }
  });
});
