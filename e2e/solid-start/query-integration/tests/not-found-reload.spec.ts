import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

// Regression test for defaultNotFoundComponent poisoning hydration: the
// default used to be applied by lazily mutating the boundary route's
// `options.notFoundComponent` when a notFound was handled (load-matches).
// Route objects are module singletons shared across server requests, so once
// the server had handled any 404, later SSRs of *valid* URLs wrapped the
// route's Match in a CatchNotFound boundary that a freshly-hydrating client
// (which never runs that mutation) doesn't render — every _hk under the match
// shifted and hydration left the subtree unclaimed: visible but inert DOM.
// Fixed by resolving defaultNotFoundComponent at render time in Match.tsx so
// the boundary structure is deterministic on both server and client.
test.describe('reload after the server handled a 404 (defaultNotFoundComponent)', () => {
  test('direct visit after a 404 - SSR DOM is claimed and interactive', async ({
    page,
  }) => {
    const hydrationWarnings: Array<string> = []
    page.on('console', (msg) => {
      if (msg.text().includes('unclaimed server-rendered')) {
        hydrationWarnings.push(msg.text())
      }
    })

    // Make the server handle a notFound for this route first. Before the fix
    // this permanently mutated the route singleton on the server.
    const notFoundResponse = await page.request.get('/not-found-reload/missing')
    expect(notFoundResponse.status()).toBe(404)

    // Now a direct visit (SSR + hydration) of a valid URL on the same route.
    await page.goto('/not-found-reload/ok')

    const heading = page.getByTestId('not-found-reload-heading')
    await expect(heading).toHaveText('id: ok')
    await expect(
      page.getByTestId('not-found-reload-list').locator('li'),
    ).toHaveCount(3)

    // Dev-mode signal (no-op in production builds)
    expect(hydrationWarnings).toEqual([])

    // Interactivity probe: if hydration failed to claim the SSR DOM, no event
    // handler is bound and the click does nothing.
    const button = page.getByTestId('not-found-reload-button')
    await button.click()
    await expect(button).toHaveAttribute('data-clicked', 'true')
  })

  test.describe('404 page itself', () => {
    // Navigating straight to a 404 URL logs the browser's own
    // "Failed to load resource" console error for the document request.
    test.use({
      whitelistErrors: [/Failed to load resource.*404/],
    })

    test('reloading the 404 page itself hydrates the default not-found', async ({
      page,
    }) => {
      const hydrationWarnings: Array<string> = []
      page.on('console', (msg) => {
        if (msg.text().includes('unclaimed server-rendered')) {
          hydrationWarnings.push(msg.text())
        }
      })

      await page.goto('/not-found-reload/missing')

      await expect(page.getByText('Not Found')).toBeVisible()
      expect(hydrationWarnings).toEqual([])
    })
  })
})
