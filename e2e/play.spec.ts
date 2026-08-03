import { expect, test } from '@playwright/test';
import {
  VIEWPORTS,
  blockedPoints,
  clearClips,
  currentTarget,
  feed,
  optionLetters,
  playedClips,
  recordClips,
  startMeal,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await recordClips(page);
});

/* The bug this file exists for: the sushi row is a full-width box far taller
   than the sushi drawn inside it, and it used to sit on top of the replay
   button. Nothing looked wrong — the button was fully visible — but the lower
   40% of it silently swallowed every press. Only a real layout can catch that,
   so it is checked here rather than in jsdom. */
test.describe('everything you can press, you can press', () => {
  for (const vp of VIEWPORTS) {
    test(`on a ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await startMeal(page);

      const replay = await blockedPoints(page, 'button[aria-label="say it again"]', true);
      expect(replay.sampled).toBeGreaterThan(50);
      expect(replay.blocked, `replay button covered at ${JSON.stringify(replay.blocked[0])}`)
        .toEqual([]);

      for (const letter of await optionLetters(page)) {
        const piece = await blockedPoints(page, `button[aria-label="letter ${letter}"]`);
        // the replay button may sit over a corner; the piece must stay mostly free
        const free = 1 - piece.blocked.length / piece.sampled;
        expect(free, `letter ${letter} only ${Math.round(free * 100)}% reachable`)
          .toBeGreaterThan(0.9);
      }
    });
  }
});

test.describe('the layout holds', () => {
  for (const vp of VIEWPORTS) {
    test(`nothing spills off a ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await startMeal(page);

      const overflow = await page.evaluate(() => ({
        horizontal: document.documentElement.scrollWidth - window.innerWidth,
        vertical: document.documentElement.scrollHeight - window.innerHeight,
      }));
      expect(overflow.horizontal).toBeLessThanOrEqual(0);
      expect(overflow.vertical).toBeLessThanOrEqual(0);

      for (const sel of ['button[aria-label="say it again"]', '.sushi-btn']) {
        const box = (await page.locator(sel).first().boundingBox())!;
        expect(box.y, sel).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height, sel).toBeLessThanOrEqual(vp.height + 1);
      }
    });
  }
});

test.describe('a round', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
  });

  test('opens with the letter name and then its sound', async ({ page }) => {
    await startMeal(page);
    const played = await playedClips(page);
    const target = await currentTarget(page);
    // the cat greets him as the meal opens; the prompt is the rest of it
    expect(played.filter((c) => !c.startsWith('cat/'))).toEqual([
      `letter/${target}`,
      `prompt/${target}`,
    ]);
    expect(await optionLetters(page)).toContain(target);
  });

  test('says it again when the button is pressed', async ({ page }) => {
    await startMeal(page);
    const target = await currentTarget(page);
    await clearClips(page);

    await page.getByLabel('say it again').click();
    await page.waitForTimeout(1500);

    expect(await playedClips(page)).toEqual([`letter/${target}`, `prompt/${target}`]);
  });

  test('says it again when the very bottom of the button is pressed', async ({ page }) => {
    // where the sushi row used to swallow the press
    await startMeal(page);
    const target = await currentTarget(page);
    const box = (await page.getByLabel('say it again').boundingBox())!;
    await clearClips(page);

    await page.mouse.click(box.x + box.width / 2, box.y + box.height - 3);
    await page.waitForTimeout(1500);

    expect(await playedClips(page)).toEqual([`letter/${target}`, `prompt/${target}`]);
  });

  test('feeds the cat when the right piece is carried over', async ({ page }) => {
    await startMeal(page);
    const target = await currentTarget(page);
    await clearClips(page);

    await feed(page, target);

    await expect
      .poll(() => playedClips(page), { timeout: 12_000 })
      .toEqual(expect.arrayContaining(['cat/nom']));
    // the letter is not read back to him — the cat eating it is the answer
    expect(await playedClips(page)).not.toContain(`confirm/${target}`);
    await expect(page.locator('[aria-label="1 of 8 eaten"]')).toBeVisible();
  });

  test('asks again, without eating, when the wrong piece is carried over', async ({ page }) => {
    await startMeal(page);
    const target = await currentTarget(page);
    const wrong = (await optionLetters(page)).find((l) => l !== target)!;
    await clearClips(page);

    await feed(page, wrong);

    // he smells it, names what he was given, turns it down, and asks again
    await expect
      .poll(async () => (await playedClips(page)).slice(-2), { timeout: 12_000 })
      .toEqual([`letter/${target}`, `prompt/${target}`]);
    expect(await playedClips(page)).toContain(`letter/${wrong}`);
    expect(await playedClips(page)).not.toContain('cat/nom'); // he never swallowed it
    await expect(page.locator('[aria-label="0 of 8 eaten"]')).toBeVisible();
  });

  test('leaves the piece on the counter when it is dropped somewhere else', async ({ page }) => {
    await startMeal(page);
    const target = await currentTarget(page);
    const box = (await page.getByLabel(`letter ${target}`).boundingBox())!;
    await clearClips(page);

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(40, 40, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(1500);

    expect(await playedClips(page)).not.toContain('cat/nom');
    await expect(page.getByLabel(`letter ${target}`)).toBeVisible();
  });
});

test.describe('the recordings', () => {
  test('every clip the first round asks for is actually served', async ({ page }) => {
    const failed: string[] = [];
    page.on('response', (r) => {
      if (r.url().includes('/audio/') && !r.ok()) failed.push(`${r.status()} ${r.url()}`);
    });

    await page.setViewportSize({ width: 1024, height: 768 });
    await startMeal(page);
    await page.waitForTimeout(2500); // the idle preload sweeps the rest of the alphabet

    expect(failed).toEqual([]);
    expect((await playedClips(page)).length).toBeGreaterThan(0);
  });
});
