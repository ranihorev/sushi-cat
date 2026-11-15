/**
 * The jokes.
 *
 * The cat already does one of sixteen small things after every mouthful. These
 * are bigger, and they are rare on purpose: a joke that comes every round stops
 * being a joke and starts being the thing between him and the next question.
 * One comes about every five to eight right answers, counted across the whole
 * visit rather than per game, so a short meal can go by with none and the next
 * one can open with one. He can never tell when the next one is coming, which
 * is the whole point.
 *
 * Three of them happen by themselves after a right answer (`MEAL_GAGS`). Three
 * more are his to start, by tapping the cat when nothing is being asked of him
 * (`TAP_GAGS`). And on the street, now and then, something peeks out of one of
 * the doors.
 */

/** the big sneeze that sends a piece of sushi flying off across the room */
export type Gag =
  | 'achoo'
  /** a lump of wasabi: the face goes red and steam comes out of his ears */
  | 'wasabi'
  /** he says a silly word, "SPLAT!", and falls flat over */
  | 'splat'
  /** tap gags: a big burp, a wiggle dance, a huge yawn */
  | 'burp'
  | 'wiggle'
  | 'yawn';

export const MEAL_GAGS = ['achoo', 'wasabi', 'splat'] as const satisfies readonly Gag[];
export const TAP_GAGS = ['burp', 'wiggle', 'yawn'] as const satisfies readonly Gag[];

/** how long each one runs, so the game can wait for it before going on */
export const GAG_MS: Record<Gag, number> = {
  achoo: 1700,
  wasabi: 2100,
  splat: 2300,
  burp: 1300,
  wiggle: 1300,
  yawn: 1600,
};

/** who peeks out of a door on the street */
export type DoorGuest = 'fish' | 'octopus';

/** fewest and most right answers between two jokes */
export const GAP_MIN = 5;
export const GAP_MAX = 8;

/** a door surprise on about one visit to the street in three, never twice running */
const DOOR_CHANCE = 0.34;

/** after a tap joke, this long before another tap does anything */
export const TAP_COOLDOWN_MS = 2600;

function shuffled<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

class SurpriseClock {
  /** off in unit tests, so a joke never lands in the middle of a test's round */
  off = false;
  private since = 0;
  private gap = this.newGap();
  private bags = new Map<string, Gag[]>();
  private lastDoor = false;
  /** a joke asked for by name: the next right answer (or tap) gets it */
  private queued: Gag | null = null;
  private doorAt = -Infinity;
  private doorGuest: DoorGuest | null = null;

  private newGap() {
    return GAP_MIN + Math.floor(Math.random() * (GAP_MAX - GAP_MIN + 1));
  }

  /** Count one right answer. True when this one gets a joke. */
  tick(): boolean {
    if (this.queued) return true;
    if (this.off) return false;
    this.since++;
    if (this.since < this.gap) return false;
    this.since = 0;
    this.gap = this.newGap();
    return true;
  }

  /** The next joke from a pool, dealt from a shuffled pack so none repeats
      before the others have had their turn. */
  deal<G extends Gag>(pool: readonly G[]): G {
    const q = this.queued;
    if (q && (pool as readonly Gag[]).includes(q)) {
      this.queued = null;
      return q as G;
    }
    const key = pool.join();
    let bag = this.bags.get(key) as G[] | undefined;
    if (!bag?.length) {
      bag = shuffled(pool);
      this.bags.set(key, bag);
    }
    return bag.pop()!;
  }

  /** For one visit to the street: who peeks out, or null for nobody. */
  door(): DoorGuest | null {
    /* React's development mode builds the street twice in a row; both builds
       must get the same answer, or the second one always says "nobody". */
    const now = Date.now();
    if (now - this.doorAt < 1000) return this.doorGuest;
    this.doorAt = now;
    if (this.off || this.lastDoor || Math.random() >= DOOR_CHANCE) {
      this.lastDoor = false;
      this.doorGuest = null;
    } else {
      this.lastDoor = true;
      this.doorGuest = Math.random() < 0.5 ? 'fish' : 'octopus';
    }
    return this.doorGuest;
  }

  /** for a parent's screenshot, or a test: the next visit to the street has a guest */
  forceDoor(who: DoorGuest) {
    this.lastDoor = false;
    this.doorAt = Date.now();
    this.doorGuest = who;
  }

  /** the next right answer, or tap, gets this joke — for tests and screenshots */
  forceNext(gag: Gag) {
    this.queued = gag;
  }

  /** back to the start; tests can also turn the jokes off */
  reset({ off = false }: { off?: boolean } = {}) {
    this.off = off;
    this.since = 0;
    this.gap = this.newGap();
    this.bags.clear();
    this.lastDoor = false;
    this.doorAt = -Infinity;
    this.doorGuest = null;
    this.queued = null;
  }
}

export const surprises = new SurpriseClock();
