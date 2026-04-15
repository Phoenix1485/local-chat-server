# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth-and-chat-smoke.spec.ts >> Anmeldeseite lädt und Chat schützt ohne Session
- Location: tests\e2e\auth-and-chat-smoke.spec.ts:3:5

# Error details

```
Error: page.goto: net::ERR_CONNECTION_RESET at http://127.0.0.1:8080/
Call log:
  - navigating to "http://127.0.0.1:8080/", waiting until "load"

```

# Test source

```ts
  1  | import { expect, test } from '@playwright/test';
  2  | 
  3  | test('Anmeldeseite lädt und Chat schützt ohne Session', async ({ page }) => {
> 4  |   await page.goto('/');
     |              ^ Error: page.goto: net::ERR_CONNECTION_RESET at http://127.0.0.1:8080/
  5  |   await expect(page.getByRole('heading', { name: 'LocalChat Anmeldung' })).toBeVisible();
  6  |   await expect(page.getByRole('button', { name: 'Anmelden' })).toBeVisible();
  7  | 
  8  |   await page.goto('/chat');
  9  |   await expect(page).toHaveURL(/\/$/);
  10 | });
  11 | 
```