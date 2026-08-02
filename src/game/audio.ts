import type { Letter } from './letters';
import { LETTERS } from './letters';
import type { Round } from './types';

/* One AudioContext, decoded buffers, everything local so it works offline.
   If a voice clip is missing (before `npm run audio` has been run) we fall back
   to SpeechSynthesis so the game is still playable — but the real clips are
   what make this teach. */

type Clip = string;

export const clipPath = (c: Clip) => `${import.meta.env.BASE_URL}audio/${c}.mp3`;

const PRAISE_COUNT = 6;

/** Stops are momentary by nature; they get a longer pause instead of a longer sound. */
const STOP_LETTERS = new Set<Letter>(['B', 'C', 'D', 'G', 'J', 'K', 'P', 'Q', 'T', 'X']);

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<Clip, AudioBuffer | null>();
  private inflight = new Map<Clip, Promise<AudioBuffer | null>>();
  private playing = new Set<AudioBufferSourceNode>();
  private voiceSeq = 0;

  /** true once at least one voice clip has decoded — i.e. real audio exists */
  hasVoice = false;

  private ac(): AudioContext | null {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as any).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  /** Must be called from a user gesture (iOS). */
  unlock() {
    const c = this.ac();
    if (c && c.state === 'suspended') void c.resume();
  }

  async load(clip: Clip): Promise<AudioBuffer | null> {
    if (this.buffers.has(clip)) return this.buffers.get(clip)!;
    if (this.inflight.has(clip)) return this.inflight.get(clip)!;

    const p = (async () => {
      const c = this.ac();
      if (!c) return null;
      try {
        const res = await fetch(clipPath(clip));
        if (!res.ok) throw new Error(String(res.status));
        const buf = await c.decodeAudioData(await res.arrayBuffer());
        this.hasVoice = true;
        return buf;
      } catch {
        return null;
      }
    })().then((buf) => {
      this.buffers.set(clip, buf);
      this.inflight.delete(clip);
      return buf;
    });

    this.inflight.set(clip, p);
    return p;
  }

  async preload(clips: Clip[]) {
    await Promise.all(clips.map((c) => this.load(c)));
  }

  /** Fire-and-forget preload that won't block the first round. */
  preloadIdle(clips: Clip[]) {
    const run = () => {
      let i = 0;
      const step = () => {
        if (i >= clips.length) return;
        void this.load(clips[i++]).then(() => setTimeout(step, 30));
      };
      step();
    };
    if ('requestIdleCallback' in window) (window as any).requestIdleCallback(run);
    else setTimeout(run, 800);
  }

  stopVoice() {
    this.voiceSeq++;
    for (const s of this.playing) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    this.playing.clear();
    window.speechSynthesis?.cancel();
  }

  /** Plays a clip and resolves when it finishes (or immediately if missing). */
  private playBuffer(buf: AudioBuffer, gain = 1): Promise<void> {
    const c = this.ac();
    if (!c) return Promise.resolve();
    return new Promise((resolve) => {
      const src = c.createBufferSource();
      const g = c.createGain();
      g.gain.value = gain;
      src.buffer = buf;
      src.connect(g).connect(this.master!);
      src.onended = () => {
        this.playing.delete(src);
        resolve();
      };
      this.playing.add(src);
      src.start();
    });
  }

  /**
   * Play a clip over whatever else is going on, without cancelling it. The
   * cat's reactions layer on top of speech rather than interrupting it.
   */
  async oneShot(clip: Clip, gain = 1) {
    this.unlock();
    const buf = await this.load(clip);
    if (buf) await this.playBuffer(buf, gain);
  }

  /** Speak a sequence of voice clips with gaps. Later calls cancel earlier ones. */
  async speak(items: Array<Clip | number>, fallback?: () => void): Promise<void> {
    this.unlock();
    this.stopVoice();
    const seq = this.voiceSeq;
    let spokeSomething = false;

    for (const item of items) {
      if (seq !== this.voiceSeq) return;
      if (typeof item === 'number') {
        await wait(item);
        continue;
      }
      const buf = await this.load(item);
      if (seq !== this.voiceSeq) return;
      if (buf) {
        spokeSomething = true;
        await this.playBuffer(buf);
      }
    }
    if (!spokeSomething && fallback && seq === this.voiceSeq) fallback();
  }

  /* ---------------- synthesized SFX (tiny, offline, zero assets) ------------- */

  private blip(freq: number, dur = 0.12, type: OscillatorType = 'sine', vol = 0.18, at = 0) {
    const c = this.ac();
    if (!c || !this.master) return;
    if (c.state === 'suspended') void c.resume();
    const t = c.currentTime + at;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, at = 0, freq = 900, q = 1) {
    const c = this.ac();
    if (!c || !this.master) return;
    const t = c.currentTime + at;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const filt = c.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = freq;
    filt.Q.value = q;
    const g = c.createGain();
    g.gain.value = vol;
    src.connect(filt).connect(g).connect(this.master);
    src.start(t);
  }

  tap() {
    this.blip(660, 0.06, 'triangle', 0.09);
  }

  whoosh() {
    this.noise(0.28, 0.1, 0, 1600, 0.7);
  }

  chomp() {
    this.noise(0.09, 0.22, 0, 420, 1.4);
    this.blip(150, 0.08, 'square', 0.1, 0.02);
    this.noise(0.07, 0.16, 0.13, 380, 1.4);
    this.blip(120, 0.07, 'square', 0.08, 0.15);
  }

  happy() {
    [659, 784, 988].forEach((f, i) => this.blip(f, 0.16, 'sine', 0.11, i * 0.075));
  }

  /** two short breaths through the nose, over the piece he has been handed */
  sniff() {
    this.noise(0.05, 0.09, 0, 2400, 2);
    this.noise(0.05, 0.08, 0.12, 2700, 2);
  }

  /** the flat, buzzy "blegh" of a cat who has been given the wrong fish */
  yuck() {
    this.blip(233, 0.16, 'sawtooth', 0.055);
    this.blip(175, 0.26, 'sawtooth', 0.045, 0.14);
    this.noise(0.2, 0.045, 0.16, 500, 0.9);
  }

  fanfare() {
    [523, 659, 784, 1047].forEach((f, i) => this.blip(f, 0.34, 'triangle', 0.12, i * 0.12));
    [1319, 1568].forEach((f, i) => this.blip(f, 0.5, 'sine', 0.07, 0.5 + i * 0.1));
  }

  sparkle() {
    for (let i = 0; i < 5; i++) this.blip(1200 + i * 420, 0.11, 'sine', 0.05, i * 0.05);
  }

  purr() {
    this.noise(0.5, 0.05, 0, 180, 3);
  }
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const audio = new AudioEngine();

/* ------------------------------- vocabulary ------------------------------- */

/** A prompt is a small script: clip names interleaved with pauses in ms. */
export const promptClips = (round: Round): Array<Clip | number> => {
  const L = round.target;
  /* Word and letter-name rounds carry their own context, so the sound lands
     once. A bare phoneme does not — /t/ is about a tenth of a second and is
     gone before he has looked up — so those get said twice with a beat
     between, which is the whole prompt rather than a repeat of it. */
  if (round.kind === 'word') return [`word/${L}`, 280, `prompt/${L}`];
  if (round.kind === 'name') return [`name/${L}`];
  /* The letter's name, then its sound: "M ... /mmm/". The name is the easy
     part to catch and primes him for the sound, which for a stop is barely a
     tenth of a second. Stops get a longer beat before the sound lands. */
  return [`letter/${L}`, STOP_LETTERS.has(L) ? 460 : 340, `prompt/${L}`];
};

/**
 * What the cat says about the piece he was actually handed. It is built to the
 * same shape as the prompt — "B ... /b/" — so that the wrong answer and the
 * question sit side by side and can be told apart. A wrong piece that vanishes
 * in silence teaches nothing; naming it is the whole point of the mistake.
 *
 * A letter-name round is about names alone, so the phoneme is only noise there.
 */
export const identifyClips = (round: Round, given: Letter): Array<Clip | number> =>
  round.kind === 'name'
    ? [`letter/${given}`]
    : [`letter/${given}`, STOP_LETTERS.has(given) ? 460 : 340, `prompt/${given}`];

export const confirmClip = (l: Letter): Clip => `confirm/${l}`;

export const randomPraise = (): Clip => `praise/${1 + Math.floor(Math.random() * PRAISE_COUNT)}`;

export const clipsForLetter = (l: Letter): Clip[] => [
  `prompt/${l}`,
  `confirm/${l}`,
  `word/${l}`,
  `name/${l}`,
  `letter/${l}`,
];

/* The cat's own voice. It carries the feedback he actually reads — a delighted
   meow or a puzzled mrrp lands long before any of the words do. */
const CAT_VARIANTS = {
  happy: ['cat/meow-happy-1', 'cat/meow-happy-2'],
  excited: ['cat/trill-1', 'cat/trill-2'],
  curious: ['cat/curious-1', 'cat/curious-2'],
} as const;

const pickOne = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

export const catSound = (kind: keyof typeof CAT_VARIANTS): Clip => pickOne(CAT_VARIANTS[kind]);

export const CAT_CLIPS: Clip[] = [
  ...CAT_VARIANTS.happy,
  ...CAT_VARIANTS.excited,
  ...CAT_VARIANTS.curious,
  'cat/purr',
  'cat/nom',
  'cat/yawn',
  'cat/greet',
];

export const UI_CLIPS: Clip[] = [
  'ui/lets-eat',
  'ui/all-done',
  'ui/try-again',
  'ui/this-one',
  ...Array.from({ length: PRAISE_COUNT }, (_, i) => `praise/${i + 1}`),
];

/* SpeechSynthesis fallback — only used until the real clips exist. */
export function sayFallback(text: string, rate = 0.8) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = rate;
  u.pitch = 1.15;
  window.speechSynthesis.speak(u);
}

export const fallbackIdentify = (round: Round, given: Letter) => () => {
  if (round.kind === 'name') return sayFallback(`${given}?`, 0.85);
  return sayFallback(`${given}. ${LETTERS[given].sound.replaceAll('/', '')}?`, 0.85);
};

export const fallbackPrompt = (round: Round) => {
  const info = LETTERS[round.target];
  if (round.kind === 'word') return () => sayFallback(`${info.word}. ${info.word} starts with`);
  if (round.kind === 'name') return () => sayFallback(`Where is ${round.target}?`);
  return () => sayFallback(`${round.target}. ${info.sound.replaceAll('/', '')}`);
};
