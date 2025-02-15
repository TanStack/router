import { expect, test } from '@playwright/test'
import * as fs from 'node:fs'

test('invoking a server function with custom response status code', async ({
  page,
}) => {
  await page.goto('/status')

  await page.waitForLoadState('networkidle')
  await page.getByTestId('invoke-server-fn').click()

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
  await requestPromise
})

test('Consistent server function returns both on client and server for GET and POST calls', async ({
  page,
}) => {
  await page.goto('/server-fns')

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
  await page.goto('/server-fns')

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
  await page.goto('/server-fns')

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
  await page.goto('/server-fns')

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
  await page.goto('/server-fns')

  await page.waitForLoadState('networkidle')
  // console.log(await page.getByTestId('test-headers-result').textContent())
  await expect(page.getByTestId('test-headers-result')).toContainText(`{
  "accept": "application/json",
  "accept-encoding": "gzip, deflate, br, zstd",
  "accept-language": "en-US",
  "connection": "keep-alive",
  "content-type": "application/json",
  "host": "localhost:42322",
  "sec-ch-ua": "\\"Not(A:Brand\\";v=\\"99\\", \\"HeadlessChrome\\";v=\\"133\\", \\"Chromium\\";v=\\"133\\"",
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": "\\"Windows\\"",
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
  "sec-fetch-user": "?1",
  "upgrade-insecure-requests": "1",
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.6943.16 Safari/537.36"
}`)

  await page.getByTestId('test-headers-btn').click()
  await page.waitForLoadState('networkidle')

  await expect(page.getByTestId('test-headers-result')).toContainText(`{
  "host": "localhost:42322",
  "connection": "keep-alive",
  "sec-ch-ua-platform": "\\"Windows\\"",
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.6943.16 Safari/537.36",
  "accept": "application/json",
  "sec-ch-ua": "\\"Not(A:Brand\\";v=\\"99\\", \\"HeadlessChrome\\";v=\\"133\\", \\"Chromium\\";v=\\"133\\"",
  "content-type": "application/json",
  "sec-ch-ua-mobile": "?0",
  "accept-language": "en-US",
  "sec-fetch-site": "same-origin",
  "sec-fetch-mode": "cors",
  "sec-fetch-dest": "empty",
  "referer": "http://localhost:42322/server-fns",
  "accept-encoding": "gzip, deflate, br, zstd"
}`)
})

test('Direct POST submitting FormData to a Server function returns the correct message', async ({
  page,
}) => {
  await page.goto('/server-fns')

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
  await page.goto('/server-fns')

  await page.waitForLoadState('networkidle')
  await page.getByTestId('test-dead-code-fn-call-btn').click()
  await page.waitForLoadState('networkidle')

  await expect(page.getByTestId('dead-code-fn-call-response')).toContainText(
    '1',
  )

  await fs.promises.rm('count-effect.txt')
})
