import { expect, test } from '@playwright/test';

test('Admin panel renders without crashing', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Admin-Panel' })).toBeVisible();
});

test('Admin token page renders', async ({ page }) => {
  await page.goto('/admin/token');
  await expect(page.getByRole('heading', { name: 'Admin-Token' })).toBeVisible();
});

test('Profile redirects to auth without session', async ({ page }) => {
  await page.goto('/profile');
  await expect(page).toHaveURL(/\/$/);
});

test('Waiting redirects to auth without session', async ({ page }) => {
  await page.goto('/waiting');
  await expect(page).toHaveURL(/\/$/);
});

test('Auth tabs switch forms', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Registrieren' }).click();
  await expect(page.getByPlaceholder('z.B. lenfox')).toBeVisible();

  await page.getByRole('button', { name: 'Passwort vergessen' }).click();
  await expect(page.getByRole('button', { name: 'Zurücksetzen anfordern' })).toBeVisible();

  await page.getByRole('button', { name: 'Zurücksetzen' }).click();
  await expect(page.getByPlaceholder('Token einfügen')).toBeVisible();
});

test('Main navigation links are visible', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Anmeldung' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Chat' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Profil' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Admin' })).toBeVisible();
});
