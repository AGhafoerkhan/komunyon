import { expect, test } from '@playwright/test';
import { collectionGroup, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { upcomingSessions } from '@/lib/format';
import { createE2EActor, createE2EEnvironment } from './helpers';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';

let testEnv: RulesTestEnvironment;

test.beforeAll(async () => {
  testEnv = await createE2EEnvironment();
});

test.afterAll(async () => {
  await testEnv?.cleanup();
});

async function beginHostStudy(page: import('@playwright/test').Page) {
  const hostId = await createE2EActor(page, 'Study Host Tester');
  await page.getByRole('link', { name: 'Host an event' }).click();
  await expect(page).toHaveURL(/\/studies\/new$/);
  return hostId;
}

async function fillValidOneOff(page: import('@playwright/test').Page, title: string) {
  await page.getByRole('textbox', { name: 'Title' }).fill(title);
  await page.getByRole('textbox', { name: 'Description' }).fill('A detailed browser test gathering.');
  await page.getByRole('button', { name: 'Event', exact: true }).click();
  await page.getByRole('button', { name: 'One-off' }).click();
  await page.getByLabel('Date').fill('2026-12-10');
  await page.getByLabel('Time').fill('19:00');
  await page.getByLabel('Neighbourhood').selectOption('Centrum');
  await page.getByLabel('Max capacity').fill('8');
  await page.getByLabel('Exact address').fill('Private Test Street 12');
}

async function waitForCreatedStudy(page: import('@playwright/test').Page) {
  await page.waitForURL((url) => /^\/studies\/[^/]+$/.test(url.pathname) && url.pathname !== '/studies/new');
}

test('host a study page exposes the required fields with accessible names', async ({ page }) => {
  await beginHostStudy(page);
  await page.getByRole('button', { name: 'One-off' }).click();
  for (const label of ['Title', 'Description', 'Date', 'Time', 'Neighbourhood', 'Max capacity', 'Exact address']) {
    await expect(page.getByLabel(label)).toBeVisible();
  }
  await expect(page.getByRole('button', { name: 'Publish study' })).toBeVisible();
});

test('host creation rejects a title below the six-character minimum', async ({ page }) => {
  await beginHostStudy(page);
  await fillValidOneOff(page, 'Short');
  await page.getByRole('button', { name: 'Publish study' }).click();
  await expect(page.getByText(/Title must be between 6/)).toBeVisible();
  await expect(page).toHaveURL(/\/studies\/new$/);
});

test('host creation rejects a description below the twelve-character minimum', async ({ page }) => {
  await beginHostStudy(page);
  await fillValidOneOff(page, 'Valid title E2E');
  await page.getByRole('textbox', { name: 'Description' }).fill('Too short');
  await page.getByRole('button', { name: 'Publish study' }).click();
  await expect(page.getByText(/Description must be between 12/)).toBeVisible();
});

test('host creation requires at least one event label', async ({ page }) => {
  await beginHostStudy(page);
  await page.getByRole('textbox', { name: 'Title' }).fill('No label event E2E');
  await page.getByRole('textbox', { name: 'Description' }).fill('A sufficiently detailed event description.');
  await page.getByRole('button', { name: 'One-off' }).click();
  await page.getByLabel('Date').fill('2026-12-10');
  await page.getByLabel('Time').fill('19:00');
  await page.getByLabel('Neighbourhood').selectOption('Centrum');
  await page.getByLabel('Max capacity').fill('8');
  await page.getByLabel('Exact address').fill('Private Test Street 12');
  await page.getByRole('button', { name: 'Publish study' }).click();
  await expect(page.getByText(/Choose at least one:/)).toBeVisible();
});

test('host creation requires a date for a one-off event', async ({ page }) => {
  await beginHostStudy(page);
  await fillValidOneOff(page, 'Missing date event E2E');
  await page.getByLabel('Date').fill('');
  await page.getByRole('button', { name: 'Publish study' }).click();
  await expect(page.getByText(/Choose a date/)).toBeVisible();
});

test('host creation requires a private exact address', async ({ page }) => {
  await beginHostStudy(page);
  await fillValidOneOff(page, 'Missing address event E2E');
  await page.getByLabel('Exact address').fill('');
  await page.getByRole('button', { name: 'Publish study' }).click();
  await expect(page.getByText(/Add the exact address/)).toBeVisible();
});

test('host can publish a one-off event and its address stays in the private area', async ({ page }) => {
  const hostId = await beginHostStudy(page);
  await fillValidOneOff(page, 'Published one-off event E2E');
  await page.getByRole('button', { name: 'Publish study' }).click();
  await waitForCreatedStudy(page);
  await expect(page.getByRole('heading', { name: 'Published one-off event E2E' })).toBeVisible();
  await expect(page.getByText('Private Test Street 12')).toBeVisible();

  const studyId = page.url().split('/').pop()!;
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    const study = await getDoc(doc(firestore, 'studies', studyId));
    const details = await getDoc(doc(firestore, 'studies', studyId, 'private', 'details'));
    const attendee = await getDoc(doc(firestore, 'studies', studyId, 'sessions', '2026-12-10', 'attendees', hostId));
    expect(study.data()?.hostId).toBe(hostId);
    expect(study.data()).not.toHaveProperty('exactAddress');
    expect(details.data()?.exactAddress).toBe('Private Test Street 12');
    expect(attendee.data()?.joined).toBe(true);
  });
});

test('host creation defaults member contact sharing to enabled', async ({ page }) => {
  await beginHostStudy(page);
  await expect(page.getByRole('switch', { name: 'Members can contact each other' })).toHaveAttribute('aria-checked', 'true');
});

test('host can create a recurring event with the next eight weeks shown', async ({ page }) => {
  await beginHostStudy(page);
  await page.getByRole('textbox', { name: 'Title' }).fill('Recurring schedule E2E');
  await page.getByRole('textbox', { name: 'Description' }).fill('A detailed recurring browser test event.');
  await page.getByRole('button', { name: 'Study', exact: true }).click();
  await page.getByRole('button', { name: 'Recurring' }).click();
  await page.getByLabel('Day of week').selectOption('1');
  await page.getByLabel('Time').fill('19:00');
  await page.getByLabel('Neighbourhood').selectOption('Centrum');
  await page.getByLabel('Max capacity').fill('8');
  await page.getByLabel('Exact address').fill('Recurring Test Street 8');
  await expect(page.getByRole('heading', { name: 'Upcoming Mondays' })).toBeVisible();
  await expect(page.getByRole('list').filter({ has: page.getByRole('button', { name: /Ongoing/ }) })).toBeVisible();
  await expect(page.getByRole('button', { name: /Ongoing/ })).toHaveCount(8);
});

test('host recurring event creation adds the host to all eight planned sessions', async ({ page }) => {
  const hostId = await beginHostStudy(page);
  await page.getByRole('textbox', { name: 'Title' }).fill('Host plans eight dates E2E');
  await page.getByRole('textbox', { name: 'Description' }).fill('A detailed recurring browser test event.');
  await page.getByRole('button', { name: 'Study', exact: true }).click();
  await page.getByRole('button', { name: 'Recurring' }).click();
  await page.getByLabel('Day of week').selectOption('1');
  await page.getByLabel('Time').fill('19:00');
  await page.getByLabel('Neighbourhood').selectOption('Centrum');
  await page.getByLabel('Max capacity').fill('8');
  await page.getByLabel('Exact address').fill('Recurring Test Street 8');
  await page.getByRole('button', { name: 'Publish study' }).click();
  await waitForCreatedStudy(page);
  const studyId = page.url().split('/').pop()!;
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    const studySnapshot = await getDoc(doc(firestore, 'studies', studyId));
    expect(studySnapshot.exists(), `created study ${studyId} should exist`).toBe(true);
    const study = studySnapshot.data()!;
    const dates = upcomingSessions(study.dayOfWeek, study.time, 8);
    const snapshots = await Promise.all(dates.map((date) =>
      getDoc(doc(firestore, 'studies', studyId, 'sessions', date, 'attendees', hostId))));
    const hostAttendance = await getDocs(query(collectionGroup(firestore, 'attendees'), where('uid', '==', hostId)));
    const missingDates = dates.filter((_, index) => snapshots[index].data()?.joined !== true);
    expect(missingDates, `host ${hostId} should attend all dates in ${studyId}; found ${hostAttendance.docs.map((item) => item.ref.path).join(', ')}`)
      .toEqual([]);
  });
});

test('host edits an event title and sees the saved value on the detail page', async ({ page }) => {
  const hostId = await beginHostStudy(page);
  await fillValidOneOff(page, 'Event before edit E2E');
  await page.getByRole('button', { name: 'Publish study' }).click();
  await waitForCreatedStudy(page);
  const studyId = page.url().split('/').pop()!;
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const study = await getDoc(doc(context.firestore(), 'studies', studyId));
    expect(study.exists(), `created study ${studyId} should exist before edit`).toBe(true);
    expect(study.data()?.hostId, `host mismatch in ${studyId}`).toBe(hostId);
  });
  await page.goto(`/studies/${studyId}/edit`);
  await expect(page.getByRole('heading', { name: 'Edit study' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Title' }).fill('Event after edit E2E');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page).toHaveURL(`/studies/${studyId}`);
  await expect(page.getByRole('heading', { name: 'Event after edit E2E' })).toBeVisible();
});
