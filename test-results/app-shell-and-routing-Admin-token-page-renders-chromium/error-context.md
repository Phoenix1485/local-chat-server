# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: app-shell-and-routing.spec.ts >> Admin token page renders
- Location: tests\e2e\app-shell-and-routing.spec.ts:8:5

# Error details

```
Error: page.goto: net::ERR_CONNECTION_RESET at http://127.0.0.1:8080/admin/token
Call log:
  - navigating to "http://127.0.0.1:8080/admin/token", waiting until "load"

```

# Test source

```ts
  1  | import { expect, test } from '@playwright/test';
  2  | 
  3  | test('Admin panel renders without crashing', async ({ page }) => {
  4  |   await page.goto('/admin');
  5  |   await expect(page.getByRole('heading', { name: 'Admin-Panel' })).toBeVisible();
  6  | });
  7  | 
  8  | test('Admin token page renders', async ({ page }) => {
> 9  |   await page.goto('/admin/token');
     |              ^ Error: page.goto: net::ERR_CONNECTION_RESET at http://127.0.0.1:8080/admin/token
  10 |   await expect(page.getByRole('heading', { name: 'Admin-Token' })).toBeVisible();
  11 | });
  12 | 
  13 | test('Profile redirects to auth without session', async ({ page }) => {
  14 |   await page.goto('/profile');
  15 |   await expect(page).toHaveURL(/\/$/);
  16 | });
  17 | 
  18 | test('Waiting redirects to auth without session', async ({ page }) => {
  19 |   await page.goto('/waiting');
  20 |   await expect(page).toHaveURL(/\/$/);
  21 | });
  22 | 
  23 | test('Auth tabs switch forms', async ({ page }) => {
  24 |   await page.goto('/');
  25 |   await page.getByRole('button', { name: 'Registrieren' }).click();
  26 |   await expect(page.getByPlaceholder('z.B. lenfox')).toBeVisible();
  27 | 
  28 |   await page.getByRole('button', { name: 'Passwort vergessen' }).click();
  29 |   await expect(page.getByRole('button', { name: 'Zurücksetzen anfordern' })).toBeVisible();
  30 | 
  31 |   await page.getByRole('button', { name: 'Zurücksetzen' }).click();
  32 |   await expect(page.getByPlaceholder('Token einfügen')).toBeVisible();
  33 | });
  34 | 
  35 | test('Main navigation links are visible', async ({ page }) => {
  36 |   await page.goto('/');
  37 |   await expect(page.getByRole('link', { name: 'Anmeldung' })).toBeVisible();
  38 |   await expect(page.getByRole('link', { name: 'Chat' })).toBeVisible();
  39 |   await expect(page.getByRole('link', { name: 'Profil' })).toBeVisible();
  40 |   await expect(page.getByRole('link', { name: 'Admin' })).toBeVisible();
  41 | });
  42 | 
```