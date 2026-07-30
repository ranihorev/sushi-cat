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

/**
 * Bring a stored stat up to the current shape. Profiles written before the
 * window replaced the running average carry a `mastery` number instead of a
 * result list, so spread that score back across a full window — he keeps the
 * standing he earned rather than starting the alphabet over.
 */
function normalizeStat(s: LetterStat & { mastery?: number }): LetterStat {
  if (Array.isArray(s.recent)) return { ...s, recent: s.recent.slice(-WINDOW) };
  const right = Math.round((s.mastery ?? 0) * WINDOW);
  const filled = Math.min(WINDOW, s.seen ?? 0);
  return {
    seen: s.seen ?? 0,
    correct: s.correct ?? 0,
    lastSeenAt: s.lastSeenAt ?? -99,
    recent: Array.from({ length: filled }, (_, i) => i < right),
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
    for (const [l, s] of Object.entries(parsed.letterStats ?? {})) {
      if (s) parsed.letterStats[l as Letter] = normalizeStat(s);
    }
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
  return p.letterStats[l] ?? { seen: 0, correct: 0, recent: [], lastSeenAt: -99 };
}

/** How many recent showings decide a letter, and how many of them must be right. */
export const WINDOW = 4;
export const NEEDED = 3;

/** A tally this size already picks the distractor often enough. */
const MAX_CONFUSION = 4;

/** How well he's doing on this letter lately, 0..1. Zero for an unseen letter. */
export function recentScore(p: Profile, l: Letter): number {
  const r = statFor(p, l).recent;
  return r.length ? r.filter(Boolean).length / r.length : 0;
}

/**
 * Record the outcome of a round — once per round, scored on the first attempt.
 * Getting there only after two misses isn't knowing it, so it counts as a miss.
 */
export function recordAnswer(p: Profile, target: Letter, correct: boolean): Profile {
  const prev = statFor(p, target);
  const stat: LetterStat = {
    seen: prev.seen + 1,
    correct: prev.correct + (correct ? 1 : 0),
    recent: [...prev.recent, correct].slice(-WINDOW),
    lastSeenAt: p.mealsCompleted,
  };
  return {
    ...p,
    letterStats: { ...p.letterStats, [target]: stat },
    confusions: correct ? fadeConfusions(p, target) : p.confusions,
  };
}

/**
 * Getting a letter right lets its old mix-ups fade, so a pair he muddled months
 * ago stops shaping the choices he is offered today. Without this the tallies
 * only ever grow, and the letter he once confused stays pinned opposite it for
 * good — the more it is offered, the more chances to tally it again.
 */
function fadeConfusions(p: Profile, target: Letter): Profile['confusions'] {
  const row = p.confusions[target];
  if (!row) return p.confusions;
  const faded: Partial<Record<Letter, number>> = {};
  for (const [l, n] of Object.entries(row) as [Letter, number][]) {
    if (n > 1) faded[l] = n - 1;
  }
  return { ...p.confusions, [target]: faded };
}

/** Which wrong letter he reached for — used to pick sharper distractors later. */
export function recordConfusion(p: Profile, target: Letter, tapped: Letter): Profile {
  const row = { ...(p.confusions[target] ?? {}) };
  row[tapped] = Math.min(MAX_CONFUSION, (row[tapped] ?? 0) + 1);
  return { ...p, confusions: { ...p.confusions, [target]: row } };
}

/** Solid means: seen a full window of times, and right for most of it. */
export function isSolid(p: Profile, l: Letter): boolean {
  const r = statFor(p, l).recent;
  return r.length >= WINDOW && r.filter(Boolean).length >= NEEDED;
}

/** How much of the alphabet is in play, and how much of it has stuck. */
export const lettersSolid = (p: Profile) => ALL_LETTERS.filter((l) => isSolid(p, l)).length;

/**
 * How much of the active set has to be solid before it widens. Demanding every
 * letter at once stalled the game outright: the set grows, each letter gets a
 * smaller share of the same eight rounds, and any single shaky letter held the
 * whole alphabet shut no matter how well he was doing on the rest.
 */
const UNLOCK_SHARE = 0.8;

/** Called at the end of a meal: widen the active set once most of it is solid. */
export function maybeUnlockBatch(p: Profile): { profile: Profile; unlocked: Letter[] } {
  const solid = p.activeSet.filter((l) => isSolid(p, l)).length;
  if (solid < Math.ceil(p.activeSet.length * UNLOCK_SHARE)) return { profile: p, unlocked: [] };

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
