import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'
import {
  awaitHydrated,
  collectErrors,
  hydrationErrorPattern,
  hydrationPayload,
  readClientRuns,
} from './utils'

// Lifecycles the server ran but did not transport re-run in place during
// hydration while the match stays committed.

test.describe('in-place re-run - non-transported beforeLoad on an ssr: true route', () => {
  test('SSR HTML has the value, hydration re-runs beforeLoad once, no hydration error, no pending flash', async ({
    page,
  }) => {
    const errors = collectErrors(page)
    const response = await page.goto('/in-place-beforeload')
    expect(response?.status()).toBe(200)
    const html = await response!.text()
    expect(html).toContain('deterministic-42')
    expect(html).toContain('loader-deterministic-42')
    expect(html).not.toContain('data-testid="ipb-pending"')

    await awaitHydrated(page)
    await expect(page.getByTestId('ipb-value')).toHaveText('deterministic-42')
    await expect(page.getByTestId('ipb-loader')).toHaveText(
      'loader-deterministic-42',
    )
    await expect(page.getByTestId('ipb-pending')).toHaveCount(0)

    const runs = await readClientRuns(page)
    // re-run in place exactly once
    expect(runs['ipb-beforeLoad']).toBe(1)
    // the component mounted once; the pending component never rendered
    expect(runs['ipb-mount']).toBe(1)
    expect(runs['ipb-pending']).toBeUndefined()

    expect(errors.filter((e) => hydrationErrorPattern.test(e))).toEqual([])
  })

  test('client nav: beforeLoad runs per load', async ({ page }) => {
    await page.goto('/')
    await awaitHydrated(page)
    await page.getByTestId('link-in-place-beforeload').click()
    await expect(page.getByTestId('ipb-value')).toHaveText('deterministic-42')
    expect((await readClientRuns(page))['ipb-beforeLoad']).toBe(1)

    await page.getByTestId('link-home').click()
    await expect(page.getByTestId('index-heading')).toHaveText('Home')
    await page.getByTestId('link-in-place-beforeload').click()
    await expect(page.getByTestId('ipb-value')).toHaveText('deterministic-42')
    expect((await readClientRuns(page))['ipb-beforeLoad']).toBe(2)
  })
})

test.describe('in-place re-run - non-transported loader on a data-only route', () => {
  test('SSR: the client runs the loader exactly once during hydration', async ({
    page,
  }) => {
    const errors = collectErrors(page)
    const response = await page.goto('/in-place-loader')
    const html = await response!.text()
    // data-only: the route component is not server-rendered
    expect(html).not.toContain('data-testid="ipl-component"')

    await awaitHydrated(page)
    await expect(page.getByTestId('ipl-context')).toHaveText('ipl-context')
    await expect(page.getByTestId('ipl-beforeLoad')).toHaveText(
      'ipl-beforeLoad',
    )
    await expect(page.getByTestId('ipl-loader-origin')).toHaveText('client')
    await expect(page.getByTestId('ipl-loader-client-runs')).toHaveText('1')
    expect((await readClientRuns(page))['ipl-loader']).toBe(1)
    expect(errors.filter((e) => hydrationErrorPattern.test(e))).toEqual([])
  })

  test('client nav: loader runs in the browser', async ({ page }) => {
    await page.goto('/')
    await awaitHydrated(page)
    await page.getByTestId('link-in-place-loader').click()
    await expect(page.getByTestId('ipl-loader-origin')).toHaveText('client')
    await expect(page.getByTestId('ipl-loader-client-runs')).toHaveText('1')
  })
})

// A guard-only beforeLoad returns nothing; the server still emits its
// `b` key with `void 0` and the client restores by presence instead of
// re-running the guard during hydration.

test.describe('void guard - presence protocol for an undefined beforeLoad result', () => {
  test('SSR: the payload carries `b: void 0`, hydration does not re-run the guard', async ({
    page,
  }) => {
    const response = await page.goto('/void-guard')
    expect(response?.status()).toBe(200)
    const html = await response!.text()
    const payload = hydrationPayload(html)
    // the void-guard match is the only one whose beforeLoad returned nothing
    expect(payload).toContain('b:void 0')
    expect(payload).toContain('vg-loader')

    await awaitHydrated(page)
    await expect(page.getByTestId('vg-heading')).toHaveText('Void guard')
    await expect(page.getByTestId('vg-loader')).toHaveText('vg-loader')
    // restored from the payload: no client run
    expect((await readClientRuns(page))['vg-beforeLoad']).toBeUndefined()

    // a client navigation runs the guard once
    await page.getByTestId('link-home').click()
    await expect(page.getByTestId('index-heading')).toHaveText('Home')
    await page.getByTestId('link-void-guard').click()
    await expect(page.getByTestId('vg-heading')).toHaveText('Void guard')
    expect((await readClientRuns(page))['vg-beforeLoad']).toBe(1)
  })

  test('client nav: the guard runs per load', async ({ page }) => {
    await page.goto('/')
    await awaitHydrated(page)
    await page.getByTestId('link-void-guard').click()
    await expect(page.getByTestId('vg-heading')).toHaveText('Void guard')
    expect((await readClientRuns(page))['vg-beforeLoad']).toBe(1)

    await page.getByTestId('link-home').click()
    await expect(page.getByTestId('index-heading')).toHaveText('Home')
    await page.getByTestId('link-void-guard').click()
    await expect(page.getByTestId('vg-heading')).toHaveText('Void guard')
    expect((await readClientRuns(page))['vg-beforeLoad']).toBe(2)
  })
})

// A redirect thrown by an in-place re-run during hydration makes that
// match the pending boundary; the client load that follows re-runs it and
// follows the redirect. The child's transported wire value never reaches the
// DOM.

test.describe('in-place redirect - non-transported beforeLoad redirects during hydration', () => {
  test('SSR: the server passes and ships the child wire value, the client re-run redirects home', async ({
    page,
  }) => {
    const errors = collectErrors(page)
    const response = await page.goto('/in-place-redirect/child')
    // the server run of the guard passed: no redirect on the wire
    expect(response?.status()).toBe(200)
    expect(response?.request().redirectedFrom()).toBeNull()
    const html = await response!.text()
    // the child's loader ran on the server and its codec wire value was sent
    expect(hydrationPayload(html)).toContain('TSR_E2E_IPR_WIRE:')
    // data-only: nothing of the subtree is server-rendered
    expect(html).not.toContain('data-testid="ipr-parent"')
    expect(html).not.toContain('data-testid="ipr-child"')

    // the in-place re-run redirected
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByTestId('index-heading')).toHaveText('Home')
    await awaitHydrated(page)
    await expect(page.getByTestId('index-loader')).toHaveText('index-loader')

    const runs = await readClientRuns(page)
    // once in place during hydration, once in the client load that follows
    expect(runs['ipr-beforeLoad']).toBe(2)
    // the child was neither reconstructed (its hydrate did not run) nor mounted
    expect(runs['ipr-child-hydrate']).toBeUndefined()
    expect(runs['ipr-child-mount']).toBeUndefined()
    await expect(page.getByTestId('ipr-parent')).toHaveCount(0)
    await expect(page.getByTestId('ipr-child')).toHaveCount(0)
    // neither the raw wire value nor the hydrated value reached the DOM
    await expect(page.locator('body')).not.toContainText('TSR_E2E_IPR_WIRE')
    await expect(page.locator('body')).not.toContainText('child-plain-value')

    expect(errors).toEqual([])
  })

  test('client nav: the client-only condition redirects on every browser run', async ({
    page,
  }) => {
    await page.goto('/')
    await awaitHydrated(page)
    await page.getByTestId('link-in-place-redirect-child').click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByTestId('index-heading')).toHaveText('Home')
    const runs = await readClientRuns(page)
    expect(runs['ipr-beforeLoad']).toBe(1)
    expect(runs['ipr-child-mount']).toBeUndefined()
    await expect(page.locator('body')).not.toContainText('TSR_E2E_IPR_WIRE')
  })
})
