import { createServer } from 'node:http'
import { expect } from '@playwright/test'
import { test as base } from '@tanstack/router-e2e-utils'
import type { Page } from '@playwright/test'
import type { AddressInfo } from 'node:net'

const test = base.extend({
  page: async ({ page }, use) => {
    const errors: Array<string> = []
    page.on('pageerror', (error) => errors.push(error.message))
    await use(page)
    expect(errors).toEqual([])
  },
})

async function createGate() {
  let release!: () => void
  let arrivedResolve!: () => void
  const arrived = new Promise<void>((resolve) => {
    arrivedResolve = resolve
  })
  const gateServer = createServer((_request, response) => {
    release = () => response.end('ready')
    arrivedResolve()
  })
  await new Promise<void>((resolve) =>
    gateServer.listen(0, '127.0.0.1', resolve),
  )
  return {
    port: (gateServer.address() as AddressInfo).port,
    async release() {
      await arrived
      release()
    },
    async close() {
      gateServer.closeAllConnections()
      await new Promise<void>((resolve) => gateServer.close(() => resolve()))
    },
  }
}

async function awaitPageLoaded(page: Page) {
  // wait for page to be loaded by waiting for the ClientOnly component to be rendered

  await expect(page.getByTestId('router-isLoading')).toContainText('false')
  await expect(page.getByTestId('router-status')).toContainText('idle')
}
async function checkData(page: Page, id: string) {
  const expectedData = await page
    .getByTestId(`${id}-car-expected`)
    .textContent()
  expect(expectedData).not.toBeNull()
  await expect(page.getByTestId(`${id}-car-actual`)).toContainText(
    expectedData!,
  )

  await expect(page.getByTestId(`${id}-foo`)).toContainText(
    '{"value":"server"}',
  )
  await page.getByTestId(`${id}-honk`).click()
  await expect(page.getByTestId(`${id}-honk`)).toHaveText('Honk! Honk!')
}

async function checkNestedData(page: Page) {
  const expectedShout = await page
    .getByTestId(`shout-expected-state`)
    .textContent()
  expect(expectedShout).not.toBeNull()
  await expect(page.getByTestId(`shout-actual-state`)).toContainText(
    expectedShout!,
  )

  const expectedWhisper = await page
    .getByTestId(`whisper-expected-state`)
    .textContent()
  expect(expectedWhisper).not.toBeNull()
  await expect(page.getByTestId(`whisper-actual-state`)).toContainText(
    expectedWhisper!,
  )
}
test.use({
  whitelistErrors: [
    'Failed to load resource: the server responded with a status of 499',
  ],
})
test.describe('SSR serialization adapters', () => {
  test(`data-only`, async ({ page }) => {
    await page.goto('/ssr/data-only')
    await awaitPageLoaded(page)

    await Promise.all(
      ['context', 'loader'].map(async (id) => checkData(page, id)),
    )

    const expectedHonkData = await page
      .getByTestId('honk-expected-state')
      .textContent()
    expect(expectedHonkData).not.toBeNull()
    await expect(page.getByTestId('honk-actual-state')).toContainText(
      expectedHonkData!,
    )
  })

  test('stream', async ({ page }) => {
    await page.goto('/ssr/stream')
    await awaitPageLoaded(page)
    await checkData(page, 'stream')
    await page.waitForLoadState('load')
    await expect.poll(() => page.evaluate(() => !!window.$_TSR)).toBe(false)
  })

  test('stream with delayed hydration', async ({ page }) => {
    const first = await createGate()
    const second = await createGate()
    let releaseScripts!: () => void
    const scriptsReady = new Promise<void>((resolve) => {
      releaseScripts = resolve
    })
    await page.route('**/*.js', async (route) => {
      await scriptsReady
      await route.continue()
    })

    try {
      const response = await page.goto(
        `/ssr/stream?gatePort=${first.port}&secondGatePort=${second.port}`,
        { waitUntil: 'commit' },
      )
      await Promise.all([first.release(), second.release()])
      await response!.finished()
      // Streamed HTML must appear even while the application bundle is held.
      await expect(page.getByTestId('stream-car-actual')).toBeVisible()
      await expect(page.getByTestId('stream-second-car-actual')).toBeVisible()
    } finally {
      releaseScripts()
      await first.close()
      await second.close()
    }

    await awaitPageLoaded(page)
    await checkData(page, 'stream')
    await checkData(page, 'stream-second')
    await page.waitForLoadState('load')
    await expect.poll(() => page.evaluate(() => !!window.$_TSR)).toBe(false)
  })

  test('stream after interaction, followed by another resource', async ({
    page,
  }) => {
    const first = await createGate()
    const second = await createGate()
    try {
      await page.goto(
        `/ssr/stream?gatePort=${first.port}&secondGatePort=${second.port}`,
        { waitUntil: 'commit' },
      )
      await awaitPageLoaded(page)
      await page.getByTestId('stream-heading').click()
      await first.release()
      await checkData(page, 'stream')
      await expect(page.getByTestId('stream-second-car-expected')).toHaveCount(
        0,
      )
      await second.release()
      await checkData(page, 'stream-second')
      await page.waitForLoadState('load')
      await expect.poll(() => page.evaluate(() => !!window.$_TSR)).toBe(false)
    } finally {
      await first.close()
      await second.close()
    }
  })

  test('buffered stream under nonce-based CSP', async ({ page }) => {
    await page.route('**/ssr/stream', async (route) => {
      const response = await route.fetch()
      await route.fulfill({
        response,
        headers: {
          ...response.headers(),
          'content-security-policy':
            "script-src 'nonce-serialization-adapters-test' 'strict-dynamic'; object-src 'none'; base-uri 'self'",
        },
      })
    })
    await page.goto('/ssr/stream')
    await awaitPageLoaded(page)
    await checkData(page, 'stream')
  })

  test('nested', async ({ page }) => {
    await page.goto('/ssr/nested')
    await awaitPageLoaded(page)

    await checkNestedData(page)
  })

  test.describe('bot response', () => {
    test.use({ userAgent: 'Googlebot' })
    test('stream', async ({ page }) => {
      await page.goto('/ssr/stream')
      await awaitPageLoaded(page)
      await checkData(page, 'stream')
    })
  })
})

test.describe('server functions serialization adapters', () => {
  test('custom error', async ({ page }) => {
    await page.goto('/server-function/custom-error')
    await awaitPageLoaded(page)

    await expect(
      page.getByTestId('server-function-valid-response'),
    ).toContainText('null')
    await expect(
      page.getByTestId('server-function-invalid-response'),
    ).toContainText('null')

    await page.getByTestId('server-function-valid-input').click()
    await expect(
      page.getByTestId('server-function-valid-response'),
    ).toContainText('Hello, world!')

    await page.getByTestId('server-function-invalid-input').click()
    await expect(
      page.getByTestId('server-function-invalid-response'),
    ).toContainText('{"message":"Invalid input","foo":"bar","bar":"123"}')
  })
  test('nested', async ({ page }) => {
    await page.goto('/server-function/nested')
    await awaitPageLoaded(page)

    await expect(page.getByTestId('waiting-for-response')).toContainText(
      'waiting for response...',
    )

    await page.getByTestId('server-function-trigger').click()
    await checkNestedData(page)
  })
})
