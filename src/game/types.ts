import type { Letter } from './letters';

export type Level = 1 | 2 | 3;

/** Prompt style for a round. All three teach; `sound` is the backbone. */
export type RoundKind =
  /** hear the phoneme, find the letter */
  | 'sound'
  /** hear a word, find the letter it starts with */
  | 'word'
  /** hear the letter's name, find the letter */
  | 'name';

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
  lastPlayed: string;
  /** consecutive days played */
  dayStreak: number;
  settings: Settings;
}

export interface Settings {
  /** hold the sushi back until the prompt has finished — for a child who taps at random */
  gateChoices: boolean;
  roundsPerMeal: number;
}

export interface Round {
  kind: RoundKind;
  target: Letter;
  options: Letter[];
}
