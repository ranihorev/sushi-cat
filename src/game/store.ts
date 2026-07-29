import type { Letter } from './letters';
import { ALL_LETTERS, BATCHES, STARTER_SET } from './letters';
import type { LetterStat, Profile } from './types';

const KEY = 'sushi-cat.profile.v2';

const today = () => new Date().toISOString().slice(0, 10);

export function blankProfile(): Profile {
  return {
    version: 2,
    name: '',
    letterStats: {},
    confusions: {},
    activeSet: [...STARTER_SET],
    level: 1,
    mealsCompleted: 0,
    // the room starts lit — an empty restaurant reads as broken, not as potential
    decorations: ['lantern-left', 'lantern-right'],
    lastPlayed: '',
    dayStreak: 0,
    settings: { gateChoices: false, roundsPerMeal: 8 },
  };
}

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blankProfile();
    const parsed = JSON.parse(raw) as Profile;
    if (parsed.version !== 2) return blankProfile();
    // guard against hand-edits and older letter sets
    parsed.activeSet = parsed.activeSet.filter((l) => ALL_LETTERS.includes(l));
    if (parsed.activeSet.length < 2) parsed.activeSet = [...STARTER_SET];
    const base = blankProfile();
    return { ...base, ...parsed, settings: { ...base.settings, ...parsed.settings } };
  } catch {
    return blankProfile();
  }
}

export function saveProfile(p: Profile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* private mode — the game still plays, it just won't remember */
  }
}

export function statFor(p: Profile, l: Letter): LetterStat {
  return p.letterStats[l] ?? { seen: 0, correct: 0, mastery: 0, lastSeenAt: -99 };
}

const MASTERY_ALPHA = 0.34;

/**
 * Record the outcome of a round — once per round, scored on the first attempt.
 * Getting it right only after two misses isn't mastery, so it counts as a miss.
 */
export function recordAnswer(p: Profile, target: Letter, correct: boolean): Profile {
  const prev = statFor(p, target);
  const stat: LetterStat = {
    seen: prev.seen + 1,
    correct: prev.correct + (correct ? 1 : 0),
    mastery: prev.mastery + MASTERY_ALPHA * ((correct ? 1 : 0) - prev.mastery),
    lastSeenAt: p.mealsCompleted,
  };
  return { ...p, letterStats: { ...p.letterStats, [target]: stat } };
}

/** Which wrong letter he reached for — used to pick sharper distractors later. */
export function recordConfusion(p: Profile, target: Letter, tapped: Letter): Profile {
  const row = { ...(p.confusions[target] ?? {}) };
  row[tapped] = (row[tapped] ?? 0) + 1;
  return { ...p, confusions: { ...p.confusions, [target]: row } };
}

/** A letter counts as solid once it's been seen enough and recall is reliable. */
export function isSolid(p: Profile, l: Letter): boolean {
  const s = statFor(p, l);
  return s.seen >= 4 && s.mastery >= 0.82;
}

/** How much of the alphabet is in play, and how much of it has stuck. */
export const lettersSolid = (p: Profile) => ALL_LETTERS.filter((l) => isSolid(p, l)).length;

/** Called at the end of a meal: widen the active set if the current one is solid. */
export function maybeUnlockBatch(p: Profile): { profile: Profile; unlocked: Letter[] } {
  const allSolid = p.activeSet.every((l) => isSolid(p, l));
  if (!allSolid) return { profile: p, unlocked: [] };

  const next = BATCHES.find((b) => b.some((l) => !p.activeSet.includes(l)));
  if (!next) return { profile: p, unlocked: [] };

  const add = next.filter((l) => !p.activeSet.includes(l));
  return {
    profile: { ...p, activeSet: [...p.activeSet, ...add] },
    unlocked: add,
  };
}

/** Parent override: put the whole alphabet in play right now. */
export function unlockAllLetters(p: Profile): Profile {
  return { ...p, activeSet: [...ALL_LETTERS] };
}

/** The child's own letters matter more than any optimal ordering at this age. */
export function withNameLetters(p: Profile, name: string): Profile {
  const letters = [...new Set(name.toUpperCase().split(''))].filter((c) =>
    ALL_LETTERS.includes(c as Letter),
  ) as Letter[];
  const add = letters.filter((l) => !p.activeSet.includes(l));
  return { ...p, name, activeSet: [...p.activeSet, ...add] };
}

export function noteSession(p: Profile): Profile {
  const d = today();
  if (p.lastPlayed === d) return p;
  const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  return {
    ...p,
    lastPlayed: d,
    dayStreak: p.lastPlayed === yesterday ? p.dayStreak + 1 : 1,
  };
}
