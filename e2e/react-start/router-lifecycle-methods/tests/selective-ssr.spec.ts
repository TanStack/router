import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'
import { awaitHydrated, hydrationPayload, readClientRuns } from './utils'

// `ssr: false` runs nothing on the server, `context` included. The
// markers below exist only in the server branches of the route's lifecycles.
const serverMarkers = [
  'TSR_E2E_SFC_CONTEXT_SERVER',
  'TSR_E2E_SFC_BEFORELOAD_SERVER',
  'TSR_E2E_SFC_LOADER_SERVER',
]

test.describe('ssr: false - context runs on the client only', () => {
  test('SSR: no lifecycle ran on the server, the client runs the context once at hydration', async ({
    page,
  }) => {
    const response = await page.goto('/ssr-false-context')
    expect(response?.status()).toBe(200)
    const html = await response!.text()
    const payload = hydrationPayload(html)
    for (const marker of serverMarkers) {
      expect(html, marker).not.toContain(marker)
      expect(payload, marker).not.toContain(marker)
    }
    // nothing of the route is server-rendered
    expect(html).not.toContain('data-testid="sfc-component"')

    await awaitHydrated(page)
    await expect(page.getByTestId('sfc-heading')).toHaveText(
      'SSR false context',
    )
    await expect(page.getByTestId('sfc-context-origin')).toHaveText(
      'sfc-context-client',
    )
    await expect(page.getByTestId('sfc-context-runs')).toHaveText('1')
    await expect(page.getByTestId('sfc-beforeLoad-origin')).toHaveText(
      'sfc-beforeLoad-client',
    )
    await expect(page.getByTestId('sfc-loader-origin')).toHaveText(
      'sfc-loader-client',
    )
    expect((await readClientRuns(page))['sfc-context']).toBe(1)
    // the root (ssr: true) still transported its own lifecycles
    expect(payload).toContain('root-beforeLoad')
  })

  test('round trip after SSR: the context is memoized per match', async ({
    page,
  }) => {
    await page.goto('/ssr-false-context')
    await awaitHydrated(page)
    await expect(page.getByTestId('sfc-context-runs')).toHaveText('1')

    await page.getByTestId('link-home').click()
    await expect(page.getByTestId('index-heading')).toHaveText('Home')
    await page.getByTestId('link-ssr-false-context').click()
    await expect(page.getByTestId('sfc-heading')).toHaveText(
      'SSR false context',
    )
    await expect(page.getByTestId('sfc-context-runs')).toHaveText('1')
    expect((await readClientRuns(page))['sfc-context']).toBe(1)
  })

  test('client nav: everything runs in the browser, the context once', async ({
    page,
  }) => {
    await page.goto('/')
    await awaitHydrated(page)
    await page.getByTestId('link-ssr-false-context').click()
    await expect(page.getByTestId('sfc-heading')).toHaveText(
      'SSR false context',
    )
    await expect(page.getByTestId('sfc-context-origin')).toHaveText(
      'sfc-context-client',
    )
    await expect(page.getByTestId('sfc-context-runs')).toHaveText('1')
    await expect(page.getByTestId('sfc-loader-origin')).toHaveText(
      'sfc-loader-client',
    )
  })
})
