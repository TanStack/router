import { expect, test as base } from '@playwright/test'
import type { Page } from '@playwright/test'

const immediateDataMarker = 'data-testid="immediate-data"'
const renderedDeferredMarker = 'data-testid="deferred-data"'

const browserUserAgent =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'

export async function expectDeferredRouteResponseOrder(
  baseURL: string | undefined,
) {
  if (!baseURL) {
    throw new Error('Playwright baseURL is required')
  }

  const response = await fetch(new URL('/deferred', baseURL), {
    headers: {
      accept: 'text/html',
      'accept-encoding': 'identity',
      'user-agent': browserUserAgent,
    },
  })

  expect(response.status).toBe(200)
  expect(response.body).not.toBeNull()

  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let html = ''

  for (;;) {
    const { done, value } = await reader.read()

    if (done) {
      break
    }

    html += decoder.decode(value, { stream: true })
  }

  html += decoder.decode()

  const responsePreview =
    html.length > 2000
      ? `${html.slice(0, 1000)}\n...\n${html.slice(-1000)}`
      : html

  const immediateDataIndex = html.indexOf(immediateDataMarker)
  const renderedDeferredIndex = html.indexOf(renderedDeferredMarker)
  expect(immediateDataIndex, responsePreview).toBeGreaterThanOrEqual(0)
  expect(renderedDeferredIndex, responsePreview).toBeGreaterThan(
    immediateDataIndex,
  )

  // SSR Query closes its request-local stream after renderer EOF. Its final
  // record is the deterministic late router output for this test.
  const boundaryIndex = html.indexOf('/*$tsr-stream-boundary*/')
  const routerEndIndex = html.indexOf('$_TSR.e()')

  expect(boundaryIndex).toBeGreaterThan(-1)
  expect(boundaryIndex).toBeLessThan(routerEndIndex)
  expect(renderedDeferredIndex).toBeLessThan(routerEndIndex)

  expectCompleteRouterStreamBeforeDocumentCloses(html, renderedDeferredMarker, {
    expectReturn: true,
  })
}

export async function expectQueryHeavyRouteStreamOrder(
  baseURL: string | undefined,
) {
  if (!baseURL) {
    throw new Error('Playwright baseURL is required')
  }

  const response = await fetch(new URL('/query-heavy', baseURL), {
    headers: {
      accept: 'text/html',
      'accept-encoding': 'identity',
      'user-agent': browserUserAgent,
    },
  })

  expect(response.status).toBe(200)
  const html = await response.text()

  expect(html).toContain('data-testid="fast-async-query-1"')
  expect(html).toContain('data-testid="slow-async-query-3"')
  expectCompleteRouterStreamBeforeDocumentCloses(html, '"slow-async-3"', {
    expectReturn: true,
  })
}

function expectCompleteRouterStreamBeforeDocumentCloses(
  html: string,
  payloadMarker: string,
  options: { expectReturn?: boolean } = {},
) {
  const endIndex = html.indexOf('$_TSR.e()')
  const payloadIndex = html.indexOf(payloadMarker)
  const scriptOpenIndex = html.lastIndexOf('<script', endIndex)
  const previousScriptCloseIndex = html.lastIndexOf('</script>', endIndex)
  const scriptCloseIndex = html.indexOf('</script>', endIndex)
  const bodyCloseIndex = html.indexOf('</body>', scriptCloseIndex)
  const htmlCloseIndex = html.indexOf('</html>', bodyCloseIndex)

  expect(endIndex).toBeGreaterThan(-1)
  expect(scriptOpenIndex).toBeGreaterThan(previousScriptCloseIndex)
  expect(scriptCloseIndex).toBeGreaterThan(endIndex)
  expect(payloadIndex).toBeGreaterThan(-1)
  expect(payloadIndex).toBeLessThan(endIndex)
  if (options.expectReturn) {
    expect(html.slice(scriptOpenIndex, endIndex)).toContain('.return(void 0)')
  }
  expect(html.slice(endIndex, scriptCloseIndex)).toContain(
    'document.currentScript.remove()',
  )
  expect(scriptCloseIndex).toBeLessThan(bodyCloseIndex)
  expect(bodyCloseIndex).toBeLessThan(htmlCloseIndex)
}

async function verifyHydration(
  page: Page,
  { timeout = 10_000 }: { timeout?: number } = {},
) {
  const button = page.getByTestId('hydration-check-btn')
  const status = page.getByTestId('hydration-status')

  await expect(button).toBeVisible()
  await expect(async () => {
    await button.click()
    await expect(status).toHaveText('hydrated', { timeout: 100 })
  }).toPass({ timeout })

  await expect(page.locator('[data-tsr-stream-part]')).toHaveCount(0)
  await expect(
    page.locator('script').filter({ hasText: '$tsr-stream-boundary' }),
  ).toHaveCount(0)
}

type StreamingSsrOptions = {
  whitelistErrors: Array<RegExp | string>
}

export const test = base.extend<StreamingSsrOptions>({
  whitelistErrors: [[], { option: true }],
  page: async ({ page, whitelistErrors }, use) => {
    const errorMessages: Array<string> = []

    page.on('console', (message) => {
      if (message.type() !== 'error') {
        return
      }
      const text = message.text()
      const whitelisted = whitelistErrors.some((value) =>
        typeof value === 'string' ? text.includes(value) : value.test(text),
      )
      if (!whitelisted) {
        errorMessages.push(text)
      }
    })

    await use(page)
    expect(errorMessages).toEqual([])
  },
})

export const testWithHydration = test.extend({
  page: async ({ page }, use) => {
    await use(page)
    await verifyHydration(page)
  },
})

export { expect }
