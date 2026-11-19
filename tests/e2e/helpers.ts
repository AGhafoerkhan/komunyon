import { expect, type Page } from '@playwright/test';

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

export async function finishProfileSetup(page: Page): Promise<void> {
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
