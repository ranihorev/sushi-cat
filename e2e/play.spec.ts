import { expect, test } from '@playwright/test';
import {
  KNOWS_STARTERS,
  VIEWPORTS,
  blockedPoints,
  clearClips,
  currentTarget,
  feed,
  optionLetters,
  playedClips,
  recordClips,
  seedProfile,
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

  /* These two assert the first two clips rather than the whole log. The game
     repeats the question on its own if he stalls for seven seconds, and on a
     loaded machine the setup for one of these tests can take long enough that
     the nudge lands inside the wait — which failed the test for a reason that
     had nothing to do with the button. The nudge has its own test. */
  test('says it again when the button is pressed', async ({ page }) => {
    await startMeal(page);
    const target = await currentTarget(page);
    await clearClips(page);

    await page.getByLabel('say it again').click();
    await page.waitForTimeout(1500);

    expect((await playedClips(page)).slice(0, 2)).toEqual([`letter/${target}`, `prompt/${target}`]);
  });

  test('says it again when the very bottom of the button is pressed', async ({ page }) => {
    // where the sushi row used to swallow the press
    await startMeal(page);
    const target = await currentTarget(page);
    const box = (await page.getByLabel('say it again').boundingBox())!;
    await clearClips(page);

    await page.mouse.click(box.x + box.width / 2, box.y + box.height - 3);
    await page.waitForTimeout(1500);

    expect((await playedClips(page)).slice(0, 2)).toEqual([`letter/${target}`, `prompt/${target}`]);
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

/* The sushi train: the same meal, with the pieces riding round the counter. */
test.describe('sushi train', () => {
  const centreX = async (page: import('@playwright/test').Page, letter: string) => {
    const b = await page.getByLabel(`letter ${letter}`).boundingBox();
    return b ? b.x + b.width / 2 : NaN;
  };

  test('the pieces ride along the counter', async ({ page }) => {
    await startMeal(page, 'play sushi train');
    const [first] = await optionLetters(page);
    const before = await centreX(page, first);
    await page.waitForTimeout(800);
    const after = await centreX(page, first);
    // either it slid right, or it went off the end and came round again
    expect(after).not.toBeCloseTo(before, 0);
  });

  /* The pieces used to be spread round the whole loop, so on a wide screen
     two of them sat more than half the counter apart and one was usually off
     the edge. They ride as a group now, a short gap between each. */
  for (const vp of [
    { width: 1366, height: 1024 },
    { width: 768, height: 1024 },
  ]) {
    test(`the pieces ride close together on a ${vp.width} wide screen`, async ({ page }) => {
      await page.setViewportSize(vp);
      await startMeal(page, 'play sushi train');
      const boxes = await page.locator('.sushi-btn').evaluateAll((els) =>
        els.map((e) => e.getBoundingClientRect()).map((r) => ({ x: r.left, w: r.width })),
      );
      boxes.sort((a, b) => a.x - b.x);
      for (let i = 1; i < boxes.length; i++) {
        const gap = boxes[i].x - (boxes[i - 1].x + boxes[i - 1].w);
        expect(gap).toBeGreaterThan(0);
        expect(gap).toBeLessThan(boxes[i].w * 0.6);
      }
    });
  }

  test('the belt stops while he is holding a piece', async ({ page }) => {
    await startMeal(page, 'play sushi train');
    const width = page.viewportSize()!.width;
    const letters = await optionLetters(page);
    let held = letters[0];
    await expect
      .poll(async () => {
        for (const l of letters) {
          const x = await centreX(page, l);
          if (x > 120 && x < width - 220) return (held = l);
        }
        return null;
      })
      .not.toBeNull();

    const other = letters.find((l) => l !== held)!;
    const b = (await page.getByLabel(`letter ${held}`).boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    const before = await centreX(page, other);
    await page.waitForTimeout(700);
    expect(await centreX(page, other)).toBeCloseTo(before, 0);
    await page.mouse.up();
  });

  test('feeds the cat when the right piece is caught and carried over', async ({ page }) => {
    await startMeal(page, 'play sushi train');
    const target = await currentTarget(page);
    const width = page.viewportSize()!.width;
    // wait for it to come round to where a hand can reach it
    await expect
      .poll(async () => {
        const x = await centreX(page, target);
        return x > 120 && x < width - 220;
      }, { timeout: 30_000 })
      .toBe(true);
    await clearClips(page);

    await feed(page, target);

    await expect
      .poll(() => playedClips(page), { timeout: 12_000 })
      .toEqual(expect.arrayContaining(['cat/nom']));
    await expect(page.locator('[aria-label="1 of 8 eaten"]')).toBeVisible();
  });
});

/* The kitty cafe: cats pop out of teacups holding letters, and he catches the
   one the question asks for. */
test.describe('kitty cafe', () => {
  const catsUp = (page: import('@playwright/test').Page) =>
    page
      .locator('.cafe-rise[aria-label^="cat "]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')!.replace('cat ', '')));

  test('a caught cat purrs and joins his friends', async ({ page }) => {
    await startMeal(page, 'play kitty cafe');
    const target = await currentTarget(page);
    // the right cat is the first one up, and it keeps coming back
    await expect.poll(() => catsUp(page), { timeout: 30_000 }).toContain(target);
    await clearClips(page);

    await page.getByLabel(`cat ${target}`, { exact: true }).dispatchEvent('pointerdown');

    await expect
      .poll(() => playedClips(page), { timeout: 12_000 })
      .toEqual(expect.arrayContaining(['cat/purr']));
    await expect(page.locator('[aria-label="1 of 8 friends"]')).toBeVisible({ timeout: 5000 });
  });

  test('a wrong cat says its own letter, and the question comes back', async ({ page }) => {
    test.setTimeout(90_000);
    await startMeal(page, 'play kitty cafe');
    const target = await currentTarget(page);
    let wrong = '';
    await expect
      .poll(
        async () => {
          wrong = (await catsUp(page)).find((l) => l !== target) ?? '';
          return wrong;
        },
        { timeout: 45_000 },
      )
      .not.toBe('');
    await clearClips(page);

    await page.getByLabel(`cat ${wrong}`, { exact: true }).dispatchEvent('pointerdown');

    await expect
      .poll(() => playedClips(page), { timeout: 12_000 })
      .toEqual(expect.arrayContaining([`letter/${wrong}`, `prompt/${target}`]));
    expect(await playedClips(page)).not.toContain('cat/purr');
    await expect(page.locator('[aria-label="0 of 8 friends"]')).toBeVisible();
  });

  test('no cat comes out while the question is still being asked', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('play kitty cafe', { exact: true }).click();
    // the first prompt clip has started, and the cups are still empty
    await expect
      .poll(async () => (await playedClips(page)).some((c) => c.startsWith('prompt/')), {
        timeout: 10_000,
      })
      .toBe(true);
    expect(await page.locator('.cafe-pop').count()).toBe(0);
    // and once it has been said, the cats come out
    await expect(page.locator('.cafe-pop').first()).toBeVisible({ timeout: 8000 });
  });

  test('the cats still come out when the sound never finishes', async ({ page }) => {
    // a suspended iPad: clips "start" but never end, so no question ever finishes
    await page.addInitScript(() => {
      AudioBufferSourceNode.prototype.start = function () {};
    });
    await page.goto('/');
    await page.getByLabel('play kitty cafe', { exact: true }).click();
    await expect(page.locator('.cafe-pop').first()).toBeVisible({ timeout: 12_000 });
  });

  test('the home button goes back to the title', async ({ page }) => {
    await startMeal(page, 'play kitty cafe');
    await page.getByLabel('home', { exact: true }).click();
    await expect(page.getByLabel('play kitty cafe', { exact: true })).toBeVisible();
  });
});

/** place the next missing piece of the word on the mat, by tapping it */
async function placeNext(page: import('@playwright/test').Page) {
  const state = await page.evaluate(() => {
    const el = document.querySelector('[data-phase]')!;
    const empty = [...el.querySelectorAll('[aria-label^="place"]')].findIndex((e) =>
      e.getAttribute('aria-label')!.endsWith('empty'),
    );
    return { word: el.getAttribute('data-word')!.toUpperCase(), empty };
  });
  await expect(page.getByLabel(`letter ${state.word[state.empty]}`)).toBeEnabled({ timeout: 15_000 });
  await page.getByLabel(`letter ${state.word[state.empty]}`).click();
  return state;
}

test.describe('the street', () => {
  test('keeps the roll shop shut until he knows enough letters', async ({ page }) => {
    await page.goto('/');
    const door = page.getByLabel('play roll words');
    await expect(door).toHaveAttribute('data-locked', 'true');
    await door.click();
    // still on the title screen: nothing started
    await expect(page.getByLabel('play', { exact: true })).toBeVisible();
    await expect(page.locator('[data-phase]')).toHaveCount(0);
  });

  test('opens the roll shop once the starter letters are solid', async ({ page }) => {
    await seedProfile(page, KNOWS_STARTERS);
    await page.goto('/');
    await expect(page.getByLabel('play roll words')).not.toHaveAttribute('data-locked', 'true');
  });

  for (const vp of VIEWPORTS) {
    test(`fits all four doors on a ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await seedProfile(page, { ...KNOWS_STARTERS, gifts: ['bow', 'yarn', 'crown'], wearing: { head: 'crown' } });
      await page.goto('/');
      // the doors pop in one after the other; measure them once they stand still
      await page.waitForTimeout(1500);
      for (const label of ['play', 'play sushi train', 'play kitty cafe', 'play roll words']) {
        const box = (await page.getByLabel(label, { exact: true }).boundingBox())!;
        expect(box.x, label).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width, label).toBeLessThanOrEqual(vp.width);
        expect(box.y, label).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height, label).toBeLessThanOrEqual(vp.height);
        const door = await blockedPoints(page, `button[aria-label="${label}"]`);
        expect(1 - door.blocked.length / door.sampled, `${label} reachable`).toBeGreaterThan(0.9);
      }
    });
  }

  test('a present on the shelf goes on the cat and comes off again', async ({ page }) => {
    await seedProfile(page, { ...KNOWS_STARTERS, gifts: ['bow'] });
    await page.goto('/');
    const bow = page.getByLabel('wear bow');
    await expect(bow).toHaveAttribute('aria-pressed', 'false');
    await bow.click();
    await expect(bow).toHaveAttribute('aria-pressed', 'true');
    await bow.click();
    await expect(bow).toHaveAttribute('aria-pressed', 'false');
  });
});

test.describe('meeting a letter', () => {
  test('a new child is shown one piece, with its letter and picture', async ({ page }) => {
    await startMeal(page, 'play', {});
    expect(await optionLetters(page)).toHaveLength(1);
    const [letter] = await optionLetters(page);
    await expect(page.locator(`[data-hint="${letter}"] img`)).toBeVisible();
    await expect
      .poll(async () => (await playedClips(page)).filter((c) => c.endsWith(`/${letter}`)), { timeout: 10_000 })
      .toEqual(expect.arrayContaining([`letter/${letter}`, `prompt/${letter}`, `word/${letter}`]));

    await feed(page, letter);
    await expect(page.getByLabel(/1 of 8 eaten/)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('roll shop', () => {
  for (const vp of VIEWPORTS) {
    test(`everything fits and can be pressed on a ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await startMeal(page, 'play roll words', { ...KNOWS_STARTERS, wordLevel: 3 });
      await expect(page.locator('[data-phase="build"]')).toBeVisible({ timeout: 15_000 });

      const overflow = await page.evaluate(() => ({
        horizontal: document.documentElement.scrollWidth - window.innerWidth,
        vertical: document.documentElement.scrollHeight - window.innerHeight,
      }));
      expect(overflow.horizontal).toBeLessThanOrEqual(0);
      expect(overflow.vertical).toBeLessThanOrEqual(0);

      for (const sel of ['[data-mat]', 'button[aria-label="hear the word"]', 'button[aria-label="say it again"]']) {
        const box = (await page.locator(sel).boundingBox())!;
        expect(box.y, sel).toBeGreaterThanOrEqual(0);
        expect(box.x, sel).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width, sel).toBeLessThanOrEqual(vp.width + 1);
        expect(box.y + box.height, sel).toBeLessThanOrEqual(vp.height + 1);
      }
      const replay = await blockedPoints(page, 'button[aria-label="say it again"]', true);
      expect(replay.blocked).toEqual([]);
      const letters = await optionLetters(page);
      expect(letters).toHaveLength(4);
      for (const letter of letters) {
        const piece = await blockedPoints(page, `button[aria-label="letter ${letter}"]`);
        expect(1 - piece.blocked.length / piece.sampled, `letter ${letter}`).toBeGreaterThan(0.9);
      }
    });
  }

  test('he builds a word, hears it sounded out, and the cat eats it', async ({ page }) => {
    await startMeal(page, 'play roll words', { ...KNOWS_STARTERS, wordLevel: 2 });
    await expect(page.locator('[data-phase="build"]')).toBeVisible({ timeout: 15_000 });
    const { word } = await placeNext(page);
    await expect(page.getByLabel(`place 1: ${word[0]}`)).toBeVisible();
    await clearClips(page);
    await placeNext(page);
    await placeNext(page);

    await expect(page.getByLabel(/1 of \d words/)).toBeVisible({ timeout: 20_000 });
    const played = (await playedClips(page)).filter((c) => /^prompt\//.test(c));
    // the last three sounds are the word, in order
    expect(played.slice(-3)).toEqual([...word].map((l) => `prompt/${l}`));
    expect(await playedClips(page)).toContain('cat/nom');
  });

  test('a piece carried up to the mat is placed, like a tap', async ({ page }) => {
    await startMeal(page, 'play roll words', { ...KNOWS_STARTERS, wordLevel: 2 });
    await expect(page.locator('[data-phase="build"]')).toBeVisible({ timeout: 15_000 });
    const word = (await page.locator('[data-word]').getAttribute('data-word'))!.toUpperCase();
    const piece = page.getByLabel(`letter ${word[0]}`);
    await expect(piece).toBeEnabled();
    const from = (await piece.boundingBox())!;
    const mat = (await page.locator('[data-mat]').boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 5; i++) {
      await page.mouse.move(
        from.x + from.width / 2 + ((mat.x + mat.width / 2 - from.x - from.width / 2) * i) / 5,
        from.y + from.height / 2 + ((mat.y + mat.height / 2 - from.y - from.height / 2) * i) / 5,
      );
    }
    await page.mouse.up();
    await expect(page.getByLabel(`place 1: ${word[0]}`)).toBeVisible();
  });
});

test.describe('presents', () => {
  test.setTimeout(120_000);
  test('after a meal he opens one of two boxes and the cat wears it', async ({ page }) => {
    await startMeal(page, 'play roll words', {
      ...KNOWS_STARTERS,
      settings: { gateChoices: false, roundsPerMeal: 4 },
    });
    for (let word = 0; word < 3; word++) {
      await expect(page.locator('[data-phase="build"]')).toBeVisible({ timeout: 20_000 });
      while (
        (await page.locator('[data-phase="build"]').count()) &&
        (await page.locator('[aria-label$=": empty"]').count())
      ) {
        await placeNext(page);
        await page.waitForTimeout(400);
      }
      await expect(page.locator('[data-phase="build"]')).toHaveCount(0);
    }

    const boxes = page.getByLabel('open a present');
    await expect(boxes).toHaveCount(2, { timeout: 30_000 });
    await boxes.first().click();
    await expect(page.locator('[data-presents] [data-gift]')).toBeVisible();
    await expect(boxes).toHaveCount(1);

    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sushi-cat.profile.v2')!));
    expect(saved.gifts).toHaveLength(1);

    await page.getByLabel('home').click();
    await expect(page.locator(`[data-gift="${saved.gifts[0]}"]`).first()).toBeVisible();
  });
});
