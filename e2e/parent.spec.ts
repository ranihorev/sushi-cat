import { expect, test } from '@playwright/test';

test.use({ hasTouch: true, isMobile: true, viewport: { width: 768, height: 1024 } });

/** the letters shown as switched on */
const activeSet = (page: import('@playwright/test').Page) =>
  page
    .locator('button[aria-pressed="true"]')
    .evaluateAll((els) => els.map((e) => e.textContent!.slice(0, 1)));

/* The parents' page is a long list on a tablet, and it is scrolled with a
   finger. Its letters used to switch on the touch that started a scroll, so
   reading the list quietly added and removed letters from his lessons. */
test('scrolling the parents page changes nothing', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/');
  await page.getByText('parents').tap();
  await page.getByRole('button', { name: 'Done' }).waitFor();
  const before = await activeSet(page);
  expect(before.length).toBeGreaterThan(1);

  const card = (await page.locator('button[aria-pressed="false"]').nth(4).boundingBox())!;
  const x = card.x + card.width / 2;
  const y = card.y + card.height / 2;
  const touch = (type: string, points: { x: number; y: number }[]) =>
    cdp.send('Input.dispatchTouchEvent', {
      type: type as 'touchStart',
      touchPoints: points.map((p) => ({ ...p, id: 1, radiusX: 5, radiusY: 5, force: 1 })),
    });
  const cdp = await page.context().newCDPSession(page);
  await touch('touchStart', [{ x, y }]);
  for (let i = 1; i <= 8; i++) await touch('touchMove', [{ x, y: y - i * 40 }]);
  await touch('touchEnd', []);
  await page.waitForTimeout(300);

  expect(await activeSet(page)).toEqual(before);
  expect(errors).toEqual([]);
});

test('a letter still switches on with a plain tap', async ({ page }) => {
  await page.goto('/');
  await page.getByText('parents').tap();
  const off = page.locator('button[aria-pressed="false"]').first();
  const letter = (await off.textContent())!.slice(0, 1);
  await off.tap();
  await expect.poll(() => activeSet(page)).toContain(letter);
});

test('pieces per meal can be typed as two digits', async ({ page }) => {
  await page.goto('/');
  await page.getByText('parents').tap();
  const box = page.getByRole('spinbutton');
  await box.fill('');
  await box.pressSequentially('12');
  await box.blur();
  await expect(box).toHaveValue('12');
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('sushi-cat.profile.v2')!).settings.roundsPerMeal,
    ),
  ).toBe(12);
});
