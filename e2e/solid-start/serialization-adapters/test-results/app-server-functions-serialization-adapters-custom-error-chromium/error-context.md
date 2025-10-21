# Test info

- Name: server functions serialization adapters >> custom error
- Location: /Users/admin/repos/tanstack/router/e2e/solid-start/serialization-adapters/tests/app.spec.ts:80:3

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:49955/server-function/custom-error
Call log:
  - navigating to "http://localhost:49955/server-function/custom-error", waiting until "load"

    at /Users/admin/repos/tanstack/router/e2e/solid-start/serialization-adapters/tests/app.spec.ts:81:16
```

# Test source

```ts
   1 | import { expect } from '@playwright/test'
   2 | import { test } from '@tanstack/router-e2e-utils'
   3 | import type { Page } from '@playwright/test'
   4 |
   5 | async function awaitPageLoaded(page: Page) {
   6 |   // wait for page to be loaded by waiting for the ClientOnly component to be rendered
   7 |
   8 |   await expect(page.getByTestId('router-isLoading')).toContainText('false')
   9 |   await expect(page.getByTestId('router-status')).toContainText('idle')
   10 | }
   11 | async function checkData(page: Page, id: string) {
   12 |   const expectedData = await page
   13 |     .getByTestId(`${id}-car-expected`)
   14 |     .textContent()
   15 |   expect(expectedData).not.toBeNull()
   16 |   await expect(page.getByTestId(`${id}-car-actual`)).toContainText(
   17 |     expectedData!,
   18 |   )
   19 |
   20 |   await expect(page.getByTestId(`${id}-foo`)).toContainText(
   21 |     '{"value":"server"}',
   22 |   )
   23 | }
   24 |
   25 | async function checkNestedData(page: Page) {
   26 |   const expectedShout = await page
   27 |     .getByTestId(`shout-expected-state`)
   28 |     .textContent()
   29 |   expect(expectedShout).not.toBeNull()
   30 |   await expect(page.getByTestId(`shout-actual-state`)).toContainText(
   31 |     expectedShout!,
   32 |   )
   33 |
   34 |   const expectedWhisper = await page
   35 |     .getByTestId(`whisper-expected-state`)
   36 |     .textContent()
   37 |   expect(expectedWhisper).not.toBeNull()
   38 |   await expect(page.getByTestId(`whisper-actual-state`)).toContainText(
   39 |     expectedWhisper!,
   40 |   )
   41 | }
   42 | test.use({
   43 |   whitelistErrors: [
   44 |     /Failed to load resource: the server responded with a status of 499/,
   45 |   ],
   46 | })
   47 | test.describe('SSR serialization adapters', () => {
   48 |   test(`data-only`, async ({ page }) => {
   49 |     await page.goto('/ssr/data-only')
   50 |     await awaitPageLoaded(page)
   51 |
   52 |     await Promise.all(
   53 |       ['context', 'loader'].map(async (id) => checkData(page, id)),
   54 |     )
   55 |
   56 |     const expectedHonkData = await page
   57 |       .getByTestId('honk-expected-state')
   58 |       .textContent()
   59 |     expect(expectedHonkData).not.toBeNull()
   60 |     await expect(page.getByTestId('honk-actual-state')).toContainText(
   61 |       expectedHonkData!,
   62 |     )
   63 |   })
   64 |
   65 |   test('stream', async ({ page }) => {
   66 |     await page.goto('/ssr/stream')
   67 |     await awaitPageLoaded(page)
   68 |     await checkData(page, 'stream')
   69 |   })
   70 |
   71 |   test('nested', async ({ page }) => {
   72 |     await page.goto('/ssr/nested')
   73 |     await awaitPageLoaded(page)
   74 |
   75 |     await checkNestedData(page)
   76 |   })
   77 | })
   78 |
   79 | test.describe('server functions serialization adapters', () => {
   80 |   test('custom error', async ({ page }) => {
>  81 |     await page.goto('/server-function/custom-error')
      |                ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:49955/server-function/custom-error
   82 |     await awaitPageLoaded(page)
   83 |
   84 |     await expect(
   85 |       page.getByTestId('server-function-valid-response'),
   86 |     ).toContainText('null')
   87 |     await expect(
   88 |       page.getByTestId('server-function-invalid-response'),
   89 |     ).toContainText('null')
   90 |
   91 |     await page.getByTestId('server-function-valid-input').click()
   92 |     await expect(
   93 |       page.getByTestId('server-function-valid-response'),
   94 |     ).toContainText('Hello, world!')
   95 |
   96 |     await page.getByTestId('server-function-invalid-input').click()
   97 |     await expect(
   98 |       page.getByTestId('server-function-invalid-response'),
   99 |     ).toContainText('{"message":"Invalid input","foo":"bar","bar":"123"}')
  100 |   })
  101 |   test('nested', async ({ page }) => {
  102 |     await page.goto('/server-function/nested')
  103 |     await awaitPageLoaded(page)
  104 |
  105 |     await expect(page.getByTestId('waiting-for-response')).toContainText(
  106 |       'waiting for response...',
  107 |     )
  108 |
  109 |     await page.getByTestId('server-function-trigger').click()
  110 |     await checkNestedData(page)
  111 |   })
  112 | })
  113 |
```