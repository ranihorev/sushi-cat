import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blankProfile } from '../game/store';
import { surprises } from '../game/surprises';
import { Title } from './Title';

const tick = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

let started: string | null = null;
const show = () =>
  render(
    <Title
      profile={blankProfile()}
      onStart={(m) => {
        started = m;
      }}
      onParent={() => {}}
      onProfileChange={() => {}}
    />,
  );

beforeEach(() => {
  vi.useFakeTimers();
  started = null;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('a guest at a door', () => {
  it('pops up in a window a moment after he arrives, and goes again', async () => {
    surprises.reset();
    surprises.forceDoor('octopus');
    show();
    expect(document.querySelector('[data-guest]')).toBeNull();
    await tick(1500);
    expect(document.querySelector('[data-guest="octopus"]')).not.toBeNull();
    await tick(6000);
    expect(document.querySelector('[data-guest]')).toBeNull();
  });

  it('does a trick when tapped, without opening the door', async () => {
    surprises.reset();
    surprises.forceDoor('fish');
    show();
    await tick(1500);
    fireEvent.pointerDown(document.querySelector('[data-guest="fish"]')!);
    expect(started).toBeNull();
  });

  it('never comes while the jokes are off', async () => {
    show();
    await tick(8000);
    expect(document.querySelector('[data-guest]')).toBeNull();
  });
});

describe('poking the cat on the street', () => {
  it('a quick tap makes him do something silly', async () => {
    surprises.reset();
    show();
    const cat = document.querySelector('[data-testid="pettable-cat"]')!;
    fireEvent.pointerDown(cat);
    fireEvent.pointerUp(cat);
    expect(document.querySelector('svg[data-gag]')).not.toBeNull();
  });
});
