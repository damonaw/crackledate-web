import { expect, test } from '@playwright/test';

const onboardingKey = 'crackledate.web.first-run-onboarding.v2';
const solutionsKey = 'crackledate.web.solutions.v1';

function localDateIdentifier(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ onboardingKey }) => {
    localStorage.setItem(onboardingKey, 'completed');
  }, { onboardingKey });
});

test('Practice Round leaves breathing room below the equation helper', async ({ page }) => {
  await page.setViewportSize({ width: 952, height: 907 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Practice Round' }).click();

  const expressionBox = await page.locator('.expression-area').boundingBox();
  const coachBox = await page.locator('.practice-coach').boundingBox();

  expect(expressionBox).not.toBeNull();
  expect(coachBox).not.toBeNull();
  expect(coachBox!.y - (expressionBox!.y + expressionBox!.height)).toBeGreaterThanOrEqual(10);
});

test('Calendar, Settings, and How to Play content sit directly on the page without outer cards', async ({ page }) => {
  await page.setViewportSize({ width: 952, height: 907 });
  await page.goto('/');

  await page.locator('button[aria-label^="Puzzle date, currently"]').click();
  await expect(page.locator('.calendar-page')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.locator('.calendar-page')).toHaveCSS('border-top-width', '0px');
  await expect(page.locator('.calendar-page')).toHaveCSS('padding-top', '0px');

  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('.settings-page')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.locator('.settings-page')).toHaveCSS('border-top-width', '0px');
  await expect(page.locator('.settings-page')).toHaveCSS('padding-top', '0px');

  await page.getByRole('button', { name: 'How to Play' }).click();
  await expect(page.locator('.how-to-play-card')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.locator('.how-to-play-card')).toHaveCSS('border-top-width', '0px');
  await expect(page.locator('.how-to-play-card')).toHaveCSS('padding-top', '0px');
});

test('Start content also avoids a redundant outer card', async ({ page }) => {
  await page.addInitScript(({ onboardingKey }) => {
    localStorage.removeItem(onboardingKey);
  }, { onboardingKey });
  await page.goto('/');

  await expect(page.locator('.start-screen-card')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.locator('.start-screen-card')).toHaveCSS('border-top-width', '0px');
  await expect(page.locator('.start-screen-card')).toHaveCSS('padding-top', '0px');
});

test('Solved-day content also avoids a redundant outer card', async ({ page }) => {
  const today = localDateIdentifier(new Date());
  const [year, month, day] = today.split('-');
  const formattedDate = `${Number(month)}-${Number(day)}-${year}`;
  const digits = [...formattedDate].filter((character) => character !== '-').map(Number);
  const delimiterPositions: number[] = [];
  let digitIndex = 0;
  for (const character of formattedDate) {
    if (character === '-') delimiterPositions.push(digitIndex - 1);
    else digitIndex += 1;
  }
  await page.route('**/api/puzzle?date=*', async (route) => {
    await route.fulfill({
      json: {
        dateIdentifier: today,
        displayDate: today,
        formattedDate,
        digits,
        delimiterPositions,
      },
    });
  });
  await page.addInitScript(({ solutionsKey, today }) => {
    localStorage.setItem(solutionsKey, JSON.stringify({
      [today]: [{ equation: '1+1=2', timestamp: new Date().toISOString(), seconds: 10, value: '2' }],
    }));
  }, { solutionsKey, today });
  await page.goto('/');

  await expect(page.locator('.victory-panel-card')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.locator('.victory-panel-card')).toHaveCSS('border-top-width', '0px');
  await expect(page.locator('.victory-panel-card')).toHaveCSS('padding-top', '0px');
});

test('Calendar is the only history surface and computes the selected-day average', async ({ page }) => {
  const today = localDateIdentifier(new Date());
  await page.addInitScript(({ solutionsKey, today }) => {
    localStorage.setItem(solutionsKey, JSON.stringify({
      [today]: [
        { equation: '1+1=2', timestamp: '2026-07-18T12:00:00Z', seconds: 10, value: '2' },
        { equation: '2+2=4', timestamp: '2026-07-18T12:01:00Z', seconds: 15, value: '4' },
        { equation: '3+3=6', timestamp: '2026-07-18T12:02:00Z', seconds: 0, value: '6' },
      ],
    }));
  }, { solutionsKey, today });

  await page.goto('/');
  await page.locator('button[aria-label^="Puzzle date, currently"]').click();

  await expect(page.getByRole('heading', { name: 'Choose Date' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stats' })).toHaveCount(0);
  await expect(page.getByLabel('Average time for selected date')).toContainText('13s');
  await expect(page.locator('.solution-equation')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Play this Date' })).toBeVisible();
});

test('Calendar shows an em dash when the selected date has no timed saves', async ({ page }) => {
  await page.goto('/');
  await page.locator('button[aria-label^="Puzzle date, currently"]').click();
  await expect(page.getByLabel('Average time for selected date')).toContainText('—');
});

test('Clear Data removes Calendar history after in-app confirmation', async ({ page }) => {
  const today = localDateIdentifier(new Date());
  await page.addInitScript(({ solutionsKey, today }) => {
    localStorage.setItem(solutionsKey, JSON.stringify({
      [today]: [{ equation: '1+1=2', timestamp: '2026-07-18T12:00:00Z', seconds: 10, value: '2' }],
    }));
  }, { solutionsKey, today });
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Clear Data' }).click();
  await expect(page.getByRole('dialog', { name: 'Clear Data?' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), solutionsKey)).toBeNull();
});
