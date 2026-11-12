import { describe, expect, it } from 'vitest';
import { hasPicture } from '../components/Picture';
import { WEAR } from '../components/Wear';
import { GIFTS, offerGifts, takeGift, toggleWear, wornBy } from './gifts';
import type { Letter } from './letters';
import { ALL_LETTERS, LETTERS, STARTER_SET } from './letters';
import { WINDOW, blankProfile, glyphFor, hasMet, markMet, recordAnswer } from './store';
import type { Profile } from './types';
import { ROLL_WORDS, WORDS_TO_OPEN, distractorsFor, knownWords, pickWord, rollShopOpen, wordPool } from './words';

const solid = (p: Profile, letters: readonly Letter[]): Profile => {
  let out = p;
  for (const l of letters) for (let i = 0; i < WINDOW; i++) out = recordAnswer(out, l, true);
  return out;
};

describe('pictures', () => {
  it('has one for every letter word', () => {
    const missing = ALL_LETTERS.filter((l) => !hasPicture(LETTERS[l].word));
    expect(missing).toEqual([]);
  });

  it('has one for every word he can build', () => {
    expect(ROLL_WORDS.filter((w) => !hasPicture(w.word)).map((w) => w.word)).toEqual([]);
  });

  it('has the box and the padlock the screens use', () => {
    expect(hasPicture('gift')).toBe(true);
    expect(hasPicture('lock')).toBe(true);
  });
});

describe('roll words', () => {
  it('are three letters, none used twice, so a piece is known by its letter', () => {
    for (const w of ROLL_WORDS) {
      expect(w.letters, w.word).toHaveLength(3);
      expect(new Set(w.letters).size, w.word).toBe(3);
    }
  });

  it('keeps the shop shut for a child who knows no letters yet', () => {
    const p = blankProfile();
    expect(knownWords(p)).toEqual([]);
    expect(rollShopOpen(p)).toBe(false);
  });

  it('opens the shop once the starter letters are solid', () => {
    const p = solid(blankProfile(), STARTER_SET);
    expect(knownWords(p).length).toBeGreaterThanOrEqual(WORDS_TO_OPEN);
    expect(rollShopOpen(p)).toBe(true);
    for (const w of knownWords(p)) for (const l of w.letters) expect(STARTER_SET).toContain(l);
  });

  it('opens early when a parent says so, and still has words to offer', () => {
    const p = blankProfile();
    const open = { ...p, settings: { ...p.settings, wordsAlwaysOpen: true } };
    expect(rollShopOpen(open)).toBe(true);
    expect(wordPool(open).length).toBeGreaterThanOrEqual(WORDS_TO_OPEN);
  });

  it('does not ask for the same word twice running', () => {
    const p = solid(blankProfile(), STARTER_SET);
    let last = '';
    for (let i = 0; i < 100; i++) {
      const w = pickWord(p, [last]);
      expect(w.word).not.toBe(last);
      last = w.word;
    }
  });

  it('never offers an extra piece that is in the word or sounds like one that is', () => {
    const p = { ...blankProfile(), activeSet: [...ALL_LETTERS] };
    const cat = ROLL_WORDS.find((w) => w.word === 'cat')!;
    for (let i = 0; i < 100; i++) {
      const [d] = distractorsFor(p, cat, 1);
      expect(cat.letters).not.toContain(d);
      expect(d).not.toBe('K');
    }
  });
});

describe('meeting letters and small letters', () => {
  it('has met nothing at the start, and a letter once it is marked', () => {
    const p = blankProfile();
    expect(hasMet(p, 'S')).toBe(false);
    expect(hasMet(markMet(p, 'S'), 'S')).toBe(true);
  });

  it('writes a new letter as a capital and a known one as the pair', () => {
    const p = blankProfile();
    expect(glyphFor(p, 'M')).toBe('M');
    expect(glyphFor(solid(p, ['M']), 'M')).toBe('Mm');
  });

  it('follows the parent setting', () => {
    const p = solid(blankProfile(), ['M']);
    const set = (letterCase: Profile['settings']['letterCase']) => ({
      ...p,
      settings: { ...p.settings, letterCase },
    });
    expect(glyphFor(set('upper'), 'M')).toBe('M');
    expect(glyphFor(set('lower'), 'M')).toBe('m');
  });
});

describe('presents', () => {
  it('has a drawing for every present', () => {
    expect(GIFTS.filter((g) => !WEAR[g.id]).map((g) => g.id)).toEqual([]);
  });

  it('offers two different ones he does not have', () => {
    const p = { ...blankProfile(), gifts: ['bow'] };
    for (let i = 0; i < 50; i++) {
      const [a, b] = offerGifts(p);
      expect(a.id).not.toBe(b.id);
      expect([a.id, b.id]).not.toContain('bow');
    }
  });

  it('runs out quietly when he has them all', () => {
    expect(offerGifts({ ...blankProfile(), gifts: GIFTS.map((g) => g.id) })).toEqual([]);
  });

  it('puts a present on the cat when he takes it, and a toy on the shelf', () => {
    let p = takeGift(blankProfile(), 'crown');
    expect(wornBy(p)).toEqual(['crown']);
    p = takeGift(p, 'yarn');
    expect(p.gifts).toEqual(['crown', 'yarn']);
    expect(wornBy(p)).toEqual(['crown']);
  });

  it('wears one thing in each place, and takes it off again', () => {
    let p = takeGift(takeGift(blankProfile(), 'crown'), 'party-hat');
    expect(wornBy(p)).toEqual(['party-hat']);
    p = toggleWear(p, 'crown');
    expect(wornBy(p)).toEqual(['crown']);
    p = toggleWear(p, 'crown');
    expect(wornBy(p)).toEqual([]);
  });

  it('will not wear what he does not own', () => {
    expect(wornBy(toggleWear(blankProfile(), 'crown'))).toEqual([]);
  });
});
