import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CAT_CLIPS, UI_CLIPS, clipPath, clipsForLetter, promptClips } from './audio';
import { ALL_LETTERS } from './letters';
import type { Round } from './types';

/* The game is offline-first: a clip that was never generated is a round the
   child hears nothing for. Cheap to check, and impossible to notice by eye
   across 118 files. */

const AUDIO_DIR = join(process.cwd(), 'public', 'audio');
const fileFor = (clip: string) => join(AUDIO_DIR, `${clip}.mp3`);

const everyClip = () => {
  const clips = new Set<string>([...UI_CLIPS, ...CAT_CLIPS]);
  for (const l of ALL_LETTERS) {
    for (const c of clipsForLetter(l)) clips.add(c);
    for (const kind of ['sound', 'word', 'name'] as const) {
      const r: Round = { kind, target: l, options: [l] };
      for (const c of promptClips(r)) if (typeof c === 'string') clips.add(c);
    }
  }
  return [...clips].sort();
};

describe('recorded clips', () => {
  it('has a file for every clip the game can ask for', () => {
    const missing = everyClip().filter((c) => !existsSync(fileFor(c)));
    expect(missing).toEqual([]);
  });

  it('covers all 26 letters, not just the ones unlocked so far', () => {
    const clips = everyClip();
    for (const l of ALL_LETTERS) {
      for (const dir of ['prompt', 'confirm', 'word', 'name', 'letter']) {
        expect(clips, `${dir}/${l}`).toContain(`${dir}/${l}`);
      }
    }
  });

  it('has no empty or truncated recordings', () => {
    const tiny = everyClip()
      .filter((c) => existsSync(fileFor(c)))
      .filter((c) => statSync(fileFor(c)).size < 1024)
      .map((c) => `${c} (${statSync(fileFor(c)).size}b)`);
    expect(tiny).toEqual([]);
  });

  it('serves clips from a path the service worker will have cached', () => {
    // the workbox glob only picks up files under the build output root
    for (const c of everyClip()) expect(clipPath(c)).toMatch(/^\/audio\/.+\.mp3$/);
  });
});
