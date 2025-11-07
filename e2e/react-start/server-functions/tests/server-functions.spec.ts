import * as fs from 'node:fs'
import { expect } from '@playwright/test'
import { getTestServerPort, test } from '@tanstack/router-e2e-utils'
import packageJson from '../package.json' with { type: 'json' }
import type { Page } from '@playwright/test'

const PORT = await getTestServerPort(packageJson.name)

test('Server function URLs correctly include constant ids', async ({
  page,
}) => {
  for (const currentPage of ['/submit-post-formdata', '/formdata-redirect']) {
    await page.goto(currentPage)
    await page.waitForLoadState('networkidle')

    const form = page.locator('form')
    const actionUrl = await form.getAttribute('action')

    expect(actionUrl).toMatch(/^\/_serverFn\/constant_id/)
  }
})

test('invoking a server function with custom response status code', async ({
  page,
}) => {
  await page.goto('/status')

  await page.waitForLoadState('networkidle')

  const requestPromise = new Promise<void>((resolve) => {
    page.on('response', (response) => {
      expect(response.status()).toBe(225)
      expect(response.statusText()).toBe('hello')
      expect(response.headers()['content-type']).toContain('application/json')
      resolve()
    })
  })
  await page.getByTestId('invoke-server-fn').click()
  await requestPromise
})

test('Consistent server function returns both on client and server for GET and POST calls', async ({
  page,
}) => {
  await page.goto('/consistent')

  await page.waitForLoadState('networkidle')
  const expected =
    (await page
      .getByTestId('expected-consistent-server-fns-result')
      .textContent()) || ''
  expect(expected).not.toBe('')

  await page.getByTestId('test-consistent-server-fn-calls-btn').click()
  await page.waitForLoadState('networkidle')

  // GET calls
  await expect(page.getByTestId('cons_serverGetFn1-response')).toContainText(
    expected,
  )
  await expect(page.getByTestId('cons_getFn1-response')).toContainText(expected)

  // POST calls
  await expect(page.getByTestId('cons_serverPostFn1-response')).toContainText(
    expected,
  )
  await expect(page.getByTestId('cons_postFn1-response')).toContainText(
    expected,
  )
})

test('submitting multipart/form-data as server function input', async ({
  page,
}) => {
  await page.goto('/multipart')

  await page.waitForLoadState('networkidle')
  const expected =
    (await page
      .getByTestId('expected-multipart-server-fn-result')
      .textContent()) || ''
  expect(expected).not.toBe('')

  const fileChooserPromise = page.waitForEvent('filechooser')
  await page.getByTestId('multipart-form-file-input').click()
  const fileChooser = await fileChooserPromise
  await fileChooser.setFiles({
    name: 'my_file.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('test data', 'utf-8'),
  })
  await page.getByText('Submit (onClick)').click()
  await page.waitForLoadState('networkidle')

  await expect(page.getByTestId('multipart-form-response')).toContainText(
    expected,
  )
})

test('isomorphic functions can have different implementations on client and server', async ({
  page,
}) => {
  await page.goto('/isomorphic-fns')

  await page.waitForLoadState('networkidle')

  await page.getByTestId('test-isomorphic-results-btn').click()
  await page.waitForLoadState('networkidle')

  await expect(page.getByTestId('server-result')).toContainText('server')
  await expect(page.getByTestId('client-result')).toContainText('client')
  await expect(page.getByTestId('ssr-result')).toContainText('server')

  await expect(page.getByTestId('server-echo-result')).toContainText(
    'server received hello',
  )
  await expect(page.getByTestId('client-echo-result')).toContainText(
    'client received hello',
  )
})

test('env-only functions can only be called on the server or client respectively', async ({
  page,
}) => {
  await page.goto('/env-only')

  await page.waitForLoadState('networkidle')

  await page.getByTestId('test-env-only-results-btn').click()
  await page.waitForLoadState('networkidle')

  await expect(page.getByTestId('server-on-server')).toContainText(
    'server got: hello',
  )
  await expect(page.getByTestId('server-on-client')).toContainText(
    'serverEcho threw an error: createServerOnlyFn() functions can only be called on the server!',
  )

  await expect(page.getByTestId('client-on-server')).toContainText(
    'clientEcho threw an error: createClientOnlyFn() functions can only be called on the client!',
  )
  await expect(page.getByTestId('client-on-client')).toContainText(
    'client got: hello',
  )
})

test('Server function can return null for GET and POST calls', async ({
  page,
}) => {
  await page.goto('/return-null')

  await page.waitForLoadState('networkidle')
  await page.getByTestId('test-allow-server-fn-return-null-btn').click()
  await page.waitForLoadState('networkidle')

  // GET call
  await expect(
    page.getByTestId('allow_return_null_getFn-response'),
  ).toContainText(JSON.stringify(null))

  // POST call
  await expect(
    page.getByTestId('allow_return_null_postFn-response'),
  ).toContainText(JSON.stringify(null))
})

test('Server function can correctly send and receive FormData', async ({
  page,
}) => {
  await page.goto('/serialize-form-data')

  await page.waitForLoadState('networkidle')
  const expected =
    (await page
      .getByTestId('expected-serialize-formdata-server-fn-result')
      .textContent()) || ''
  expect(expected).not.toBe('')

  await page.getByTestId('test-serialize-formdata-fn-calls-btn').click()
  await page.waitForLoadState('networkidle')

  await expect(
    page.getByTestId('serialize-formdata-form-response'),
  ).toContainText(expected)
})

test('server function can correctly send and receive headers', async ({
  page,
}) => {
  await page.goto('/headers')

  await page.waitForLoadState('networkidle')
  let headers = JSON.parse(
    await page.getByTestId('initial-headers-result').innerText(),
  )
  expect(headers['host']).toBe(`localhost:${PORT}`)
  expect(headers['user-agent']).toContain('Mozilla/5.0')
  expect(headers['sec-fetch-mode']).toBe('navigate')

  await page.getByTestId('test-headers-btn').click()
  await page.waitForSelector('[data-testid="updated-headers-result"]')

  headers = JSON.parse(
    await page.getByTestId('updated-headers-result').innerText(),
  )

  expect(headers['host']).toBe(`localhost:${PORT}`)
  expect(headers['user-agent']).toContain('Mozilla/5.0')
  expect(headers['sec-fetch-mode']).toBe('cors')
  expect(headers['referer']).toBe(`http://localhost:${PORT}/headers`)
})

test('Direct POST submitting FormData to a Server function returns the correct message', async ({
  page,
}) => {
  await page.goto('/submit-post-formdata')

  await page.waitForLoadState('networkidle')

  const expected =
    (await page
      .getByTestId('expected-submit-post-formdata-server-fn-result')
      .textContent()) || ''
  expect(expected).not.toBe('')

  await page.getByTestId('test-submit-post-formdata-fn-calls-btn').click()
  await page.waitForLoadState('networkidle')

  const result = await page.innerText('body')
  expect(result).toBe(expected)
})

test("server function's dead code is preserved if already there", async ({
  page,
}) => {
  await page.goto('/dead-code-preserve')

  await page.waitForLoadState('networkidle')
  await page.getByTestId('test-dead-code-fn-call-btn').click()
  await page.waitForLoadState('networkidle')

  await expect(page.getByTestId('dead-code-fn-call-response')).toContainText(
    '1',
  )

  await fs.promises.rm('count-effect.txt')
})

test.describe('server function sets cookies', () => {
  async function runCookieTest(page: Page, expectedCookieValue: string) {
    for (let i = 1; i <= 4; i++) {
      const key = `cookie-${i}-${expectedCookieValue}`

      const actualValue = await page.getByTestId(key).textContent()
      expect(actualValue).toBe(expectedCookieValue)
    }
  }
  test('SSR', async ({ page }) => {
    const expectedCookieValue = `SSR-${Date.now()}`
    await page.goto(`/cookies/set?value=${expectedCookieValue}`)
    await runCookieTest(page, expectedCookieValue)
  })

  test('client side navigation', async ({ page }) => {
    const expectedCookieValue = `CLIENT-${Date.now()}`
    await page.goto(`/cookies?value=${expectedCookieValue}`)
    await page.getByTestId('link-to-set').click()
    await runCookieTest(page, expectedCookieValue)
  })
})

test.describe('aborting a server function call', () => {
  test('without aborting', async ({ page }) => {
    await page.goto('/abort-signal')

    await page.waitForLoadState('networkidle')

    await page.getByTestId('run-without-abort-btn').click()
    await page.waitForLoadState('networkidle')
    await page.waitForSelector(
      '[data-testid="result"]:has-text("server function result")',
    )
    await page.waitForSelector(
      '[data-testid="errorMessage"]:has-text("$undefined")',
    )

    const result = (await page.getByTestId('result').textContent()) || ''
    expect(result).toBe('server function result')

    const errorMessage =
      (await page.getByTestId('errorMessage').textContent()) || ''
    expect(errorMessage).toBe('$undefined')
  })

  test('aborting', async ({ page }) => {
    await page.goto('/abort-signal')

    await page.waitForLoadState('networkidle')

    await page.getByTestId('run-with-abort-btn').click()
    await page.waitForLoadState('networkidle')
    await page.waitForSelector('[data-testid="result"]:has-text("$undefined")')
    await page.waitForSelector(
      '[data-testid="errorMessage"]:has-text("aborted")',
    )

    const result = (await page.getByTestId('result').textContent()) || ''
    expect(result).toBe('$undefined')

    const errorMessage =
      (await page.getByTestId('errorMessage').textContent()) || ''
    expect(errorMessage).toContain('abort')
  })
})

test('raw response', async ({ page }) => {
  await page.goto('/raw-response')

  await page.waitForLoadState('networkidle')

  const expectedValue = (await page.getByTestId('expected').textContent()) || ''
  expect(expectedValue).not.toBe('')

  await page.getByTestId('button').click()
  await page.waitForLoadState('networkidle')

  await expect(page.getByTestId('response')).toContainText(expectedValue)
})
;[{ mode: 'js' }, { mode: 'no-js' }].forEach(({ mode }) => {
  test(`Server function can redirect when sending formdata: mode = ${mode}`, async ({
    page,
  }) => {
    await page.goto('/formdata-redirect?mode=' + mode)

    await page.waitForLoadState('networkidle')
    const expected =
      (await page
        .getByTestId('expected-submit-post-formdata-server-fn-result')
        .textContent()) || ''
    expect(expected).not.toBe('')

    await page.getByTestId('test-submit-post-formdata-fn-calls-btn').click()

    await page.waitForLoadState('networkidle')

    await expect(
      page.getByTestId('formdata-redirect-target-name'),
    ).toContainText(expected)

    expect(page.url().endsWith(`/formdata-redirect/target/${expected}`))
  })
})

test.describe('middleware', () => {
  test.describe('client middleware should have access to router context via the router instance', () => {
    async function runTest(page: Page) {
      await page.waitForLoadState('networkidle')

      const expected =
        (await page.getByTestId('expected-server-fn-result').textContent()) ||
        ''
      expect(expected).not.toBe('')

      await page.getByTestId('btn-serverFn').click()
      await page.waitForLoadState('networkidle')
      await expect(page.getByTestId('serverFn-loader-result')).toContainText(
        expected,
      )
      await expect(page.getByTestId('serverFn-client-result')).toContainText(
        expected,
      )
    }

    test('direct visit', async ({ page }) => {
      await page.goto('/middleware/client-middleware-router')
      await runTest(page)
    })

    test('client navigation', async ({ page }) => {
      await page.goto('/middleware')
      await page.getByTestId('client-middleware-router-link').click()
      await runTest(page)
    })
  })

  test('server function in combination with request middleware', async ({
    page,
  }) => {
    await page.goto('/middleware/request-middleware')

    await page.waitForLoadState('networkidle')

    async function checkEqual(prefix: string) {
      const requestParam = await page
        .getByTestId(`${prefix}-data-request-param`)
        .textContent()
      expect(requestParam).not.toBe('')
      const requestFunc = await page
        .getByTestId(`${prefix}-data-request-func`)
        .textContent()
      expect(requestParam).toBe(requestFunc)
    }

    await checkEqual('loader')

    await page.getByTestId('client-call-button').click()
    await page.waitForLoadState('networkidle')

    await checkEqual('client')
  })
})

test('factory', async ({ page }) => {
  await page.goto('/factory')

  await expect(page.getByTestId('factory-route-component')).toBeInViewport()

  const buttons = await page
    .locator('[data-testid^="btn-fn-"]')
    .elementHandles()
  for (const button of buttons) {
    const testId = await button.getAttribute('data-testid')

    if (!testId) {
      throw new Error('Button is missing data-testid')
    }

    const suffix = testId.replace('btn-fn-', '')

    const expected =
      (await page.getByTestId(`expected-fn-result-${suffix}`).textContent()) ||
      ''
    expect(expected).not.toBe('')

    await button.click()

    await expect(page.getByTestId(`fn-result-${suffix}`)).toContainText(
      expected,
    )

    await expect(page.getByTestId(`fn-comparison-${suffix}`)).toContainText(
      'equal',
    )
  }
})

test('primitives', async ({ page }) => {
  await page.goto('/primitives')

  const testCases = await page
    .locator('[data-testid^="expected-"]')
    .elementHandles()
  for (const testCase of testCases) {
    const testId = await testCase.getAttribute('data-testid')

    if (!testId) {
      throw new Error('testcase is missing data-testid')
    }

    const suffix = testId.replace('expected-', '')

    const expected =
      (await page.getByTestId(`expected-${suffix}`).textContent()) || ''
    expect(expected).not.toBe('')

    await expect(page.getByTestId(`result-${suffix}`)).toContainText(expected)
  }
})
