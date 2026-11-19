import { expect, test } from '@playwright/test';

const widths = [320, 375, 640, 768, 1024, 1440];
const fixtureIds = [
  'host-long-full',
  'joined-canceled-week',
  'waiting-approval',
  'visitor-all-tags',
  'one-off-past',
  'one-off-upcoming-minimum-title',
];

test.beforeEach(async ({ page }) => {
  await page.goto('/dev/card-fixtures');
});

for (const width of widths) {
  test(`cards keep their fixed geometry at ${width}px`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile-chrome' && width !== 320, 'Mobile emulation focuses on the narrow 320px boundary.');
    await page.setViewportSize({ width, height: 900 });
    for (const id of fixtureIds) {
      const fixture = page.getByTestId(`fixture-${id}`);
      const card = fixture.getByTestId('study-card');
      const title = fixture.getByTestId('card-title');
      const tags = fixture.getByTestId('card-tags');
      const date = fixture.getByTestId('card-date');
      const note = fixture.getByTestId('card-note');
      const footer = fixture.getByTestId('card-footer');
      const [cardBox, titleBox, tagsBox, dateBox, noteBox, footerBox] = await Promise.all(
        [card, title, tags, date, note, footer].map((locator) => locator.boundingBox()),
      );
      expect(cardBox, id).not.toBeNull();
      expect(titleBox, id).not.toBeNull();
      expect(tagsBox, id).not.toBeNull();
      expect(dateBox, id).not.toBeNull();
      expect(noteBox, id).not.toBeNull();
      expect(footerBox, id).not.toBeNull();
      await expect(card, id).toHaveCSS('height', '320px');
      expect(titleBox!.y + titleBox!.height, id).toBeLessThanOrEqual(tagsBox!.y);
      expect(tagsBox!.y + tagsBox!.height, id).toBeLessThanOrEqual(dateBox!.y);
      expect(dateBox!.y + dateBox!.height, id).toBeLessThanOrEqual(noteBox!.y);
      expect(noteBox!.y + noteBox!.height, id).toBeLessThanOrEqual(footerBox!.y);
      expect(cardBox!.x, id).toBeGreaterThanOrEqual(0);
      expect(cardBox!.x + cardBox!.width, id).toBeLessThanOrEqual(width);
      await expect(title, `${id}: title must be clipped to two lines`).toHaveCSS('-webkit-line-clamp', '2');
      await expect(title, `${id}: title overflow must be clipped`).toHaveCSS('overflow', 'hidden');
      const tagItems = await tags.locator('li').evaluateAll((items) => items.map((item) => {
        const rect = item.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      }));
      expect(tagItems.length, id).toBeLessThanOrEqual(5);
      for (const item of tagItems) {
        expect(item.left, `${id}: label left edge`).toBeGreaterThanOrEqual(tagsBox!.x);
        expect(item.right, `${id}: label right edge`).toBeLessThanOrEqual(tagsBox!.x + tagsBox!.width);
        expect(item.top, `${id}: label top edge`).toBeGreaterThanOrEqual(tagsBox!.y);
        expect(item.bottom, `${id}: label bottom edge`).toBeLessThanOrEqual(tagsBox!.y + tagsBox!.height);
      }

      const join = fixture.getByTestId('card-join');
      if (await join.count()) {
        const joinBox = await join.boundingBox();
        expect(joinBox, id).not.toBeNull();
        const footerContentRight = await footer.evaluate((element) => {
          const style = getComputedStyle(element);
          return element.getBoundingClientRect().right - Number.parseFloat(style.paddingRight);
        });
        expect(footerContentRight, id).toBeLessThanOrEqual(joinBox!.x);
      }
    }

    const fixtures = page.getByTestId('fixture-visitor-all-tags');
    const card = fixtures.getByTestId('study-card');
    const tags = fixtures.getByTestId('card-tags');
    await expect(tags.getByText('Study')).toBeVisible();
    await expect(tags.getByText('Prayer/Worship')).toBeVisible();
    await expect(tags.getByText('Communion')).toBeVisible();
    await expect(tags.getByText('Event')).toBeVisible();
    await expect(tags.getByText('Dinner')).toBeVisible();
    if (testInfo.project.name === 'desktop-chrome' && (width === 320 || width === 768 || width === 1440)) {
      await page.mouse.move(0, 0);
      await expect(card).toHaveScreenshot(`dashboard-card-${width}.png`, { animations: 'disabled' });
    }
    if (testInfo.project.name === 'desktop-chrome' && width === 320) {
      await page.mouse.move(0, 0);
      await expect(page.getByTestId('fixture-host-long-full').getByTestId('study-card'))
        .toHaveScreenshot(`dashboard-card-host-long-full-${width}.png`, { animations: 'disabled' });
    }
    if (testInfo.project.name === 'mobile-chrome' && width === 320) {
      await page.mouse.move(0, 0);
      await expect(card).toHaveScreenshot('dashboard-card-mobile-320.png', { animations: 'disabled' });
    }
  });
}

test('long title and all five labels stay in their assigned zones', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  const fixture = page.getByTestId('fixture-visitor-all-tags');
  expect((await fixture.getByTestId('card-title').textContent())?.length).toBe(120);
  await expect(fixture.getByTestId('card-title')).toHaveCSS('-webkit-line-clamp', '2');
  const tagItems = fixture.getByTestId('card-tags').locator('li');
  await expect(tagItems).toHaveCount(5);
  const rowTops = await tagItems.evaluateAll((items) => [...new Set(items.map((item) => Math.round(item.getBoundingClientRect().top)))]);
  expect(rowTops.length).toBeLessThanOrEqual(2);
  await expect(fixture.getByText(/Alexandria/)).toHaveCount(0);
});

test('role states keep their labels and actions distinct', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  const host = page.getByTestId('fixture-host-long-full');
  const joined = page.getByTestId('fixture-joined-canceled-week');
  const pending = page.getByTestId('fixture-waiting-approval');
  const visitor = page.getByTestId('fixture-visitor-all-tags');
  const past = page.getByTestId('fixture-one-off-past');
  const oneOff = page.getByTestId('fixture-one-off-upcoming-minimum-title');

  await expect(host.getByText(/Your study/)).toBeVisible();
  await expect(host.getByTestId('card-footer')).toContainText('8 / 8');
  await expect(host.getByTestId('card-join')).toHaveCount(0);
  await expect(joined.getByText(/Joined/)).toHaveCount(0);
  await expect(joined.getByTestId('card-join')).toHaveCount(0);
  await expect(joined.getByTestId('card-date')).toContainText('Canceled');
  await expect(joined.getByTestId('card-note')).toContainText('Next session:');
  await expect(joined.getByTestId('card-note')).toContainText('13-12-2026');
  await expect(joined.getByTestId('card-note')).toHaveCSS('-webkit-line-clamp', '2');
  await expect(pending.getByTestId('card-join')).toHaveText('Waiting for approval');
  await expect(pending.getByTestId('card-join')).toBeDisabled();
  await expect(visitor.getByTestId('card-join')).toHaveText('Join');
  await expect(past.getByText('This study has ended.')).toBeVisible();
  await expect(past.getByTestId('card-join')).toHaveCount(0);
  await expect(oneOff.getByTestId('card-title')).toHaveText('Dinner');
  await expect(oneOff.getByTestId('card-tags').locator('li')).toHaveCount(0);
  await expect(oneOff.getByTestId('card-date')).toContainText('20-12-2026');
  await expect(oneOff.getByTestId('card-footer')).toContainText('0 / 8');
  await expect(oneOff.getByTestId('card-join')).toHaveText('Join');
  await expect(joined.getByTestId('study-card')).toHaveScreenshot('dashboard-card-canceled-long-note-320.png', { animations: 'disabled' });
});

test('Join stays separate from the card link and changes only the local fixture state', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  const fixture = page.getByTestId('fixture-visitor-all-tags');
  const cardLink = fixture.getByRole('link');
  await expect(cardLink).toHaveAttribute('href', '/studies/visitor-all-tags');
  await fixture.getByTestId('card-join').click();
  await expect(page).toHaveURL(/\/dev\/card-fixtures$/);
  await expect(fixture.getByTestId('card-join')).toHaveText('Waiting for approval');
  await expect(fixture.getByTestId('card-join')).toBeDisabled();
});
