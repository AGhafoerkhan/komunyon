import { expect, test } from '@playwright/test';

const widths = [320, 375, 640, 768, 1024, 1440];

test.beforeEach(async ({ page }) => {
  await page.goto('/dev/card-fixtures');
});

for (const width of widths) {
  test(`cards keep their fixed geometry at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const fixtures = page.getByTestId('fixture-visitor-all-tags');
    const card = fixtures.getByTestId('study-card');
    const title = fixtures.getByTestId('card-title');
    const tags = fixtures.getByTestId('card-tags');
    const date = fixtures.getByTestId('card-date');
    const note = fixtures.getByTestId('card-note');
    const footer = fixtures.getByTestId('card-footer');
    const join = fixtures.getByTestId('card-join');

    await expect(card).toHaveCSS('height', '320px');
    const boxes = await Promise.all([card, title, tags, date, note, footer, join].map((locator) => locator.boundingBox()));
    const [cardBox, titleBox, tagsBox, dateBox, noteBox, footerBox, joinBox] = boxes;
    expect(cardBox).not.toBeNull();
    expect(titleBox).not.toBeNull();
    expect(tagsBox).not.toBeNull();
    expect(dateBox).not.toBeNull();
    expect(noteBox).not.toBeNull();
    expect(footerBox).not.toBeNull();
    expect(joinBox).not.toBeNull();
    expect(titleBox!.y + titleBox!.height).toBeLessThanOrEqual(tagsBox!.y);
    expect(tagsBox!.y + tagsBox!.height).toBeLessThanOrEqual(dateBox!.y);
    expect(dateBox!.y + dateBox!.height).toBeLessThanOrEqual(noteBox!.y);
    expect(noteBox!.y + noteBox!.height).toBeLessThanOrEqual(footerBox!.y);
    expect(cardBox!.x).toBeGreaterThanOrEqual(0);
    expect(cardBox!.x + cardBox!.width).toBeLessThanOrEqual(width);

    const footerContentRight = await footer.evaluate((element) => {
      const style = getComputedStyle(element);
      return element.getBoundingClientRect().right - Number.parseFloat(style.paddingRight);
    });
    expect(footerContentRight).toBeLessThanOrEqual(joinBox!.x);
    await expect(tags.getByText('Study')).toBeVisible();
    await expect(tags.getByText('Prayer/Worship')).toBeVisible();
    await expect(tags.getByText('Communion')).toBeVisible();
    await expect(tags.getByText('Event')).toBeVisible();
    await expect(tags.getByText('Dinner')).toBeVisible();
    if (width === 320 || width === 768 || width === 1440) {
      await expect(card).toHaveScreenshot(`dashboard-card-${width}.png`, { animations: 'disabled' });
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
