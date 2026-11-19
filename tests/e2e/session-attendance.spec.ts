import { expect, test } from '@playwright/test';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { createE2EActor, createE2EEnvironment, seedE2EMember, seedE2EStudy } from './helpers';

let testEnv: RulesTestEnvironment;
const SESSION_DATE = '2026-12-10';

test.beforeAll(async () => {
  testEnv = await createE2EEnvironment();
});

test.afterAll(async () => {
  await testEnv?.cleanup();
});

async function seedAttendees(studyId: string, uids: string[]): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await Promise.all(uids.map((uid) => setDoc(
      doc(firestore, 'studies', studyId, 'sessions', SESSION_DATE, 'attendees', uid),
      { uid, joined: true, updatedAt: '2026-11-19T00:00:00.000Z' },
    )));
    await setDoc(doc(firestore, 'studies', studyId, 'sessions', SESSION_DATE, 'summary', 'attendance'), {
      attendingCount: uids.length,
      updatedAt: '2026-11-19T00:00:00.000Z',
    });
  });
}

test('approved participant joins and leaves a specific session with live spot updates', async ({ page }) => {
  const uid = await createE2EActor(page);
  const study = await seedE2EStudy(testEnv, 'session-join-host', { title: 'Session join leave E2E' });
  await seedE2EMember(testEnv, study.id, uid, 'approved');
  await seedAttendees(study.id, [study.hostId]);
  await page.goto(`/studies/${study.id}`);

  await expect(page.getByText('1 / 8', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();
  await expect(page.getByText('2 / 8', { exact: false })).toBeVisible();

  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Join', exact: true })).toBeVisible();
  await expect(page.getByText('1 / 8', { exact: false })).toBeVisible();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const records = await getDocs(collection(context.firestore(), 'studies', study.id, 'sessions', SESSION_DATE, 'attendees'));
    expect(records.docs.find((item) => item.id === uid)?.data().joined).toBe(false);
  });
});

test('participant cannot join a date when no host or co-host will attend', async ({ page }) => {
  const uid = await createE2EActor(page);
  const study = await seedE2EStudy(testEnv, 'session-no-host', { title: 'No host date E2E' });
  await seedE2EMember(testEnv, study.id, uid, 'approved');
  await page.goto(`/studies/${study.id}`);

  const join = page.getByRole('button', { name: 'No host', exact: true });
  await expect(join).toBeDisabled();
  await expect(page.getByText('0 / 8', { exact: false })).toBeVisible();
});

test('participant sees a full session as full and cannot increment its count', async ({ page }) => {
  const uid = await createE2EActor(page);
  const study = await seedE2EStudy(testEnv, 'full-session-capacity-host', {
    title: 'Session capacity E2E', maxCapacity: 3,
  });
  await seedE2EMember(testEnv, study.id, uid, 'approved');
  await seedAttendees(study.id, [study.hostId, 'full-member-one', 'full-member-two']);
  await page.goto(`/studies/${study.id}`);

  await expect(page.getByText('3 / 3', { exact: false })).toBeVisible();
  const full = page.getByRole('button', { name: 'Full', exact: true });
  await expect(full).toBeDisabled();
});

test('host can cancel and then proceed with the active one-off session', async ({ page }) => {
  const uid = await createE2EActor(page, 'Session Host Tester');
  const study = await seedE2EStudy(testEnv, uid, { title: 'Host session controls E2E' });
  await page.goto(`/studies/${study.id}`);

  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Proceed', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Proceed', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    expect((await getDoc(doc(context.firestore(), 'studies', study.id))).data()?.skippedDates).toEqual([]);
  });
});

test('approved participant sees the canceled date as zero spots and canceled status', async ({ page }) => {
  const uid = await createE2EActor(page);
  const study = await seedE2EStudy(testEnv, 'canceled-session-host', {
    title: 'Canceled session zero spots E2E', skippedDates: [SESSION_DATE],
  });
  await seedE2EMember(testEnv, study.id, uid, 'approved');
  await seedAttendees(study.id, [study.hostId, 'stale-attendee']);
  await page.goto(`/studies/${study.id}`);

  await expect(page.getByText('0 / 8', { exact: false })).toBeVisible();
  await expect(page.getByText('Canceled', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Join', exact: true })).toHaveCount(0);
});
