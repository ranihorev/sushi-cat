import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Letter } from '../game/letters';
import { STARTER_SET } from '../game/letters';
import { WINDOW, blankProfile, recordAnswer } from '../game/store';
import type { Profile } from '../game/types';
import { playLog } from '../test/audio-stub';
import { Rolls, wordsPerMeal } from './Rolls';

let mealResult: Letter[] | null = null;
let profileSeen: Profile;

function Harness({ initial }: { initial: Profile }) {
  const [profile, setProfile] = useState(initial);
  profileSeen = profile;
  return (
    <Rolls
      profile={profile}
      onProfileChange={(fn) => setProfile((p) => fn(p))}
      onMealComplete={(eaten) => {
        mealResult = eaten;
      }}
      onExit={() => {}}
    />
  );
}

const tick = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

/** a child who knows the six starter letters, so the shop has cat, map, cap and tap */
const knows = (overrides: Partial<Profile> = {}): Profile => {
  let p = blankProfile();
  for (const l of STARTER_SET) for (let i = 0; i < WINDOW; i++) p = recordAnswer(p, l, true);
  return { ...p, ...overrides };
};

const start = async (overrides: Partial<Profile> = {}) => {
  render(<Harness initial={knows(overrides)} />);
  await tick(4000); // hello, "let's make a word", the word, then the first sound
};

const root = () => document.querySelector('[data-phase]')!;
const word = () => root().getAttribute('data-word')!.toUpperCase();
const phase = () => root().getAttribute('data-phase');
const places = () =>
  screen.getAllByLabelText(/^place \d/).map((el) => el.getAttribute('aria-label')!.split(': ')[1]);
const onCounter = () =>
  screen.queryAllByLabelText(/^letter /).map((el) => el.getAttribute('aria-label')!.replace('letter ', ''));

const tap = (letter: string) => {
  fireEvent.pointerDown(screen.getByLabelText(`letter ${letter}`), { pointerId: 1, clientX: 5, clientY: 5 });
  fireEvent.pointerUp(window, { pointerId: 1, clientX: 5, clientY: 5 });
};

/** place every missing piece of the word on screen, in order */
const buildWord = async () => {
  const w = word();
  for (let i = 0; i < 3; i++) {
    if (places()[i] !== 'empty') continue;
    tap(w[i]);
    await tick(1500);
  }
  return w;
};

beforeEach(() => {
  vi.useFakeTimers();
  mealResult = null;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('a word in the roll shop', () => {
  it('says the word, then asks for the first sound', async () => {
    await start();
    expect(phase()).toBe('build');
    const voice = playLog.filter((c) => /^(word|roll|prompt)\//.test(c));
    expect(voice[0]).toMatch(/^(word|roll)\//);
    expect(voice[voice.length - 1]).toBe(`prompt/${word()[0]}`);
  });

  it('starts him off with only the first sound to add', async () => {
    await start();
    expect(places()).toEqual(['empty', word()[1], word()[2]]);
    expect(onCounter()).toHaveLength(2);
    expect(onCounter()).toContain(word()[0]);
  });

  it('gives him all three places once he is good at it', async () => {
    await start({ wordLevel: 2 });
    expect(places()).toEqual(['empty', 'empty', 'empty']);
    expect([...onCounter()].sort()).toEqual([...word()].sort());
  });

  it('adds a piece that does not belong at the top level', async () => {
    await start({ wordLevel: 3 });
    expect(onCounter()).toHaveLength(4);
  });

  it('puts the right piece in its place and asks for the next sound', async () => {
    await start({ wordLevel: 2 });
    const w = word();
    tap(w[0]);
    await tick(1500);
    expect(places()).toEqual([w[0], 'empty', 'empty']);
    expect(onCounter()).not.toContain(w[0]);
    expect(playLog[playLog.length - 1]).toBe(`prompt/${w[1]}`);
  });

  it('turns a wrong piece away without placing it, and says what it was', async () => {
    await start({ wordLevel: 2 });
    const w = word();
    playLog.length = 0;
    tap(w[2]);
    await tick(3500);
    expect(places()).toEqual(['empty', 'empty', 'empty']);
    expect(onCounter()).toContain(w[2]);
    expect(playLog).toContain(`letter/${w[2]}`);
    // and the sound he was asked for comes back afterwards
    expect(playLog[playLog.length - 1]).toBe(`prompt/${w[0]}`);
    expect(profileSeen.confusions[w[0] as Letter]?.[w[2] as Letter]).toBe(1);
  });

  it('lights up the right piece after two misses', async () => {
    await start({ wordLevel: 2 });
    const w = word();
    for (let i = 0; i < 2; i++) {
      tap(w[2]);
      await tick(3500);
    }
    expect(screen.getByLabelText(`letter ${w[0]}`).className).toContain('sushi-hint');
  });

  it('sounds the word out in order, then says it whole, then the cat eats it', async () => {
    await start({ wordLevel: 2 });
    playLog.length = 0;
    const w = await buildWord();
    await tick(6000);
    const voice = playLog.filter((c) => /^(word|roll|prompt)\//.test(c) || c === 'cat/nom');
    const blend = [`prompt/${w[0]}`, `prompt/${w[1]}`, `prompt/${w[2]}`];
    const at = voice.lastIndexOf(blend[0]);
    expect(voice.slice(at, at + 3)).toEqual(blend);
    expect(voice[at + 3]).toMatch(/^(word|roll)\//);
    expect(voice[at + 4]).toBe('cat/nom');
    expect(screen.getByLabelText(/1 of \d words/)).toBeTruthy();
  });

  it('moves on to a different word', async () => {
    await start();
    const first = await buildWord();
    await tick(9000);
    expect(phase()).toBe('build');
    expect(word()).not.toBe(first);
  });

  it('gives him more to build after two clean words', async () => {
    await start();
    for (let i = 0; i < 2; i++) {
      await buildWord();
      await tick(9000);
    }
    expect(profileSeen.wordLevel).toBe(2);
    expect(places()).toEqual(['empty', 'empty', 'empty']);
  });

  it('ends the meal after the last word, with the letters he used', async () => {
    const p = knows();
    await start({ settings: { ...p.settings, roundsPerMeal: 4 } });
    const total = wordsPerMeal(4);
    let used = '';
    for (let i = 0; i < total; i++) {
      used += await buildWord();
      await tick(9000);
    }
    expect(mealResult?.join('')).toBe(used);
  });

  it('does not take a piece while the word is still being said', async () => {
    render(<Harness initial={knows({ wordLevel: 2 })} />);
    await tick(600);
    expect(phase()).toBe('intro');
    tap(onCounter()[0]);
    await tick(100);
    expect(places()).toEqual(['empty', 'empty', 'empty']);
  });
});
