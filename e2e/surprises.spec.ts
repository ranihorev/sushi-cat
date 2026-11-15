import { expect, test, type Page } from '@playwright/test';
import { currentTarget, feed, recordClips, seedProfile, startMeal, MET_ALL } from './helpers';

/* The rare jokes, checked in a real browser. Each one is asked for by name
   through the development handle, so the test does not wait five rounds for
   one to come round. Set SHOTS=dir to save a picture of each. */

const SHOTS = process.env.SHOTS;
const snap = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};
const force = (page: Page, gag: string) =>
  page.evaluate((g) => (window as any).__surprises.forceNext(g), gag);

test.describe('the jokes', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await recordClips(page);
  });

  for (const [gag, at] of [
    ['achoo', 1300],
    ['wasabi', 1500],
    ['splat', 1700],
  ] as const) {
    test(`${gag} plays after a right answer, then the meal goes on`, async ({ page }) => {
      await startMeal(page);
      await force(page, gag);
      await feed(page, await currentTarget(page));
      await expect(page.locator(`svg[data-gag="${gag}"]`)).toBeVisible({ timeout: 3000 });
      await page.waitForTimeout(at - 700);
      await snap(page, `meal-${gag}`);
      // over, and the next question is on the counter
      await expect(page.locator('svg[data-gag]')).toHaveCount(0, { timeout: 5000 });
      await expect(page.locator('.sushi-btn').first()).toBeEnabled({ timeout: 6000 });
    });
  }

  test('tapping the cat during a round makes him do something silly', async ({ page }) => {
    await startMeal(page);
    await force(page, 'yawn');
    await page.getByTestId('the-cat').click();
    await expect(page.locator('svg[data-gag="yawn"]')).toBeVisible();
    await page.waitForTimeout(600);
    await snap(page, 'tap-yawn');
  });

  test('a fish in sunglasses peeks out of a door on the street', async ({ page }) => {
    await seedProfile(page, MET_ALL);
    await page.goto('/');
    // a fresh visit to the street, with a guest asked for
    await page.getByText('parents').click();
    await page.evaluate(() => (window as any).__surprises.forceDoor('fish'));
    await page.getByRole('button', { name: /done|back|close/i }).first().click();
    await expect(page.locator('[data-guest="fish"]')).toBeVisible({ timeout: 3000 });
    await page.waitForTimeout(900);
    await snap(page, 'door-fish');
    // tapping the fish does not open the shop
    await page.locator('[data-guest="fish"]').click();
    await expect(page.getByLabel('play', { exact: true })).toBeVisible();
  });

  test('a dancing octopus peeks out of a door on the street', async ({ page }) => {
    await seedProfile(page, MET_ALL);
    await page.goto('/');
    await page.getByText('parents').click();
    await page.evaluate(() => (window as any).__surprises.forceDoor('octopus'));
    await page.getByRole('button', { name: /done|back|close/i }).first().click();
    await expect(page.locator('[data-guest="octopus"]')).toBeVisible({ timeout: 3000 });
    await page.waitForTimeout(900);
    await snap(page, 'door-octopus');
  });
});
