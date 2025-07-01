import * as fs from 'node:fs'
import { expect, test } from '@playwright/test'
import { PORT } from '../playwright.config'
import type { Page } from '@playwright/test'

test('invoking a server function with custom response status code', async ({
  page,
}) => {
  await page.goto('/status')

  await page.waitForLoadState('networkidle')

  const requestPromise = new Promise<void>((resolve) => {
    page.on('response', async (response) => {
      expect(response.status()).toBe(225)
      expect(response.statusText()).toBe('hello')
      expect(response.headers()['content-type']).toBe('application/json')
      expect(await response.json()).toEqual(
        expect.objectContaining({
          result: { hello: 'world' },
          context: {},
        }),
      )
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
    'serverEcho threw an error: serverOnly() functions can only be called on the server!',
  )

  await expect(page.getByTestId('client-on-server')).toContainText(
    'clientEcho threw an error: clientOnly() functions can only be called on the client!',
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
