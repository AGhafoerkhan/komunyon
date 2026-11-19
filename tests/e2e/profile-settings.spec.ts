import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createE2EActor } from './helpers';

async function openProfile(page: import('@playwright/test').Page) {
  await createE2EActor(page);
  await page.goto('/profile');
}

test('profile page keeps Profile, Settings, and FAQ as separate sections', async ({ page }) => {
  await openProfile(page);
  await expect(page.getByRole('heading', { name: 'My profile' })).toBeVisible();
  await expect(page.getByText('Profile', { exact: true })).toBeVisible();
  await expect(page.getByText('Settings', { exact: true })).toBeVisible();
  await expect(page.getByText('FAQ', { exact: true })).toBeVisible();
});

test('profile activity counts have an accessible label', async ({ page }) => {
  await openProfile(page);
  const activity = page.getByLabel('Profile activity');
  await expect(activity).toContainText('0 Hosted');
  await expect(activity).toContainText('0 Joined');
  await expect(activity).toContainText('0 Circles');
});

test('appearance switch changes the document into dark mode', async ({ page }) => {
  await openProfile(page);
  await page.getByText('Settings', { exact: true }).click();
  const themeSwitch = page.getByRole('switch', { name: 'Switch to dark mode' });
  await expect(themeSwitch).toHaveAttribute('aria-checked', 'false');
  await themeSwitch.click();
  await expect(page.getByRole('switch', { name: 'Switch to light mode' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.getByText('Dark mode on')).toBeVisible();
});

test('dark mode choice persists after reloading the profile', async ({ page }) => {
  await openProfile(page);
  await page.getByText('Settings', { exact: true }).click();
  await page.getByRole('switch', { name: 'Switch to dark mode' }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('komunyon-theme'))).toBe('dark');
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.getByText('Settings', { exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Switch to light mode' })).toHaveAttribute('aria-checked', 'true');
});

test('profile edit saves changed name and bio', async ({ page }) => {
  await openProfile(page);
  await page.getByRole('textbox', { name: /^Full name/ }).fill('Updated Browser User');
  await page.getByRole('textbox', { name: /^Bio/ }).fill('I speak Dutch, English, and French.');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByText('Profile saved.')).toBeVisible();
  await expect(page.getByText('Updated Browser User · 30')).toBeVisible();
});

test('profile edit rejects an invalid short name accessibly', async ({ page }) => {
  await openProfile(page);
  const name = page.getByRole('textbox', { name: /^Full name/ });
  await name.fill('A');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByText(/Enter your full name/)).toBeVisible();
  await expect(page.getByText('CHECK_AGAIN')).toHaveCount(0);
});

test('profile picture opens in the accessible photo dialog', async ({ page }) => {
  await openProfile(page);
  await page.getByRole('button', { name: "View E2E Test User's photo" }).click();
  await expect(page.getByRole('dialog', { name: 'E2E Test User' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'E2E Test User' })).toBeVisible();
});

test('photo dialog closes with Escape and restores page scrolling', async ({ page }) => {
  await openProfile(page);
  await page.getByRole('button', { name: "View E2E Test User's photo" }).click();
  await expect(page.getByRole('dialog', { name: 'E2E Test User' })).toBeVisible();
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'E2E Test User' })).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
});

test('account deletion confirmation can be dismissed without deleting the account', async ({ page }) => {
  await openProfile(page);
  await page.getByText('Settings', { exact: true }).click();
  await page.getByRole('button', { name: 'Delete account', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Keep account' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep account' }).click();
  await expect(page.getByRole('button', { name: 'Keep account' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
});

test('FAQ explains Android installation', async ({ page }) => {
  await openProfile(page);
  await page.getByText('FAQ', { exact: true }).click();
  await page.getByText('How do I install Komunyon on Android?', { exact: true }).click();
  await expect(page.getByText(/Chrome.*three-dot menu.*Install app or Add to Home screen/)).toBeVisible();
});

test('profile settings meet the automated accessibility scan', async ({ page }) => {
  await openProfile(page);
  await page.getByText('Settings', { exact: true }).click();
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations, 'profile settings should have no axe accessibility violations').toEqual([]);
});
