import { expect, test } from '@playwright/test';
import { doc, getDoc } from 'firebase/firestore';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { createE2EActor, createE2EEnvironment, seedE2EStudy } from './helpers';

let testEnv: RulesTestEnvironment;

test.beforeAll(async () => {
  testEnv = await createE2EEnvironment();
});

test.afterAll(async () => {
  await testEnv?.cleanup();
});

test('host can dismiss delete confirmation and keep the event', async ({ page }) => {
  const uid = await createE2EActor(page);
  const study = await seedE2EStudy(testEnv, uid, { title: 'Delete confirmation cancel E2E' });
  await page.goto(`/studies/${study.id}`);
  await page.getByRole('button', { name: 'Delete study' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Delete this study?' })).toBeVisible();
  await expect(dialog.getByText(/removed for everyone, including the address/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('heading', { name: study.title })).toBeVisible();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    expect((await getDoc(doc(context.firestore(), 'studies', study.id))).exists()).toBe(true);
  });
});

test('host confirms deletion and returns to the dashboard', async ({ page }) => {
  const uid = await createE2EActor(page);
  const study = await seedE2EStudy(testEnv, uid, { title: 'Confirmed delete event E2E' });
  await page.goto(`/studies/${study.id}`);
  await page.getByRole('button', { name: 'Delete study' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete study' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await testEnv.withSecurityRulesDisabled(async (context) => {
    expect((await getDoc(doc(context.firestore(), 'studies', study.id))).exists()).toBe(false);
  });
});
