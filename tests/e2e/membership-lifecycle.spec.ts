import { expect, test } from '@playwright/test';
import { doc, getDoc } from 'firebase/firestore';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { createE2EActor, createE2EEnvironment, seedE2EMember, seedE2EStudy } from './helpers';

let testEnv: RulesTestEnvironment;

test.beforeAll(async () => {
  testEnv = await createE2EEnvironment();
});

test.afterAll(async () => {
  await testEnv?.cleanup();
});

test('participant can cancel a pending request and request access again', async ({ page }) => {
  const uid = await createE2EActor(page);
  const study = await seedE2EStudy(testEnv, 'request-cancel-host', { title: 'Cancel request lifecycle E2E' });
  await page.goto(`/studies/${study.id}`);

  await page.getByRole('button', { name: 'Request to join' }).click();
  await expect(page.getByText('Your request is awaiting review.')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel request' }).click();
  await expect(page.getByRole('button', { name: 'Request to join' })).toBeVisible();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    expect((await getDoc(doc(context.firestore(), 'studies', study.id, 'members', uid))).exists()).toBe(false);
  });
});

test('participant can dismiss the leave confirmation without leaving the group', async ({ page }) => {
  const uid = await createE2EActor(page);
  const study = await seedE2EStudy(testEnv, 'leave-cancel-host', { title: 'Keep membership lifecycle E2E' });
  await seedE2EMember(testEnv, study.id, uid, 'approved');
  await page.goto(`/studies/${study.id}`);

  await page.getByRole('button', { name: 'Leave group' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Leave this group?' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('button', { name: 'Leave group' })).toBeVisible();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    expect((await getDoc(doc(context.firestore(), 'studies', study.id, 'members', uid))).data()?.status).toBe('approved');
  });
});

test('participant confirms leaving and sees a self departure message', async ({ page }) => {
  const uid = await createE2EActor(page);
  const study = await seedE2EStudy(testEnv, 'leave-confirm-host', { title: 'Leave group lifecycle E2E' });
  await seedE2EMember(testEnv, study.id, uid, 'approved');
  await page.goto(`/studies/${study.id}`);

  await page.getByRole('button', { name: 'Leave group' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Leave group' }).click();
  await expect(page.getByText('You left this event.')).toBeVisible();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    expect((await getDoc(doc(context.firestore(), 'studies', study.id, 'members', uid))).exists()).toBe(false);
  });
});

test('invited participant can decline an invite and it disappears from the invites list', async ({ page }) => {
  const uid = await createE2EActor(page);
  const study = await seedE2EStudy(testEnv, 'invite-decline-host', { title: 'Declined invite lifecycle E2E' });
  await seedE2EMember(testEnv, study.id, uid, 'invited');
  await page.goto('/invites');
  const invite = page.locator(`#invite-${study.id}`);
  await expect(invite).toBeVisible();
  await invite.getByRole('button', { name: 'Decline' }).click();
  await expect(invite).toHaveCount(0);
  await testEnv.withSecurityRulesDisabled(async (context) => {
    expect((await getDoc(doc(context.firestore(), 'studies', study.id, 'members', uid))).exists()).toBe(false);
  });
});

test('invited participant sees the address gate until accepting the invite', async ({ page }) => {
  const uid = await createE2EActor(page);
  const study = await seedE2EStudy(testEnv, 'invite-address-host', {
    title: 'Invite address boundary E2E',
    exactAddress: 'Invite-only Test Avenue 3',
  });
  await seedE2EMember(testEnv, study.id, uid, 'invited');
  await page.goto(`/studies/${study.id}`);
  await expect(page.getByRole('button', { name: 'Accept invite' })).toBeVisible();
  await expect(page.getByText('The street address and entry notes unlock after the host approves you.')).toHaveCount(0);
  await expect(page.getByText('Invite-only Test Avenue 3')).toHaveCount(0);
  await expect(page.getByText('Accept the invite to unlock the street address.')).toBeVisible();
});

test('private event is not disclosed to an uninvited visitor', async ({ page }) => {
  await createE2EActor(page);
  const study = await seedE2EStudy(testEnv, 'private-event-host', {
    title: 'Private gathering boundary E2E',
    isPublic: false,
    exactAddress: 'Unlisted Test Lane 9',
  });
  await page.goto(`/studies/${study.id}`);
  await expect(page.getByText('This study is private.')).toBeVisible();
  await expect(page.getByRole('heading', { name: study.title })).toHaveCount(0);
  await expect(page.getByText('Unlisted Test Lane 9')).toHaveCount(0);
});
