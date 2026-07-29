import type { Page } from '@playwright/test';

/** Screens this actually gets played on, plus the extremes either side. */
export const VIEWPORTS = [
  { name: 'iPad landscape', width: 1024, height: 768 },
  { name: 'iPad portrait', width: 768, height: 1024 },
  { name: 'iPad Pro landscape', width: 1366, height: 1024 },
  { name: 'laptop', width: 1280, height: 800 },
  { name: 'phone landscape', width: 844, height: 390 },
] as const;

/**
 * Records every voice clip that actually reaches the speakers, by name.
 *
 * Web Audio gives no way to ask a playing source what file it came from, so we
 * tag the ArrayBuffer as it comes off the network and follow the tag through
 * decodeAudioData onto the AudioBuffer.
 */
export async function recordClips(page: Page) {
  await page.addInitScript(() => {
    const names = new WeakMap<object, string>();
    (window as any).__played = [] as string[];

    const arrayBuffer = Response.prototype.arrayBuffer;
    Response.prototype.arrayBuffer = async function () {
      const buf = await arrayBuffer.call(this);
      if (this.url.includes('/audio/')) {
        names.set(buf, this.url.split('/audio/')[1].replace(/\.mp3.*$/, ''));
      }
      return buf;
    };

    const decode = AudioContext.prototype.decodeAudioData;
    AudioContext.prototype.decodeAudioData = async function (data: ArrayBuffer, ...rest: any[]) {
      const out = await (decode as any).call(this, data, ...rest);
      const name = names.get(data);
      if (name) names.set(out, name);
      return out;
    };

    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args: any[]) {
      const name = this.buffer && names.get(this.buffer);
      if (name) (window as any).__played.push(name);
      return (start as any).apply(this, args);
    };
  });
}

export const playedClips = (page: Page) => page.evaluate(() => (window as any).__played as string[]);
export const clearClips = (page: Page) => page.evaluate(() => ((window as any).__played.length = 0));

/** Start a meal and wait for the first prompt to finish. */
export async function startMeal(page: Page) {
  await page.goto('/');
  await page.getByLabel('play').click();
  await page.locator('.sushi-btn').first().waitFor({ state: 'visible' });
  // the cat's hello, the beat after it, then the prompt itself
  await page.waitForTimeout(3600);
}

/** Which letter the prompt just asked for. */
export async function currentTarget(page: Page) {
  const played = await playedClips(page);
  const last = [...played].reverse().find((c) => /^(prompt|name|letter)\//.test(c));
  if (!last) throw new Error(`no prompt played — heard: ${played.join(', ')}`);
  return last.split('/')[1];
}

export async function optionLetters(page: Page) {
  const labels = await page.locator('.sushi-btn').evaluateAll((els) =>
    els.map((e) => e.getAttribute('aria-label')!.replace('letter ', '')),
  );
  return labels;
}

/**
 * Every point of `selector` that some other element would intercept.
 *
 * `round` restricts the sweep to the inscribed circle, since the corners of a
 * `rounded-full` button are genuinely not part of it.
 */
export async function blockedPoints(page: Page, selector: string, round = false) {
  return page.evaluate(
    ({ selector, round }) => {
      const el = document.querySelector(selector);
      if (!el) throw new Error(`no element for ${selector}`);
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) throw new Error(`${selector} has no size`);

      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const radius = Math.min(r.width, r.height) / 2 - 2;
      const blocked: { x: number; y: number; by: string }[] = [];
      let sampled = 0;

      for (let y = r.top + 2; y < r.bottom - 1; y += 3) {
        for (let x = r.left + 2; x < r.right - 1; x += 3) {
          if (round && Math.hypot(x - cx, y - cy) > radius) continue;
          sampled++;
          const hit = document.elementFromPoint(x, y);
          if (hit && (hit === el || el.contains(hit))) continue;
          const by = hit
            ? (hit.closest('button')?.getAttribute('aria-label') ??
              `${hit.tagName.toLowerCase()}.${hit.className?.toString().slice(0, 40)}`)
            : 'nothing';
          blocked.push({ x: Math.round(x), y: Math.round(y), by });
        }
      }
      return { sampled, blocked };
    },
    { selector, round },
  );
}

/** Carry a piece onto the cat, the way a finger would. */
export async function feed(page: Page, letter: string) {
  const piece = page.getByLabel(`letter ${letter}`);
  const from = (await piece.boundingBox())!;
  const cat = (await page.locator('svg').first().boundingBox())!;
  const target = (await page.locator('[aria-label$="eaten"]').boundingBox()) ?? cat;

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  // a few steps, so the drag reads as a carry rather than a teleport
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(
      from.x + from.width / 2 + ((target.x + target.width / 2 - from.x - from.width / 2) * i) / 6,
      from.y + from.height / 2 + ((target.y - 30 - from.y - from.height / 2) * i) / 6,
    );
  }
  await page.mouse.up();
}
