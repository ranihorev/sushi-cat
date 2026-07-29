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
  seen: number;
  correct: number;
  /** recency-weighted mastery 0..1 — reacts faster than a raw ratio */
  mastery: number;
  /** meal index when last shown, for spaced repetition */
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
