import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getBytes, ref, uploadString } from 'firebase/storage';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const projectId = 'demo-komunyon';
const bucketUrl = `gs://${projectId}.appspot.com`;
const createdAt = '2026-11-19T00:00:00.000Z';
let testEnv: RulesTestEnvironment;

test.beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules: readFileSync(resolve('firestore.rules'), 'utf8') },
    storage: { rules: readFileSync(resolve('storage.rules'), 'utf8') },
  });
});

test.afterAll(async () => {
  await testEnv?.cleanup();
});

async function signInWithMockGoogle(
  page: import('@playwright/test').Page,
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
  await popup.getByText('Add new account', { exact: true }).click();
  await popup.locator('#email-input').fill(email);
  await popup.locator('#display-name-input').fill('E2E Test User');
  await popup.locator('#screen-name-input').fill('e2e-test-user');
  if (photoURL) await popup.locator('#profile-photo-input').fill(photoURL);
  await popup.getByRole('button', { name: 'Sign in with Google.com' }).click();
  await popup.waitForEvent('close');
  const tokenResponse = await tokenResponsePromise;
  const tokenData = await tokenResponse.json() as { idToken: string; localId: string };
  return { idToken: tokenData.idToken, uid: tokenData.localId };
}

async function finishProfileSetup(page: import('@playwright/test').Page): Promise<void> {
  await page.getByRole('textbox', { name: /^Full name/ }).fill('E2E Test User');
  await page.getByRole('textbox', { name: 'Age', exact: true }).fill('30');
  await page.getByRole('combobox', { name: 'Country', exact: true }).selectOption('Netherlands');
  await page.getByRole('combobox', { name: 'City', exact: true }).selectOption('The Hague');
  await page.getByRole('combobox', { name: 'Neighbourhood', exact: true }).selectOption('Centrum');
  await page.getByRole('textbox', { name: /^Bio/ }).fill('I speak Dutch and English.');
  await page.getByRole('textbox', { name: /^Phone number/ }).fill('+31612345678');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL(/\/dashboard$/);
}

test('login page is keyboard accessible and loads within the local smoke budget', async ({ page }) => {
  const startedAt = Date.now();
  await page.goto('/login');
  const signInButton = page.getByRole('button', { name: 'Sign in with Google' });

  await expect(signInButton).toBeVisible();
  await expect(signInButton).toBeEnabled();
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations, 'login page should have no axe accessibility violations')
    .toEqual([]);
  let signInReachable = false;
  for (let step = 0; step < 6; step += 1) {
    await page.keyboard.press('Tab');
    if (await signInButton.evaluate((element) => element === document.activeElement)) {
      signInReachable = true;
      break;
    }
  }
  expect(signInReachable, 'Google sign-in should be reachable in the keyboard tab order').toBe(true);

  const timing = await page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    return navigation.domContentLoadedEventEnd;
  });
  expect(timing, 'login DOM should be ready within 10 seconds locally').toBeLessThan(10_000);
  expect(Date.now() - startedAt, 'login page smoke path should complete within 12 seconds locally').toBeLessThan(12_000);
});

test('Google popup signs in to onboarding and sign-out returns to the public entry point', async ({ page }) => {
  const email = `google-e2e-${crypto.randomUUID()}@example.test`;
  const externalFirebaseRequests: string[] = [];
  page.on('request', (request) => {
    const hostname = new URL(request.url()).hostname;
    if (/firebase|googleapis\.com|cloudfunctions\.net/.test(hostname)
      && hostname !== '127.0.0.1'
      && hostname !== 'localhost') {
      externalFirebaseRequests.push(request.url());
    }
  });

  await signInWithMockGoogle(page, email);
  await page.waitForURL(/\/onboarding$/);
  await expect(page.getByRole('heading', { name: 'Set up your profile' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  expect(externalFirebaseRequests, 'E2E Firebase traffic must stay on local emulators').toEqual([]);

  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL(/\/$/);
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
});

test('onboarding labels, profile save, and accessible validation work in the browser', async ({ page }) => {
  const email = `profile-e2e-${crypto.randomUUID()}@example.test`;
  const externalFirebaseRequests: string[] = [];
  page.on('request', (request) => {
    const hostname = new URL(request.url()).hostname;
    if (/firebase|googleapis\.com|cloudfunctions\.net/.test(hostname)
      && hostname !== '127.0.0.1'
      && hostname !== 'localhost') {
      externalFirebaseRequests.push(request.url());
    }
  });
  await page.context().route('https://e2e.invalid/**', (route) =>
    route.fulfill({ path: resolve('public/icons/icon-192.png'), contentType: 'image/png' }));

  await signInWithMockGoogle(page, email, 'https://e2e.invalid/profile.png');
  await page.waitForURL(/\/onboarding$/);
  const accessibleControls = [
    page.getByRole('textbox', { name: /^Full name/ }),
    page.getByRole('textbox', { name: 'Age', exact: true }),
    page.getByRole('combobox', { name: 'Country', exact: true }),
    page.getByRole('combobox', { name: 'City', exact: true }),
    page.getByRole('combobox', { name: 'Neighbourhood', exact: true }),
    page.getByRole('textbox', { name: /^Bio/ }),
    page.getByRole('textbox', { name: /^Phone number/ }),
  ];
  for (const control of accessibleControls) {
    await expect(control).toBeVisible();
  }
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations, 'onboarding form should have no axe accessibility violations')
    .toEqual([]);
  await finishProfileSetup(page);
  await expect(page.getByRole('heading', { name: 'Events in The Hague' })).toBeVisible();
  expect(externalFirebaseRequests, 'profile data and photo must stay on local emulators').toEqual([]);
});

test('account deletion requires confirmation and starts Google reauthentication', async ({ page }) => {
  test.setTimeout(90_000);
  const email = `delete-e2e-${crypto.randomUUID()}@example.test`;
  const browserErrors: string[] = [];
  const seenBrowserErrors = new Set<string>();
  const captureBrowserError = (message: string) => {
    if (seenBrowserErrors.has(message) || browserErrors.length >= 5) return;
    seenBrowserErrors.add(message);
    browserErrors.push(message.slice(0, 1800));
  };
  page.on('pageerror', (error) => captureBrowserError(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') captureBrowserError(message.text());
  });
  await page.context().route('https://e2e.invalid/**', (route) =>
    route.fulfill({ path: resolve('public/icons/icon-192.png'), contentType: 'image/png' }));
  const { idToken, uid } = await signInWithMockGoogle(page, email, 'https://e2e.invalid/profile.png');
  await page.waitForURL(/\/onboarding$/);

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    const study = (hostId: string) => ({
      hostId,
      hostName: 'E2E Test User',
      hostAge: 30,
      hostPhotoURL: '',
      title: 'Account deletion E2E',
      description: 'A backend-cleanup test study.',
      tags: ['event'],
      format: 'one-off',
      dayOfWeek: null,
      date: '2026-12-01',
      time: '19:00',
      maxCapacity: 8,
      area: 'Centrum',
      isPublic: true,
      showMemberContacts: true,
      approvedCount: hostId === uid ? 0 : 1,
      skippedDates: [],
      createdAt,
      updatedAt: createdAt,
    });

    await setDoc(doc(firestore, 'studies', 'e2e-owned-study'), study(uid));
    await setDoc(doc(firestore, 'studies', 'e2e-owned-study', 'private', 'details'), {
      exactAddress: 'Test Street 1', entryNotes: '', updatedAt: createdAt,
    });
    await setDoc(doc(firestore, 'studies', 'e2e-joined-study'), study('other-host-joined'));
    await setDoc(doc(firestore, 'studies', 'e2e-joined-study', 'members', uid), {
      uid, status: 'approved', createdAt, updatedAt: createdAt,
    });
    await setDoc(doc(firestore, 'studies', 'e2e-pending-study'), study('other-host-pending'));
    await setDoc(doc(firestore, 'studies', 'e2e-pending-study', 'members', uid), {
      uid, status: 'pending', createdAt, updatedAt: createdAt,
    });
    await setDoc(doc(firestore, 'studies', 'e2e-invited-study'), study('other-host-invited'));
    await setDoc(doc(firestore, 'studies', 'e2e-invited-study', 'members', uid), {
      uid, status: 'invited', createdAt, updatedAt: createdAt,
    });

    await uploadString(ref(context.storage(bucketUrl), `avatars/${uid}`), 'profile avatar', 'raw', {
      contentType: 'image/jpeg',
    });
    await uploadString(ref(context.storage(bucketUrl), 'sessions/e2e-owned-study/2026-12-01/e2e-file.jpg'), 'session image', 'raw', {
      contentType: 'image/jpeg',
    });
  });

  await finishProfileSetup(page);
  await page.goto('/profile');
  await page.getByText('Settings', { exact: true }).click();
  await page.getByRole('button', { name: 'Delete account', exact: true }).click();

  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Delete account', exact: true }).click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(/127\.0\.0\.1:9099/);
  await popup.getByText(email, { exact: true }).click();
  await popup.waitForEvent('close');
  await page.waitForURL(/\/account-deletion$/);
  await expect(page.getByRole('status')).toContainText('Removing your account');
  const outcome = await Promise.race([
    page.waitForURL(/\/$/, { timeout: 45_000 }).then(() => 'signed-out' as const),
    page.locator('main [role="alert"]').waitFor({ state: 'visible', timeout: 45_000 }).then(() => 'error' as const),
  ]);
  if (outcome === 'error') {
    const message = await page.locator('main [role="alert"]').innerText();
    let cleanupState: Record<string, boolean> = {};
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const paths = [
        ['users', uid],
        ['users', uid, 'private', 'contact'],
        ['studies', 'e2e-owned-study'],
        ['studies', 'e2e-joined-study', 'members', uid],
        ['studies', 'e2e-pending-study', 'members', uid],
        ['studies', 'e2e-invited-study', 'members', uid],
      ] as const;
      const snapshots = await Promise.all(paths.map((parts) => getDoc(doc(context.firestore(), parts.join('/')))));
      cleanupState = Object.fromEntries(paths.map((parts, index) => [parts.join('/'), snapshots[index].exists()]));
    });
    throw new Error(`Account deletion failed in the app: ${message}\nCleanup state: ${JSON.stringify(cleanupState)}\nBrowser errors: ${browserErrors.slice(0, 2).join('\n')}`);
  }
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const paths = [
      ['users', uid],
      ['users', uid, 'private', 'contact'],
      ['studies', 'e2e-owned-study'],
      ['studies', 'e2e-owned-study', 'private', 'details'],
      ['studies', 'e2e-joined-study', 'members', uid],
      ['studies', 'e2e-pending-study', 'members', uid],
      ['studies', 'e2e-invited-study', 'members', uid],
    ] as const;
    const snapshots = await Promise.all(paths.map((parts) => getDoc(doc(context.firestore(), parts.join('/')))));
    expect(snapshots.every((snapshot) => !snapshot.exists()), 'account records should be removed').toBe(true);
    await expect(getBytes(ref(context.storage(bucketUrl), `avatars/${uid}`)))
      .rejects.toMatchObject({ code: 'storage/object-not-found' });
    await expect(getBytes(ref(context.storage(bucketUrl), 'sessions/e2e-owned-study/2026-12-01/e2e-file.jpg')))
      .rejects.toMatchObject({ code: 'storage/object-not-found' });
  });

  const lookup = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:lookup?key=fake-api-key', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  expect(lookup.ok, 'Auth account should no longer accept its ID token').toBe(false);
});
