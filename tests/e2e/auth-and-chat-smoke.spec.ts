import { expect, test } from '@playwright/test';

test('Anmeldeseite lädt und Chat schützt ohne Session', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'LocalChat Anmeldung' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Anmelden' })).toBeVisible();

  await page.goto('/chat');
  await expect(page).toHaveURL(/\/$/);
});
