import { afterEach, beforeEach } from 'vitest';
import { installAudioStub, resetAudioStub } from './audio-stub';

installAudioStub();

/* This jsdom build hands back a bare object for localStorage rather than a
   Storage, so the profile would silently fail to persist. Give it a real one. */
if (typeof localStorage?.clear !== 'function') {
  class MemoryStorage implements Storage {
    private map = new Map<string, string>();
    get length() {
      return this.map.size;
    }
    key(i: number) {
      return [...this.map.keys()][i] ?? null;
    }
    getItem(k: string) {
      return this.map.get(k) ?? null;
    }
    setItem(k: string, v: string) {
      this.map.set(k, String(v));
    }
    removeItem(k: string) {
      this.map.delete(k);
    }
    clear() {
      this.map.clear();
    }
    [key: string]: unknown;
  }
  const store = new MemoryStorage();
  Object.defineProperty(window, 'localStorage', { value: store, configurable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: store, configurable: true });
}

// jsdom has neither, and the game asks for both on the play screen
if (!window.matchMedia) {
  (window as any).matchMedia = (query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  });
}
if (!('requestIdleCallback' in window)) {
  (window as any).requestIdleCallback = (fn: () => void) => setTimeout(fn, 0);
}

beforeEach(() => {
  resetAudioStub();
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});
