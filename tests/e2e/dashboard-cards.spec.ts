import { expect, test } from '@playwright/test';
import { createE2EActor, createE2EEnvironment, seedE2EAttendance, seedE2EMember, seedE2EStudy } from './helpers';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';

let testEnv: RulesTestEnvironment;

test.beforeAll(async () => {
  testEnv = await createE2EEnvironment();
});

test.afterAll(async () => {
  await testEnv?.cleanup();
});

test('dashboard presents a hosted event with its owner label and no join action', async ({ page }) => {
  const uid = await createE2EActor(page, 'Host Display Example');
  const study = await seedE2EStudy(testEnv, uid, { hostName: 'Host Display Example', title: 'Owned event card E2E' });
  await page.reload();
  const card = page.locator('[data-testid="study-card"]').filter({ hasText: study.title });
  await expect(card).toBeVisible();
  await expect(card.getByText('Your study')).toBeVisible();
  await expect(card.getByTestId('card-join')).toHaveCount(0);
});

test('dashboard card shortens the host name to first initial and surname', async ({ page }) => {
  const uid = await createE2EActor(page);
  const study = await seedE2EStudy(testEnv, 'unrelated-host', {
    hostName: 'Confidential Firstname ExampleSurname',
    title: 'Short host name card E2E',
  });
  await page.reload();
  const card = page.locator('[data-testid="study-card"]').filter({ hasText: study.title });
  await expect(card.getByText('C ExampleSurname')).toBeVisible();
  await expect(card.getByText('Confidential Firstname ExampleSurname')).toHaveCount(0);
  expect(uid).toBeTruthy();
});

test('upcoming filter hides a past one-off event by default', async ({ page }) => {
  await createE2EActor(page);
  const study = await seedE2EStudy(testEnv, 'past-event-host', {
    date: '2026-11-01',
    title: 'Past event filter E2E',
  });
  await page.reload();
  await expect(page.getByLabel('Show')).toHaveValue('upcoming');
  await expect(page.locator('[data-testid="study-card"]').filter({ hasText: study.title })).toHaveCount(0);
});

test('past filter reveals a completed one-off event', async ({ page }) => {
  await createE2EActor(page);
  const study = await seedE2EStudy(testEnv, 'past-event-host', {
    date: '2026-11-01',
    title: 'Visible past event filter E2E',
  });
  await page.reload();
  await page.getByLabel('Show').selectOption('past');
  const card = page.locator('[data-testid="study-card"]').filter({ hasText: study.title });
  await expect(card).toBeVisible();
  await expect(card.getByTestId('card-note')).toContainText('This study has ended.');
});

test('card join action requests access without navigating away', async ({ page }) => {
  await createE2EActor(page);
  const study = await seedE2EStudy(testEnv, 'card-request-host', { title: 'Card join request E2E' });
  await page.reload();
  const card = page.locator('[data-testid="study-card"]').filter({ hasText: study.title });
  const originalUrl = page.url();
  await card.getByTestId('card-join').click();
  await expect(card.getByRole('button', { name: 'Waiting for approval' })).toBeVisible();
  expect(page.url()).toBe(originalUrl);
  await expect(card.getByText('Joined', { exact: true })).toHaveCount(0);
});

test('pending member sees waiting for approval on their card instead of joined', async ({ page }) => {
  const uid = await createE2EActor(page);
  const study = await seedE2EStudy(testEnv, 'pending-card-host', { title: 'Pending card state E2E' });
  await seedE2EMember(testEnv, study.id, uid, 'pending');
  await page.reload();
  const card = page.locator('[data-testid="study-card"]').filter({ hasText: study.title });
  await expect(card.getByRole('button', { name: 'Waiting for approval' })).toBeVisible();
  await expect(card.getByText('Joined', { exact: true })).toHaveCount(0);
  await expect(card.getByTestId('card-join')).toBeDisabled();
});

test('approved member has a joined state and no quick join or leave control', async ({ page }) => {
  const uid = await createE2EActor(page);
  const study = await seedE2EStudy(testEnv, 'approved-card-host', { title: 'Approved card state E2E', approvedCount: 1 });
  await seedE2EMember(testEnv, study.id, uid, 'approved');
  await seedE2EAttendance(testEnv, study.id, study.date, uid, true);
  await page.reload();
  const card = page.locator('[data-testid="study-card"]').filter({ hasText: study.title });
  await expect(card.getByTestId('card-footer')).toContainText('Joined');
  await expect(card.getByTestId('card-join')).toHaveCount(0);
  await expect(card.getByRole('button', { name: /leave/i })).toHaveCount(0);
});

test('card displays full session spots while keeping group join separate', async ({ page }) => {
  await createE2EActor(page);
  const study = await seedE2EStudy(testEnv, 'full-session-host', {
    title: 'Full session group remains open E2E',
    approvedCount: 8,
    maxCapacity: 8,
  });
  await page.reload();
  const card = page.locator('[data-testid="study-card"]').filter({ hasText: study.title });
  await expect(card.getByTestId('card-footer')).toContainText('Full');
  await expect(card.getByTestId('card-join')).toBeVisible();
});

test('card title and labels do not overlap at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await createE2EActor(page);
  const study = await seedE2EStudy(testEnv, 'mobile-card-host', {
    title: 'A long event title for the narrow mobile card E2E',
    tags: ['bible-study', 'communion', 'prayer-worship', 'dinner'],
  });
  await page.reload();
  const card = page.locator('[data-testid="study-card"]').filter({ hasText: study.title });
  const titleBox = await card.getByTestId('card-title').boundingBox();
  const tagsBox = await card.getByTestId('card-tags').boundingBox();
  expect(titleBox).not.toBeNull();
  expect(tagsBox).not.toBeNull();
  expect(tagsBox!.y).toBeGreaterThanOrEqual(titleBox!.y + titleBox!.height);
  const widths = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
  expect(widths.content, 'mobile dashboard must not scroll horizontally').toBeLessThanOrEqual(widths.viewport);
});

test('card internal layout keeps equal height for short and long titles', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await createE2EActor(page);
  const short = await seedE2EStudy(testEnv, 'card-height-host', { title: 'Short card title E2E' });
  const long = await seedE2EStudy(testEnv, 'card-height-host', {
    title: 'A substantially longer title that wraps across lines while preserving the dashboard card dimensions E2E',
    tags: ['bible-study', 'communion', 'prayer-worship', 'dinner'],
  });
  await page.reload();
  const first = await page.locator('[data-testid="study-card"]').filter({ hasText: short.title }).boundingBox();
  const second = await page.locator('[data-testid="study-card"]').filter({ hasText: long.title }).boundingBox();
  expect(first).not.toBeNull();
  expect(second).not.toBeNull();
  expect(first!.height).toBe(second!.height);
});
