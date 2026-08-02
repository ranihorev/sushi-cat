import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLIP_MS, cutLog, missingClips, playLog, spokenFallbacks } from '../test/audio-stub';
import {
  CAT_CLIPS,
  UI_CLIPS,
  audio,
  catSound,
  clipPath,
  clipsForLetter,
  confirmClip,
  fallbackPrompt,
  identifyClips,
  promptClips,
  randomPraise,
} from './audio';
import { ALL_LETTERS } from './letters';
import type { Round } from './types';

const round = (kind: Round['kind'], target: Round['target']): Round => ({
  kind,
  target,
  options: [target],
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  audio.stopVoice();
  vi.useRealTimers();
});

/** let every pending fetch/decode settle without moving the clock */
const settle = () => vi.advanceTimersByTimeAsync(0);

describe('what a prompt says', () => {
  it('opens a sound round with the letter name, then its sound', () => {
    expect(promptClips(round('sound', 'M'))).toEqual(['letter/M', expect.any(Number), 'prompt/M']);
  });

  it('gives a stop a longer beat than a held sound', () => {
    const [, held] = promptClips(round('sound', 'M')) as [string, number, string];
    const [, stop] = promptClips(round('sound', 'T')) as [string, number, string];
    // /t/ is gone in a tenth of a second, so it needs more of a run-up
    expect(stop).toBeGreaterThan(held);
  });

  it('leads a word round with the word, then the sound', () => {
    expect(promptClips(round('word', 'M'))).toEqual(['word/M', expect.any(Number), 'prompt/M']);
  });

  it('says a name round once — the question is already in the sentence', () => {
    expect(promptClips(round('name', 'M'))).toEqual(['name/M']);
  });

  it('confirms with the sound and the letter together', () => {
    expect(confirmClip('M')).toBe('confirm/M');
  });
});

/* The cat names the wrong piece before he refuses it. Said in the same shape as
   the question, the two land next to each other — "B ... /b/" against
   "M ... /mmm/" — and the difference between them is the lesson. */
describe('what the cat says about a wrong piece', () => {
  it('names it the same way the question names what it wants', () => {
    expect(identifyClips(round('sound', 'M'), 'B')).toEqual([
      'letter/B',
      expect.any(Number),
      'prompt/B',
    ]);
  });

  it('gives a stop the same longer beat the prompt gives it', () => {
    const [, held] = identifyClips(round('sound', 'M'), 'F') as [string, number, string];
    const [, stop] = identifyClips(round('sound', 'M'), 'B') as [string, number, string];
    expect(stop).toBeGreaterThan(held);
  });

  it('names a word round the same way — the piece is still a letter', () => {
    expect(identifyClips(round('word', 'M'), 'B')).toEqual([
      'letter/B',
      expect.any(Number),
      'prompt/B',
    ]);
  });

  /* A name round asks which letter is which by name. The phoneme has no part in
     that question, so putting it in the answer is a second thing to decode. */
  it('leaves the sound out of a name round', () => {
    expect(identifyClips(round('name', 'M'), 'B')).toEqual(['letter/B']);
  });

  it('only ever names the piece he gave, never the one that was asked for', () => {
    expect(identifyClips(round('sound', 'M'), 'B')).not.toContain('prompt/M');
  });

  it('knows every clip a letter can need, so it can all be cached up front', () => {
    for (const l of ALL_LETTERS) {
      const clips = clipsForLetter(l);
      for (const kind of ['sound', 'word', 'name'] as const) {
        const used = promptClips(round(kind, l)).filter((c) => typeof c === 'string');
        for (const c of used) expect(clips, `${l} ${kind}`).toContain(c);
      }
      expect(clips).toContain(confirmClip(l));
    }
  });

  it('draws praise from the clips that were actually generated', () => {
    for (let i = 0; i < 200; i++) expect(UI_CLIPS).toContain(randomPraise());
  });

  it('draws cat noises from the clips that were actually generated', () => {
    for (let i = 0; i < 200; i++) {
      for (const kind of ['happy', 'excited', 'curious'] as const) {
        expect(CAT_CLIPS).toContain(catSound(kind));
      }
    }
  });

  it('resolves a clip name to a file under audio/', () => {
    expect(clipPath('prompt/M')).toBe('/audio/prompt/M.mp3');
  });
});

describe('speaking', () => {
  it('plays the clips in order, waiting for each to finish', async () => {
    const done = audio.speak(['prompt/A', 'confirm/A']);
    await settle();
    expect(playLog).toEqual(['prompt/A']);

    await vi.advanceTimersByTimeAsync(CLIP_MS);
    expect(playLog).toEqual(['prompt/A', 'confirm/A']);

    await vi.advanceTimersByTimeAsync(CLIP_MS);
    await done;
    expect(cutLog).toEqual([]);
  });

  it('holds the gap between clips', async () => {
    const done = audio.speak(['letter/B', 300, 'prompt/B']);
    await vi.advanceTimersByTimeAsync(CLIP_MS);
    expect(playLog).toEqual(['letter/B']);

    await vi.advanceTimersByTimeAsync(299);
    expect(playLog).toEqual(['letter/B']);

    await vi.advanceTimersByTimeAsync(2);
    expect(playLog).toEqual(['letter/B', 'prompt/B']);

    await vi.advanceTimersByTimeAsync(CLIP_MS);
    await done;
  });

  it('cuts off whatever was talking when something new is said', async () => {
    void audio.speak(['prompt/C', 5000, 'prompt/D']);
    await settle();
    expect(playLog).toEqual(['prompt/C']);

    const done = audio.speak(['prompt/E']);
    await settle();
    expect(cutLog).toEqual(['prompt/C']);
    expect(playLog).toEqual(['prompt/C', 'prompt/E']);

    // the rest of the abandoned sequence must never arrive late
    await vi.advanceTimersByTimeAsync(10_000);
    await done;
    expect(playLog).not.toContain('prompt/D');
  });

  it('drops a sequence that is cancelled while its clip is still loading', async () => {
    const slow = audio.speak(['prompt/F']);
    const fast = audio.speak(['prompt/G']);
    await vi.advanceTimersByTimeAsync(CLIP_MS);
    await Promise.all([slow, fast]);
    expect(playLog).toEqual(['prompt/G']);
  });

  it('stops everything on the way out', async () => {
    void audio.speak(['prompt/H', 5000, 'prompt/I']);
    await settle();
    audio.stopVoice();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(playLog).toEqual(['prompt/H']);
    expect(cutLog).toEqual(['prompt/H']);
  });

  it('layers the cat over speech instead of interrupting it', async () => {
    const speech = audio.speak(['prompt/J', 400, 'confirm/J']);
    await settle();
    void audio.oneShot('cat/purr');
    await settle();

    expect(playLog).toEqual(['prompt/J', 'cat/purr']);
    expect(cutLog).toEqual([]);

    await vi.advanceTimersByTimeAsync(CLIP_MS + 400 + CLIP_MS);
    await speech;
    expect(playLog).toEqual(['prompt/J', 'cat/purr', 'confirm/J']);
  });

  it('skips a clip that is missing rather than stalling the sequence', async () => {
    missingClips.add('word/K');
    const done = audio.speak(['word/K', 'prompt/K']);
    await vi.advanceTimersByTimeAsync(CLIP_MS);
    await done;
    expect(playLog).toEqual(['prompt/K']);
  });

  it('falls back to the speech synthesiser only when nothing can be played', async () => {
    missingClips.add('letter/L');
    missingClips.add('prompt/L');
    const done = audio.speak(promptClips(round('sound', 'L')), fallbackPrompt(round('sound', 'L')));
    await vi.advanceTimersByTimeAsync(1000);
    await done;
    expect(playLog).toEqual([]);
    expect(spokenFallbacks).toEqual(['L. l']);
  });

  it('keeps quiet on the fallback when the real clips did play', async () => {
    const done = audio.speak(promptClips(round('sound', 'N')), fallbackPrompt(round('sound', 'N')));
    await vi.advanceTimersByTimeAsync(1000);
    await done;
    expect(spokenFallbacks).toEqual([]);
  });
});

describe('loading', () => {
  it('fetches each clip once and then plays it from memory', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    await audio.preload(['prompt/O', 'prompt/P']);
    expect(spy).toHaveBeenCalledTimes(2);

    const done = audio.speak(['prompt/O', 'prompt/P']);
    await vi.advanceTimersByTimeAsync(2 * CLIP_MS);
    await done;
    expect(spy).toHaveBeenCalledTimes(2);
    expect(playLog).toEqual(['prompt/O', 'prompt/P']);
  });

  it('does not fetch the same clip twice when asked for it at once', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    await Promise.all([audio.preload(['prompt/Q']), audio.preload(['prompt/Q'])]);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
