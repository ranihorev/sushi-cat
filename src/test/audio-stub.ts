/**
 * A fake Web Audio stack.
 *
 * jsdom has no AudioContext, so without this every test of the game would have
 * to mock `audio` wholesale and would then be testing the mock. Instead we fake
 * the browser and let the real AudioEngine run: clips are fetched, decoded,
 * queued and cancelled exactly as they are in the app, and `playLog` records
 * what actually reached the speakers, in order.
 *
 * The trick that makes that possible: the fetch stub answers with the clip's
 * own name as bytes, and decodeAudioData decodes it back, so every AudioBuffer
 * knows which clip it is.
 */

/** clips that have started playing, oldest first */
export const playLog: string[] = [];
/** clips that were cut off before they finished */
export const cutLog: string[] = [];
/** text handed to the SpeechSynthesis fallback */
export const spokenFallbacks: string[] = [];
/** clips the fetch stub should 404 on */
export const missingClips = new Set<string>();

/** how long a fake clip lasts, in ms */
export const CLIP_MS = 100;

export function resetAudioStub() {
  playLog.length = 0;
  cutLog.length = 0;
  spokenFallbacks.length = 0;
  missingClips.clear();
}

/** `/audio/prompt/M.mp3` -> `prompt/M` */
const clipFromUrl = (url: string) => url.replace(/^.*\/audio\//, '').replace(/\.mp3$/, '');

class StubAudioBuffer {
  duration = CLIP_MS / 1000;
  numberOfChannels = 1;
  sampleRate = 44100;
  length = 4410;
  name: string;
  constructor(name: string) {
    this.name = name;
  }
  getChannelData() {
    return new Float32Array(this.length);
  }
}

class StubParam {
  value: number;
  constructor(value = 1) {
    this.value = value;
  }
  setValueAtTime(v: number) {
    this.value = v;
    return this;
  }
  exponentialRampToValueAtTime(v: number) {
    this.value = v;
    return this;
  }
  linearRampToValueAtTime(v: number) {
    this.value = v;
    return this;
  }
}

class StubNode {
  connect<T>(dest: T): T {
    return dest;
  }
  disconnect() {}
}

class StubGain extends StubNode {
  gain = new StubParam(1);
}

class StubFilter extends StubNode {
  type = 'bandpass';
  frequency = new StubParam(900);
  Q = new StubParam(1);
}

class StubOscillator extends StubNode {
  type = 'sine';
  frequency = new StubParam(440);
  start() {}
  stop() {}
}

class StubBufferSource extends StubNode {
  buffer: StubAudioBuffer | null = null;
  onended: (() => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private done = false;

  start() {
    if (this.buffer) playLog.push(this.buffer.name);
    this.timer = setTimeout(() => this.finish(), CLIP_MS);
  }

  stop() {
    if (this.done) return;
    if (this.buffer) cutLog.push(this.buffer.name);
    this.finish();
  }

  private finish() {
    if (this.done) return;
    this.done = true;
    if (this.timer) clearTimeout(this.timer);
    // the real thing fires onended off the audio thread, never synchronously
    queueMicrotask(() => this.onended?.());
  }
}

class StubAudioContext {
  state: AudioContextState = 'running';
  currentTime = 0;
  sampleRate = 44100;
  destination = new StubNode();

  createGain() {
    return new StubGain();
  }
  createBufferSource() {
    return new StubBufferSource();
  }
  createBiquadFilter() {
    return new StubFilter();
  }
  createOscillator() {
    return new StubOscillator();
  }
  createBuffer(_channels: number, length: number) {
    const b = new StubAudioBuffer('synth');
    b.length = length;
    return b;
  }
  decodeAudioData(data: ArrayBuffer) {
    return Promise.resolve(new StubAudioBuffer(new TextDecoder().decode(data)));
  }
  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
  suspend() {
    this.state = 'suspended';
    return Promise.resolve();
  }
  close() {
    return Promise.resolve();
  }
}

export function installAudioStub() {
  (globalThis as any).AudioContext = StubAudioContext;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    const clip = clipFromUrl(url);
    if (missingClips.has(clip)) {
      return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) } as Response;
    }
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => new TextEncoder().encode(clip).buffer,
    } as Response;
  }) as typeof fetch;

  (window as any).speechSynthesis = {
    cancel() {},
    speak(u: { text: string }) {
      spokenFallbacks.push(u.text);
    },
  };
  (window as any).SpeechSynthesisUtterance = class {
    rate = 1;
    pitch = 1;
    text: string;
    constructor(text: string) {
      this.text = text;
    }
  };
}
