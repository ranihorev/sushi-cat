import type { Letter } from './letters';
import { LETTERS, looksAlike, soundsAlike } from './letters';
import type { Level, Profile, Round, RoundKind } from './types';
import { hasMet, isSolid, recentScore, statFor } from './store';

export const optionCountFor = (level: Level) => (level === 1 ? 2 : level === 2 ? 3 : 4);

const rand = (n: number) => Math.floor(Math.random() * n);

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function weightedPick<T>(items: T[], weight: (t: T) => number): T {
  const weights = items.map((i) => Math.max(0.0001, weight(i)));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

/**
 * How badly this letter needs practice right now: one point, plus two for every
 * recent miss. A letter he has never missed scores 1, one he gets wrong every
 * time scores 9 (more if it is also stale), and one he has never seen scores 4 — shakier than a letter he
 * fumbles occasionally, safer than one he cannot do at all.
 */
function needScore(p: Profile, l: Letter): number {
  const { recent, lastSeenAt } = statFor(p, l);
  if (!recent.length) return 4; // never seen — introduce it
  return 1 + recent.filter((ok) => !ok).length * 2 + staleness(p, lastSeenAt);
}

/** a letter starts to count as stale after this many meals without it */
const STALE_AFTER_MEALS = 3;
/** and staleness never outweighs one real miss and a half */
const MAX_STALE = 3;

/**
 * A point for every few meals since he last saw the letter. Without this a
 * letter he once knew scores 1 for good, and as the set grows it can go weeks
 * unseen — which is how a known letter gets forgotten.
 */
function staleness(p: Profile, lastSeenAt: number): number {
  const away = p.mealsCompleted - lastSeenAt;
  return Math.min(MAX_STALE, Math.max(0, Math.floor(away / STALE_AFTER_MEALS)));
}

/**
 * Choose the target: weighted toward the letters he keeps missing, never the
 * same letter twice running, and less likely each time it has already come up
 * this meal.
 */
export function pickTarget(p: Profile, recent: Letter[]): Letter {
  const pool = p.activeSet.filter((l) => l !== recent[recent.length - 1]);
  const counts = new Map<Letter, number>();
  for (const l of recent) counts.set(l, (counts.get(l) ?? 0) + 1);

  return weightedPick(
    pool.length ? pool : p.activeSet,
    (l) => needScore(p, l) / (1 + (counts.get(l) ?? 0)),
  );
}

/**
 * Distractors. At level 3 we deliberately pull in letters he has actually
 * confused with the target before — that is where the learning is.
 */
export function buildOptions(
  p: Profile,
  target: Letter,
  count: number,
  allowLookalikes: boolean,
): Letter[] {
  const chosen: Letter[] = [target];
  const confusedWith = p.confusions[target] ?? {};

  /* Two pieces on the counter never share a topping — colour stays a reliable
     second cue while the letter shapes are still being learned. */
  const distinctTopping = (l: Letter) =>
    !chosen.some((c) => LETTERS[c].topping === LETTERS[l].topping);

  const eligible = (strict: boolean) =>
    p.activeSet.filter(
      (l) =>
        !chosen.includes(l) &&
        !chosen.some((c) => soundsAlike(c, l)) &&
        (!strict || distinctTopping(l)) &&
        (allowLookalikes || !chosen.some((c) => looksAlike(c, l))),
    );

  while (chosen.length < count) {
    // relax the constraints one at a time rather than stalling on a small set
    let pool = eligible(true);
    if (!pool.length) pool = eligible(false);
    if (!pool.length) {
      pool = p.activeSet.filter(
        (l) => !chosen.includes(l) && !chosen.some((c) => soundsAlike(c, l)),
      );
    }
    if (!pool.length) break;

    chosen.push(
      weightedPick(pool, (l) => {
        const confusion = confusedWith[l] ?? 0;
        const bias = allowLookalikes ? 1 + confusion : 1;
        // a strong letter makes a better distractor than one he's still learning
        return bias * (0.5 + recentScore(p, l));
      }),
    );
  }
  return shuffle(chosen);
}

/** Sound is the backbone; word and name rounds appear once a letter is solid. */
function pickKind(p: Profile, target: Letter): RoundKind {
  if (!isSolid(p, target)) return 'sound';
  const r = Math.random();
  if (r < 0.6) return 'sound';
  if (r < 0.85) return 'word';
  return 'name';
}

export function nextRound(p: Profile, level: Level, recent: Letter[]): Round {
  const target = pickTarget(p, recent);
  /* A letter is shown to him before it is ever asked: alone on the counter,
     with its sound and its picture. */
  if (!hasMet(p, target)) return { kind: 'meet', target, options: [target] };
  const kind = pickKind(p, target);
  return {
    kind,
    /* While he is learning a letter its name leads the sound in. Once he knows
       it the name is dropped, or he can answer from the name and never listen
       to the sound at all. */
    bare: kind === 'sound' && isSolid(p, target),
    target,
    options: buildOptions(p, target, optionCountFor(level), level >= 3),
  };
}

export const promote = (level: Level): Level => (level < 3 ? ((level + 1) as Level) : level);
export const demote = (level: Level): Level => (level > 1 ? ((level - 1) as Level) : level);
