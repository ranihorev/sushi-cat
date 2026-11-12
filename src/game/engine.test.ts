import { describe, expect, it } from 'vitest';
import { buildOptions, demote, nextRound, optionCountFor, pickTarget, promote } from './engine';
import type { Letter } from './letters';
import { BATCHES, LETTERS, STARTER_SET, looksAlike, soundsAlike } from './letters';
import { WINDOW, blankProfile, recordAnswer, recordConfusion, unlockAllLetters } from './store';
import type { Level, Profile } from './types';

const LEVELS: Level[] = [1, 2, 3];

/** the active set at each point in the progression */
const stages = (): Letter[][] => {
  const out: Letter[][] = [[...STARTER_SET]];
  for (const b of BATCHES) out.push([...out[out.length - 1], ...b]);
  return out;
};

const withActive = (active: Letter[]): Profile => ({
  ...blankProfile(),
  activeSet: [...active],
  met: [...active],
});

const master = (p: Profile, letters: Letter[]): Profile => {
  let out = p;
  for (const l of letters) for (let i = 0; i < 6; i++) out = recordAnswer(out, l, true);
  return out;
};

const pairs = <T,>(xs: T[]): [T, T][] =>
  xs.flatMap((a, i) => xs.slice(i + 1).map((b) => [a, b] as [T, T]));

describe('option count', () => {
  it('widens the counter as he gets better', () => {
    expect(LEVELS.map(optionCountFor)).toEqual([2, 3, 4]);
  });

  it('clamps promotion and demotion at the ends', () => {
    expect(promote(3)).toBe(3);
    expect(promote(1)).toBe(2);
    expect(demote(1)).toBe(1);
    expect(demote(3)).toBe(2);
  });
});

describe('building the choices', () => {
  it('always offers the target, and never the same piece twice', () => {
    for (const active of stages()) {
      const p = withActive(active);
      for (const level of LEVELS) {
        const n = optionCountFor(level);
        for (let i = 0; i < 60; i++) {
          const target = active[i % active.length];
          const opts = buildOptions(p, target, n, level >= 3);
          expect(opts, `${active.length} letters, level ${level}`).toContain(target);
          expect(opts).toHaveLength(n);
          expect(new Set(opts).size).toBe(n);
        }
      }
    }
  });

  it('never puts two letters with the same sound on the counter', () => {
    // C and K are both /k/ — a round with both has no right answer
    const p = unlockAllLetters(blankProfile());
    for (let i = 0; i < 400; i++) {
      const target = p.activeSet[i % p.activeSet.length];
      const opts = buildOptions(p, target, 4, true);
      for (const [a, b] of pairs(opts)) expect(soundsAlike(a, b), `${a}/${b}`).toBe(false);
    }
  });

  it('keeps lookalikes apart until level 3', () => {
    for (const active of stages()) {
      const p = withActive(active);
      for (const level of [1, 2] as Level[]) {
        for (let i = 0; i < 60; i++) {
          const target = active[i % active.length];
          const opts = buildOptions(p, target, optionCountFor(level), false);
          for (const [a, b] of pairs(opts)) expect(looksAlike(a, b), `${a}/${b}`).toBe(false);
        }
      }
    }
  });

  it('does bring lookalikes in at level 3 — that is the point of it', () => {
    const p = unlockAllLetters(blankProfile());
    let seen = 0;
    for (let i = 0; i < 300; i++) {
      const opts = buildOptions(p, 'M', 4, true);
      if (opts.some((l) => looksAlike('M', l))) seen++;
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('gives every piece a different topping so colour stays a reliable cue', () => {
    for (const active of stages()) {
      const p = withActive(active);
      for (let i = 0; i < 60; i++) {
        const target = active[i % active.length];
        const opts = buildOptions(p, target, 4, true);
        const toppings = opts.map((l) => LETTERS[l].topping);
        expect(new Set(toppings).size, opts.join('')).toBe(opts.length);
      }
    }
  });

  it('still returns a playable round when the active set is barely big enough', () => {
    const p = withActive(['S', 'M']);
    const opts = buildOptions(p, 'S', 4, true);
    expect(opts).toContain('S');
    expect(opts).toHaveLength(2); // all it can offer, rather than a crash or a repeat
  });

  it('reaches for the letters he has actually confused, once lookalikes are allowed', () => {
    let p = unlockAllLetters(blankProfile());
    for (let i = 0; i < 10; i++) p = recordConfusion(p, 'M', 'N');

    const count = (profile: Profile) => {
      let n = 0;
      for (let i = 0; i < 300; i++) if (buildOptions(profile, 'M', 4, true).includes('N')) n++;
      return n;
    };
    expect(count(p)).toBeGreaterThan(count(unlockAllLetters(blankProfile())));
  });
});

describe('choosing the target', () => {
  it('never asks for the same letter twice in a row', () => {
    const p = withActive([...STARTER_SET]);
    let recent: Letter[] = ['S'];
    for (let i = 0; i < 200; i++) {
      const r = nextRound(p, 1, recent);
      expect(r.target).not.toBe(recent[recent.length - 1]);
      recent = [...recent, r.target].slice(-4);
    }
  });

  it('spends most of the meal on the letters he is weakest at', () => {
    // everything solid except T
    const p = master(withActive([...STARTER_SET]), STARTER_SET.filter((l) => l !== 'T'));
    let hits = 0;
    for (let i = 0; i < 600; i++) if (nextRound(p, 1, []).target === 'T') hits++;
    // uniform would be 100 of 600
    expect(hits).toBeGreaterThan(200);
  });

  it('backs off a letter it has already asked twice this meal', () => {
    const p = withActive([...STARTER_SET]);
    const recent: Letter[] = ['S', 'S', 'M'];
    let hits = 0;
    // expected about 230 of 3000; an even share of the five letters would be 600
    for (let i = 0; i < 3000; i++) if (nextRound(p, 1, recent).target === 'S') hits++;
    expect(hits).toBeLessThan(300);
  });
});

describe('kind of question', () => {
  it('only asks for the sound while a letter is still new', () => {
    const p = withActive([...STARTER_SET]);
    for (let i = 0; i < 200; i++) expect(nextRound(p, 1, []).kind).toBe('sound');
  });

  it('waits until a letter is solid before it varies the question', () => {
    let nearly = withActive([...STARTER_SET]);
    for (const l of STARTER_SET)
      for (let i = 0; i < WINDOW - 1; i++) nearly = recordAnswer(nearly, l, true);
    for (let i = 0; i < 200; i++) expect(nextRound(nearly, 1, []).kind).toBe('sound');

    const solid = STARTER_SET.reduce((p, l) => recordAnswer(p, l, true), nearly);
    const kinds = new Set<string>();
    for (let i = 0; i < 300; i++) kinds.add(nextRound(solid, 1, []).kind);
    expect(kinds.size).toBeGreaterThan(1);
  });

  it('goes back to sound-only for a letter he has gone shaky on', () => {
    // seen plenty of times, but recall has collapsed
    let p = withActive([...STARTER_SET]);
    for (const l of STARTER_SET) {
      for (let i = 0; i < 6; i++) p = recordAnswer(p, l, true);
      for (let i = 0; i < 3; i++) p = recordAnswer(p, l, false);
    }
    for (let i = 0; i < 200; i++) expect(nextRound(p, 1, []).kind).toBe('sound');
  });

  it('mixes in word and name rounds once he knows the letter', () => {
    const p = master(withActive([...STARTER_SET]), STARTER_SET);
    const kinds = new Set<string>();
    for (let i = 0; i < 400; i++) kinds.add(nextRound(p, 1, []).kind);
    expect([...kinds].sort()).toEqual(['name', 'sound', 'word']);
  });

  it('keeps the sound round the backbone of the meal', () => {
    const p = master(withActive([...STARTER_SET]), STARTER_SET);
    let sound = 0;
    for (let i = 0; i < 600; i++) if (nextRound(p, 1, []).kind === 'sound') sound++;
    expect(sound / 600).toBeGreaterThan(0.5);
  });
});

describe('review of letters he has not seen for a while', () => {
  it('brings a known letter back more often after many meals away', () => {
    let p = blankProfile();
    p = { ...p, activeSet: ['S', 'M', 'T'] };
    for (const l of p.activeSet) for (let i = 0; i < WINDOW; i++) p = recordAnswer(p, l, true);
    // S was last seen at meal 0; M and T are seen again at meal 12
    p = { ...p, mealsCompleted: 12 };
    for (const l of ['M', 'T'] as const) p = recordAnswer(p, l, true);

    let s = 0;
    const n = 3000;
    for (let i = 0; i < n; i++) if (pickTarget(p, []) === 'S') s++;
    // equal weights would give a third; stale S weighs 4 against 1 and 1
    expect(s / n).toBeGreaterThan(0.55);
  });
});

describe('a letter he has not met', () => {
  it('is shown alone before it is ever asked', () => {
    const p = { ...blankProfile(), met: [] };
    for (let i = 0; i < 50; i++) {
      const r = nextRound(p, 3, []);
      expect(r.kind).toBe('meet');
      expect(r.options).toEqual([r.target]);
    }
  });

  it('counts as met once he has answered it, for profiles from before this', () => {
    let p: Profile = { ...blankProfile(), met: undefined, activeSet: ['S', 'M'] };
    p = recordAnswer(recordAnswer(p, 'S', true), 'M', false);
    for (let i = 0; i < 50; i++) expect(nextRound(p, 1, []).kind).not.toBe('meet');
  });
});

describe('a letter he knows', () => {
  it('is asked by its sound alone, without the name in front', () => {
    let p: Profile = { ...blankProfile(), activeSet: ['S', 'M'] };
    for (const l of p.activeSet) for (let i = 0; i < WINDOW; i++) p = recordAnswer(p, l, true);
    const sounds = Array.from({ length: 200 }, () => nextRound(p, 1, [])).filter((r) => r.kind === 'sound');
    expect(sounds.length).toBeGreaterThan(0);
    for (const r of sounds) expect(r.bare).toBe(true);
  });

  it('keeps the name in front while he is still learning it', () => {
    let p: Profile = { ...blankProfile(), activeSet: ['S', 'M'] };
    for (const l of p.activeSet) p = recordAnswer(p, l, true);
    for (let i = 0; i < 50; i++) expect(nextRound(p, 1, []).bare).toBe(false);
  });
});
