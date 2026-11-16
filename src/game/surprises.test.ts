import { describe, expect, it } from 'vitest';
import { GAP_MAX, GAP_MIN, MEAL_GAGS, TAP_GAGS, surprises } from './surprises';

describe('the joke clock', () => {
  it('waits five to eight right answers between two jokes', () => {
    surprises.reset();
    const at: number[] = [];
    for (let i = 1; i <= 400; i++) if (surprises.tick()) at.push(i);
    const gaps = at.map((n, i) => n - (at[i - 1] ?? 0));
    expect(gaps.length).toBeGreaterThan(40);
    for (const g of gaps) {
      expect(g).toBeGreaterThanOrEqual(GAP_MIN);
      expect(g).toBeLessThanOrEqual(GAP_MAX);
    }
  });

  it('never tells a joke while it is off', () => {
    surprises.reset({ off: true });
    for (let i = 0; i < 50; i++) expect(surprises.tick()).toBe(false);
    expect(surprises.door()).toBeNull();
  });

  it('tells each joke once before any comes round again', () => {
    surprises.reset();
    for (const pool of [MEAL_GAGS, TAP_GAGS]) {
      const dealt = pool.map(() => surprises.deal(pool));
      expect(new Set(dealt).size).toBe(pool.length);
    }
  });

  it('never puts a guest at a door two visits running', () => {
    surprises.reset();
    let last: string | null = null;
    let guests = 0;
    // visits to the street, a few seconds apart
    const realNow = Date.now;
    let t = realNow();
    Date.now = () => t;
    try {
      surprises.reset();
      for (let i = 0; i < 300; i++) {
        t += 5000;
        const who = surprises.door();
        if (who) guests++;
        expect(who && last).toBeFalsy();
        last = who;
      }
    } finally {
      Date.now = realNow;
    }
    expect(guests).toBeGreaterThan(30);
  });
});
