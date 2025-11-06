# Test info

- Name: Navigating to a not-found route
- Location: /Users/kylemathews/programs/router/e2e/solid-start/basic-solid-query/tests/app.spec.ts:30:1

# Error details

```
Error: browserType.launch: Executable doesn't exist at /Users/kylemathews/Library/Caches/ms-playwright/chromium_headless_shell-1169/chrome-mac/headless_shell
╔═════════════════════════════════════════════════════════════════════════╗
║ Looks like Playwright Test or Playwright was just installed or updated. ║
║ Please run the following command to download new browsers:              ║
║                                                                         ║
║     pnpm exec playwright install                                        ║
║                                                                         ║
║ <3 Playwright Team                                                      ║
╚═════════════════════════════════════════════════════════════════════════╝
```

# Test source

```ts
   1 | import { expect, test } from '@playwright/test'
   2 |
   3 | test('Navigating to post', async ({ page }) => {
   4 |   await page.goto('/')
   5 |
   6 |   await page.getByRole('link', { name: 'Posts' }).click()
   7 |   await page.getByRole('link', { name: 'sunt aut facere repe' }).click()
   8 |   await page.getByRole('link', { name: 'Deep View' }).click()
   9 |   await expect(page.getByRole('heading')).toContainText('sunt aut facere')
  10 | })
  11 |
  12 | test('Navigating to user', async ({ page }) => {
  13 |   await page.goto('/')
  14 |
  15 |   await page.getByRole('link', { name: 'Users' }).click()
  16 |   await page.getByRole('link', { name: 'Leanne Graham' }).click()
  17 |   await expect(page.getByRole('heading')).toContainText('Leanne Graham')
  18 | })
  19 |
  20 | test('Navigating nested layouts', async ({ page }) => {
  21 |   await page.goto('/')
  22 |
  23 |   await page.getByRole('link', { name: 'Layout', exact: true }).click()
  24 |   await page.getByRole('link', { name: 'Layout A' }).click()
  25 |   await expect(page.locator('body')).toContainText("I'm A!")
  26 |   await page.getByRole('link', { name: 'Layout B' }).click()
  27 |   await expect(page.locator('body')).toContainText("I'm B!")
  28 | })
  29 |
> 30 | test('Navigating to a not-found route', async ({ page }) => {
     | ^ Error: browserType.launch: Executable doesn't exist at /Users/kylemathews/Library/Caches/ms-playwright/chromium_headless_shell-1169/chrome-mac/headless_shell
  31 |   await page.goto('/')
  32 |
  33 |   await page.getByRole('link', { name: 'This Route Does Not Exist' }).click()
  34 |   await page.getByRole('link', { name: 'Start Over' }).click()
  35 |   await expect(page.getByRole('heading')).toContainText('Welcome Home!')
  36 | })
  37 |
  38 | test('Manual Suspense boundaries should transition on navigation', async ({
  39 |   page,
  40 | }) => {
  41 |   // Navigate to the suspense transition test page
  42 |   await page.goto('/suspense-transition')
  43 |
  44 |   // Wait for initial content to load
  45 |   await expect(page.getByTestId('n-value')).toHaveText('1')
  46 |   await expect(page.getByTestId('double-value')).toHaveText('2')
  47 |
  48 |   // Click the increase button to trigger navigation with search params change
  49 |   await page.getByTestId('increase-button').click()
  50 |
  51 |   // During the transition, the old content should remain visible
  52 |   // and the fallback should NOT be shown
  53 |   await expect(page.getByTestId('suspense-fallback')).not.toBeVisible({
  54 |     timeout: 100,
  55 |   })
  56 |
  57 |   // The old content should still be visible during transition
  58 |   await expect(page.getByTestId('suspense-content')).toBeVisible()
  59 |
  60 |   // After transition completes, new content should be visible
  61 |   await expect(page.getByTestId('n-value')).toHaveText('2')
  62 |   await expect(page.getByTestId('double-value')).toHaveText('4')
  63 | })
  64 |
```