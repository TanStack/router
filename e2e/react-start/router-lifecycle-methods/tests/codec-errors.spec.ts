import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'
import { awaitHydrated, hydrationErrorPattern, readClientRuns } from './utils'

// Codecs are transforms, not lifecycles. A throw inside `dehydrate` fails
// the match like a throw inside the handler, and a `redirect()` thrown from it
// is an ordinary error, never a redirect. A throw inside `hydrate` hands the
// match to the client load that follows hydration, which re-runs the handler.
//
// Only the server-side `dehydrate` failures reach the browser console. Keep
// every entry a string: the shared fixture receives this array through
// `test.use`, and Playwright reads an array whose second element is an object
// (a RegExp included) as a fixture tuple, which silently drops the whitelist.
test.use({
  whitelistErrors: [
    'TSR_E2E_DEHYDRATE_THROW',
    'Invalid throw from dehydrate',
    'Failed to load resource: the server responded with a status of 500',
  ],
})

test.describe('codec error - dehydrate throws on the server', () => {
  test('SSR: the route errorComponent is in the HTML with status 500', async ({
    page,
  }) => {
    const response = await page.goto('/codec-error-dehydrate-throws')
    expect(response?.status()).toBe(500)
    const html = await response!.text()
    expect(html).toContain('data-testid="cedt-error-component"')
    expect(html).not.toContain('data-testid="cedt-component"')

    await awaitHydrated(page)
    await expect(page.getByTestId('cedt-error-component')).toBeVisible()
    await expect(page.getByTestId('cedt-error-component')).toContainText(
      'TSR_E2E_DEHYDRATE_THROW',
    )
    await expect(page.getByTestId('cedt-component')).not.toBeVisible()
  })

  test('client nav: dehydrate does not run in the browser, the route renders', async ({
    page,
  }) => {
    await page.goto('/')
    await awaitHydrated(page)
    await page.getByTestId('link-codec-error-dehydrate-throws').click()
    await expect(page.getByTestId('cedt-value')).toHaveText('loader-value')
  })
})

test.describe('codec error - hydrate throws on the client', () => {
  test('SSR: the client load re-runs the handler and the route renders its value', async ({
    page,
  }) => {
    const hydrationErrors: Array<string> = []
    page.on('console', (message) => {
      if (
        message.type() === 'error' &&
        hydrationErrorPattern.test(message.text())
      ) {
        hydrationErrors.push(message.text())
      }
    })
    const response = await page.goto('/codec-error-hydrate-throws')
    // the server succeeded; only the client-side transform fails
    expect(response?.status()).toBe(200)

    await awaitHydrated(page)
    await expect(page.getByTestId('ceht-guard')).toHaveText('ok')
    await expect(page.getByTestId('ceht-error-component')).toHaveCount(0)
    // The rendered value comes from the handler's client run.
    expect((await readClientRuns(page))['ceht-beforeLoad']).toBe(1)
    // data-only route: nothing of it was server-rendered, so there is no
    // hydration mismatch either
    expect(hydrationErrors).toEqual([])
  })

  test('client nav: hydrate is not involved, the route renders', async ({
    page,
  }) => {
    await page.goto('/')
    await awaitHydrated(page)
    await page.getByTestId('link-codec-error-hydrate-throws').click()
    await expect(page.getByTestId('ceht-guard')).toHaveText('ok')
  })
})

test.describe('codec error - redirect thrown from dehydrate', () => {
  test('SSR: it is an error at the same URL, not a redirect', async ({
    page,
  }) => {
    const response = await page.goto('/codec-error-dehydrate-redirect')
    // no redirect happened: same URL, error status, error component
    expect(response?.status()).toBe(500)
    expect(new URL(response!.url()).pathname).toBe(
      '/codec-error-dehydrate-redirect',
    )
    expect(response?.request().redirectedFrom()).toBeNull()
    await expect(page).toHaveURL(/\/codec-error-dehydrate-redirect$/)
    const html = await response!.text()
    expect(html).toContain('data-testid="cedr-error-component"')

    await awaitHydrated(page)
    await expect(page).toHaveURL(/\/codec-error-dehydrate-redirect$/)
    await expect(page.getByTestId('cedr-error-component')).toBeVisible()
    await expect(page.getByTestId('cedr-error-component')).toContainText(
      'dehydrate',
    )
    await expect(page.getByTestId('index-heading')).not.toBeVisible()
  })
})

test.describe('codec error - hydrate throws on the client, ssr: true route', () => {
  // The server rendered the component; the client load re-runs the loader
  // handler, which produces the same value, so the component stays.
  test.use({ whitelistErrors: [] })

  test('SSR: the HTML has the component, the client load re-runs the handler and keeps it', async ({
    page,
  }) => {
    const response = await page.goto('/codec-error-hydrate-throws-ssr')
    // the server succeeded and rendered the handler's value
    expect(response?.status()).toBe(200)
    const html = await response!.text()
    expect(html).toContain('data-testid="cehts-component"')
    expect(html).toContain('ssr-loader-value')
    expect(html).not.toContain('data-testid="cehts-error-component"')

    await awaitHydrated(page)
    await expect(page.getByTestId('cehts-value')).toHaveText('ssr-loader-value')
    await expect(page.getByTestId('cehts-error-component')).toHaveCount(0)
    // The rendered value comes from the handler's client run.
    expect((await readClientRuns(page))['cehts-loader']).toBe(1)
  })

  test('client nav: hydrate is not involved, the route renders', async ({
    page,
  }) => {
    await page.goto('/')
    await awaitHydrated(page)
    await page.getByTestId('link-codec-error-hydrate-throws-ssr').click()
    await expect(page.getByTestId('cehts-value')).toHaveText('ssr-loader-value')
    await expect(page.getByTestId('cehts-error-component')).toHaveCount(0)
  })
})
