import type { Letter } from './letters';

export type Level = 1 | 2 | 3;

/**
 * Which game he picked on the title screen. `counter` and `train` are the sushi
 * game, with the pieces sitting still or riding round on a belt; `cafe` is the
 * kitty cafe, where he pats the cat wearing the letter; `rolls` is the roll
 * shop, where he puts three pieces in order and reads the word they make.
 */
export type GameMode = 'counter' | 'train' | 'cafe' | 'rolls';

/** Prompt style for a round. All three teach; `sound` is the backbone. */
export type RoundKind =
  /** hear the phoneme, find the letter */
  | 'sound'
  /** hear a word, find the letter it starts with */
  | 'word'
  /** hear the letter's name, find the letter */
  | 'name'
  /**
   * The first time he ever sees a letter. It is shown to him with its sound and
   * its picture, it is the only piece on the counter, and nothing is scored: a
   * letter has to be taught once before it can be asked.
   */
  | 'meet';

export interface LetterStat {
  /** lifetime totals — shown to the parent, never used to decide anything */
  seen: number;
  correct: number;
  /**
   * First-try results for the last few showings, oldest first. A fixed window
   * rather than a running average: one bad answer cannot undo a good week, and
   * "three of his last four" is a rule a parent can check by watching.
   */
  recent: boolean[];
  /**
   * Parallel to `recent`: true where that showing had only two choices. A coin
   * toss gets a two-choice round right half the time, so those showings have to
   * be perfect before the letter counts as known. Missing on older profiles.
   */
  easy?: boolean[];
  /** meal index when last shown */
  lastSeenAt: number;
}

export interface Profile {
  version: 2;
  name: string;
  letterStats: Partial<Record<Letter, LetterStat>>;
  /** wrong-letter tallies: confusions[target][tapped] */
  confusions: Partial<Record<Letter, Partial<Record<Letter, number>>>>;
  activeSet: Letter[];
  level: Level;
  mealsCompleted: number;
  /** unlocked restaurant decorations, in unlock order */
  decorations: string[];
  /** letters he has been introduced to; older profiles go by `seen` instead */
  met?: Letter[];
  /** how much of a word he builds himself in the roll shop */
  wordLevel?: Level;
  /** presents he has chosen, in the order he chose them */
  gifts?: string[];
  /** what the cat has on now, one thing for each place it can be worn */
  wearing?: Partial<Record<WearSlot, string>>;
  lastPlayed: string;
  /** consecutive days played */
  dayStreak: number;
  settings: Settings;
}

/** where on the cat a present is worn; toys sit on the counter instead */
export type WearSlot = 'head' | 'ear' | 'face' | 'neck';

/**
 * How a letter he knows is written. `upper` is capitals for ever; `pair` shows
 * "Mm" once the capital is solid; `lower` shows the small letter alone.
 */
export type LetterCase = 'upper' | 'pair' | 'lower';

export interface Settings {
  /** hold the sushi back until the prompt has finished — for a child who taps at random */
  gateChoices: boolean;
  roundsPerMeal: number;
  letterCase: LetterCase;
  /** open the roll shop whatever he knows — for a parent who wants to try it */
  wordsAlwaysOpen: boolean;
}

export interface Round {
  kind: RoundKind;
  target: Letter;
  options: Letter[];
  /** a sound round for a letter he knows: the sound alone, without its name */
  bare?: boolean;
}
