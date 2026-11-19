import { expect, type Page } from '@playwright/test';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const E2E_PROJECT_ID = 'demo-komunyon';
export const E2E_CREATED_AT = '2026-11-19T00:00:00.000Z';

export async function createE2EEnvironment(): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: E2E_PROJECT_ID,
    firestore: { rules: readFileSync(resolve('firestore.rules'), 'utf8') },
    storage: { rules: readFileSync(resolve('storage.rules'), 'utf8') },
  });
}

export async function signInWithMockGoogle(
  page: Page,
  email: string,
  photoURL = '',
): Promise<{ idToken: string; uid: string }> {
  await page.goto('/login');
  const tokenResponsePromise = page.waitForResponse((response) =>
    response.url().includes('/accounts:signInWithIdp'));
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Sign in with Google' }).click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(/127\.0\.0\.1:9099/);
  const emailInput = popup.locator('#email-input');
  const addAccount = popup.getByRole('button', { name: /Add new account/i });
  for (let attempt = 0; attempt < 3 && !(await emailInput.isVisible().catch(() => false)); attempt += 1) {
    await expect(addAccount).toBeVisible();
    await addAccount.click();
    await emailInput.waitFor({ state: 'visible', timeout: 4_000 }).catch(() => undefined);
  }
  await expect(emailInput).toBeVisible();
  await emailInput.fill(email);
  await popup.locator('#display-name-input').fill('E2E Test User');
  await popup.locator('#screen-name-input').fill('e2e-test-user');
  if (photoURL) await popup.locator('#profile-photo-input').fill(photoURL);
  await popup.getByRole('button', { name: 'Sign in with Google.com' }).click();
  await popup.waitForEvent('close');
  const tokenResponse = await tokenResponsePromise;
  const tokenData = await tokenResponse.json() as { idToken: string; localId: string };
  return { idToken: tokenData.idToken, uid: tokenData.localId };
}

export async function finishProfileSetup(page: Page, fullName = 'E2E Test User'): Promise<void> {
  await page.getByRole('textbox', { name: /^Full name/ }).fill(fullName);
  await page.getByRole('textbox', { name: 'Age', exact: true }).fill('30');
  await page.getByRole('combobox', { name: 'Country', exact: true }).selectOption('Netherlands');
  await page.getByRole('combobox', { name: 'City', exact: true }).selectOption('The Hague');
  await page.getByRole('combobox', { name: 'Neighbourhood', exact: true }).selectOption('Centrum');
  await page.getByRole('textbox', { name: /^Bio/ }).fill('I speak Dutch and English.');
  await page.getByRole('textbox', { name: /^Phone number/ }).fill('+31612345678');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL(/\/dashboard$/);
}

export async function createE2EActor(page: Page, fullName = 'E2E Test User'): Promise<string> {
  await page.context().route('https://e2e.invalid/**', (route) =>
    route.fulfill({ path: resolve('public/icons/icon-192.png'), contentType: 'image/png' }));
  const { uid } = await signInWithMockGoogle(page, `e2e-${crypto.randomUUID()}@example.test`, 'https://e2e.invalid/profile.png');
  await page.waitForURL(/\/onboarding$/);
  await finishProfileSetup(page, fullName);
  return uid;
}

export interface E2EStudy {
  id: string;
  hostId: string;
  title: string;
  date: string;
  maxCapacity: number;
  [field: string]: unknown;
}

export async function seedE2EStudy(
  testEnv: RulesTestEnvironment,
  hostId: string,
  overrides: Record<string, unknown> = {},
): Promise<E2EStudy> {
  const id = `e2e-study-${crypto.randomUUID()}`;
  const data = {
    hostId,
    hostName: 'E2E Host Person',
    hostAge: 35,
    hostPhotoURL: '',
    title: `E2E Event ${crypto.randomUUID().slice(0, 8)}`,
    description: 'A test event for browser scenarios.',
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
    pendingUserIds: [],
    approvedUserIds: [],
    invitedUserIds: [],
    skippedDates: [],
    createdAt: E2E_CREATED_AT,
    updatedAt: E2E_CREATED_AT,
    ...overrides,
  };
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'studies', id), data);
    if (typeof overrides.exactAddress === 'string') {
      await setDoc(doc(context.firestore(), 'studies', id, 'private', 'details'), {
        exactAddress: overrides.exactAddress,
        entryNotes: typeof overrides.entryNotes === 'string' ? overrides.entryNotes : '',
        updatedAt: E2E_CREATED_AT,
      });
    }
  });
  return { ...data, id } as E2EStudy;
}

export async function seedE2EMember(
  testEnv: RulesTestEnvironment,
  studyId: string,
  uid: string,
  status: 'pending' | 'approved' | 'invited',
): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'studies', studyId, 'members', uid), {
      uid, status, createdAt: E2E_CREATED_AT, updatedAt: E2E_CREATED_AT,
    });
  });
}

export async function seedE2EAttendance(
  testEnv: RulesTestEnvironment,
  studyId: string,
  date: string,
  uid: string,
  joined: boolean,
): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await setDoc(doc(firestore, 'studies', studyId, 'sessions', date, 'attendees', uid), {
      uid, joined, updatedAt: E2E_CREATED_AT,
    });
    await setDoc(doc(firestore, 'studies', studyId, 'sessions', date, 'summary', 'attendance'), {
      attendingCount: joined ? 1 : 0, updatedAt: E2E_CREATED_AT,
    });
  });
}
