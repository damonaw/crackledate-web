import { expect, test } from '@playwright/test';

test('refresh active Calendar and Settings screenshots', async ({ page }) => {
  test.skip(process.env.CRACKLEDATE_UPDATE_SCREENSHOTS !== '1', 'Screenshot refresh is opt-in.');
  await page.addInitScript(() => {
    localStorage.setItem('crackledate.web.first-run-onboarding.v2', 'completed');
    const now = new Date();
    const date = `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}-${`${now.getDate()}`.padStart(2, '0')}`;
    localStorage.setItem('crackledate.web.solutions.v1', JSON.stringify({
      [date]: [
        { equation: '1+1=2', timestamp: now.toISOString(), seconds: 10, value: '2' },
        { equation: '2+2=4', timestamp: now.toISOString(), seconds: 15, value: '4' },
      ],
    }));
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('button[aria-label^="Puzzle date, currently"]').click();
  await expect(page.getByLabel('Average time for selected date')).toContainText('13s');
  await page.screenshot({ path: 'public/how-to-play/instruction-6.png', fullPage: true });

  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await page.screenshot({ path: '../docs/screenshots/settings-panel.jpg', fullPage: true, type: 'jpeg', quality: 90 });
});
