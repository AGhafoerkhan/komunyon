import { expect, test } from '@playwright/test';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { finishProfileSetup, signInWithMockGoogle } from './helpers';

const projectId = 'demo-komunyon';
const createdAt = '2026-11-19T00:00:00.000Z';
let testEnv: RulesTestEnvironment;

test.beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules: readFileSync(resolve('firestore.rules'), 'utf8') },
  });
});

test.afterAll(async () => {
  await testEnv?.cleanup();
});

test('join request hides the private address until host approval', async ({ browser }) => {
  test.setTimeout(90_000);
  const studyId = `e2e-approval-${crypto.randomUUID()}`;
  const hostContext = await browser.newContext();
  const participantContext = await browser.newContext();
  const hostPage = await hostContext.newPage();
  const participantPage = await participantContext.newPage();
  await hostContext.route('https://e2e.invalid/**', (route) =>
    route.fulfill({ path: resolve('public/icons/icon-192.png'), contentType: 'image/png' }));
  await participantContext.route('https://e2e.invalid/**', (route) =>
    route.fulfill({ path: resolve('public/icons/icon-192.png'), contentType: 'image/png' }));

  try {
    const host = await signInWithMockGoogle(hostPage, `host-${crypto.randomUUID()}@example.test`, 'https://e2e.invalid/host.png');
    await hostPage.waitForURL(/\/onboarding$/);
    await finishProfileSetup(hostPage);

    await signInWithMockGoogle(participantPage, `participant-${crypto.randomUUID()}@example.test`, 'https://e2e.invalid/participant.png');
    await participantPage.waitForURL(/\/onboarding$/);
    await finishProfileSetup(participantPage);

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const firestore = context.firestore();
      await setDoc(doc(firestore, 'studies', studyId), {
        hostId: host.uid,
        hostName: 'E2E Test User',
        hostAge: 30,
        hostPhotoURL: '',
        title: 'Safe access request E2E',
        description: 'A privacy-boundary browser test event.',
        tags: ['event'],
        format: 'one-off',
        dayOfWeek: null,
        date: '2026-12-10',
        time: '19:00',
        maxCapacity: 8,
        area: 'Centrum',
        isPublic: true,
        showMemberContacts: true,
        approvedCount: 0,
        skippedDates: [],
        createdAt,
        updatedAt: createdAt,
      });
      await setDoc(doc(firestore, 'studies', studyId, 'private', 'details'), {
        exactAddress: 'E2E Private Address 42',
        entryNotes: 'Private entry note for approval test.',
        updatedAt: createdAt,
      });
    });

    await participantPage.goto(`/studies/${studyId}`);
    await expect(participantPage.getByRole('heading', { name: 'Safe access request E2E' })).toBeVisible();
    await expect(participantPage.getByText('E2E Private Address 42')).toHaveCount(0);
    await participantPage.getByRole('button', { name: 'Request to join' }).click();
    await expect(participantPage.getByText('Your request is awaiting review.')).toBeVisible();
    await expect(participantPage.getByText('E2E Private Address 42')).toHaveCount(0);

    await hostPage.goto(`/studies/${studyId}`);
    await expect(hostPage.getByRole('heading', { name: 'Pending requests' })).toBeVisible();
    await expect(hostPage.getByText('Approving adds them to the group and shares the address.')).toBeVisible();
    await hostPage.getByRole('button', { name: 'Approve' }).click();

    await expect(participantPage.getByText('E2E Private Address 42')).toBeVisible({ timeout: 15_000 });
    await expect(participantPage.getByRole('button', { name: 'Leave group' })).toBeVisible();
  } finally {
    await Promise.all([hostContext.close(), participantContext.close()]);
  }
});
