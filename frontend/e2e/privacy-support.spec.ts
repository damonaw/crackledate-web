import { expect, test } from '@playwright/test';

test('Privacy states browser-local history and stateless processing', async ({ page }) => {
  await page.goto('/privacy/');
  await expect(page.getByRole('heading', { name: 'Privacy' })).toBeVisible();
  await expect(page.getByText('Saved equations, solve times, streaks, settings, theme, difficulty, and onboarding progress stay in this browser.')).toBeVisible();
  await expect(page.getByText('The web service processes puzzle, equation, validation, and hint requests only long enough to respond and does not retain gameplay content.')).toBeVisible();
  await expect(page.getByText('Operational logs contain only timestamp, level, method, path, status, and duration; they do not contain gameplay content or a client identifier.')).toBeVisible();
  await expect(page.getByText('network-derived hashes')).toHaveCount(0);
});

test('Support explains that missing local history cannot be restored', async ({ page }) => {
  await page.goto('/support/');
  await expect(page.getByRole('heading', { name: 'Support', exact: true })).toBeVisible();
  await expect(page.getByText('Clearing browser data, using private browsing, switching browsers, or changing devices can remove local history. Crackle Date does not keep a server copy and cannot restore it.')).toBeVisible();
  await expect(page.getByText('badge')).toHaveCount(0);
});
