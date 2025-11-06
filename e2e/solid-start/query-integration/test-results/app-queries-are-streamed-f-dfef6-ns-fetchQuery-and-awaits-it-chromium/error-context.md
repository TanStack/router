# Test info

- Name: queries are streamed from the server >> direct visit - loader on server runs fetchQuery and awaits it
- Location: /Users/kylemathews/programs/router/e2e/solid-start/query-integration/tests/app.spec.ts:5:3

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
   1 | import { expect } from '@playwright/test'
   2 | import { test } from '@tanstack/router-e2e-utils'
   3 |
   4 | test.describe('queries are streamed from the server', () => {
>  5 |   test('direct visit - loader on server runs fetchQuery and awaits it', async ({
     |   ^ Error: browserType.launch: Executable doesn't exist at /Users/kylemathews/Library/Caches/ms-playwright/chromium_headless_shell-1169/chrome-mac/headless_shell
   6 |     page,
   7 |   }) => {
   8 |     await page.goto('/loader-fetchQuery/sync')
   9 |
  10 |     const queryData = page.getByTestId('query-data')
  11 |     await expect(queryData).toHaveText('server')
  12 |
  13 |     const loaderData = page.getByTestId('loader-data')
  14 |     await expect(loaderData).toHaveText('server')
  15 |   })
  16 |   test('direct visit - loader on server runs fetchQuery and does not await it', async ({
  17 |     page,
  18 |   }) => {
  19 |     await page.goto('/loader-fetchQuery/async')
  20 |
  21 |     const queryData = page.getByTestId('query-data')
  22 |     await expect(queryData).toHaveText('server')
  23 |
  24 |     const loaderData = page.getByTestId('loader-data')
  25 |     await expect(loaderData).toHaveText('undefined')
  26 |   })
  27 |
  28 |   test('useQuery', async ({ page }) => {
  29 |     await page.goto('/useQuery')
  30 |
  31 |     const queryData = page.getByTestId('query-data')
  32 |     await expect(queryData).toHaveText('server')
  33 |   })
  34 | })
  35 |
```