import type { Letter } from './letters';
import { soundsAlike } from './letters';
import { isSolid } from './store';
import type { Profile } from './types';

/* The words he builds in the roll shop.

   Every one is three sounds, one letter each, said the way the letter game
   taught them (no "sh", no silent e), with no letter used twice, and every one
   is a thing that can be drawn — the picture is how he knows what he made.
   They are listed in the order the letters unlock, so the first six letters
   already give him four words. */

export interface RollWord {
  word: string;
  letters: Letter[];
  /** the recording of the whole word */
  clip: string;
}

/** words the letter game already has a recording of, as a letter's clue word */
const SHARED_CLIP: Record<string, string> = {
  cat: 'word/C',
  dog: 'word/D',
  sun: 'word/S',
  hat: 'word/H',
  van: 'word/V',
  box: 'word/X',
};

const WORD_LIST = [
  'cat', 'map', 'cap', 'tap',
  'bat', 'fan', 'man', 'pan', 'can', 'ant',
  'dog', 'rat', 'bag',
  'hat', 'log',
  'pig', 'bed', 'sun', 'bug', 'bus', 'hen', 'pin', 'cup', 'nut', 'leg', 'net', 'ten',
  'jet', 'web',
  'van',
  'box', 'fox', 'six',
] as const;

export const ROLL_WORDS: RollWord[] = WORD_LIST.map((word) => ({
  word,
  letters: word.toUpperCase().split('') as Letter[],
  clip: SHARED_CLIP[word] ?? `roll/${word}`,
}));

/** the door opens once he can make this many different words */
export const WORDS_TO_OPEN = 3;

const madeFrom = (w: RollWord, ok: (l: Letter) => boolean) => w.letters.every(ok);

/** Words made only of letters he knows well. */
export function knownWords(p: Profile): RollWord[] {
  return ROLL_WORDS.filter((w) => madeFrom(w, (l) => p.activeSet.includes(l) && isSolid(p, l)));
}

export function rollShopOpen(p: Profile): boolean {
  return p.settings.wordsAlwaysOpen || knownWords(p).length >= WORDS_TO_OPEN;
}

/**
 * The words on offer today. Known words when there are enough; when a parent
 * has opened the shop early, anything his current letters can spell, and
 * failing that the four words of the starter letters.
 */
export function wordPool(p: Profile): RollWord[] {
  const known = knownWords(p);
  if (known.length >= WORDS_TO_OPEN) return known;
  const active = ROLL_WORDS.filter((w) => madeFrom(w, (l) => p.activeSet.includes(l)));
  return active.length >= WORDS_TO_OPEN ? active : ROLL_WORDS.slice(0, 4);
}

export function pickWord(p: Profile, recent: string[]): RollWord {
  const pool = wordPool(p);
  const fresh = pool.filter((w) => !recent.includes(w.word));
  const from = fresh.length ? fresh : pool.filter((w) => w.word !== recent[recent.length - 1]);
  const list = from.length ? from : pool;
  return list[Math.floor(Math.random() * list.length)];
}

/** Extra pieces that are not in the word, and do not sound like any that is. */
export function distractorsFor(p: Profile, w: RollWord, count: number): Letter[] {
  const pool = p.activeSet.filter(
    (l) => !w.letters.includes(l) && !w.letters.some((x) => soundsAlike(x, l)),
  );
  const out: Letter[] = [];
  while (out.length < count && pool.length) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return out;
}
