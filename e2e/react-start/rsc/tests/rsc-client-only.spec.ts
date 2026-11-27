import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'
import { waitForHydration } from './hydration'
import type { Page } from '@playwright/test'

// <ClientOnly> in server components (coverage review C, finding 1): the
// server's HTML holds the fallback, the browser renders the children after
// hydration, and they work.
async function expectChildren(page: Page) {
  for (const label of ['panel', 'composite']) {
    const counter = page.getByTestId(`client-only-counter-${label}`)
    await expect(counter).toHaveText(`${label}: 0`)
    await counter.click()
    await expect(counter).toHaveText(`${label}: 1`)
    await expect(
      page.getByTestId(`rsc-client-only-${label}-fallback`),
    ).toHaveCount(0)
  }
  await expect(page.getByTestId('rsc-client-only-slot')).toHaveText(
    'slot content',
  )
}

test.describe('RSC <ClientOnly>', () => {
  test('the server HTML holds the fallbacks, not the children', async ({
    page,
  }) => {
    const html = await (await page.request.get('/rsc-client-only')).text()
    expect(html).toContain('data-testid="rsc-client-only-panel-fallback"')
    expect(html).toContain('data-testid="rsc-client-only-composite-fallback"')
    expect(html).not.toContain('data-testid="client-only-counter-')
  })

  test('the children render and work after hydration (document load)', async ({
    page,
  }) => {
    await page.goto('/rsc-client-only')
    await waitForHydration(page)
    await expectChildren(page)
  })

  test('the children render and work after client-side navigation', async ({
    page,
  }) => {
    await page.goto('/')
    await waitForHydration(page)
    // a document reload would drop it
    await page.evaluate(() => {
      document.body.dataset.clientNavigation = 'same document'
    })
    await page.getByTestId('nav-client-only').click()
    await expect(page).toHaveURL('/rsc-client-only')
    await expectChildren(page)
    await expect(page.locator('body')).toHaveAttribute(
      'data-client-navigation',
      'same document',
    )
  })
})
