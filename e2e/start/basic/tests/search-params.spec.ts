import { expect, test } from '@playwright/test'

test('Directly visiting the search-params route without search param set', async ({
  page,
}) => {
  await page.goto('/search-params')

  await new Promise((r) => setTimeout(r, 500))
  await expect(page.getByTestId('search-param')).toContainText('a')
  expect(page.url().endsWith('/search-params?step=a'))
})

test('Directly visiting the search-params route with search param set', async ({
  page,
}) => {
  await page.goto('/search-params?step=b')

  await new Promise((r) => setTimeout(r, 500))
  await expect(page.getByTestId('search-param')).toContainText('b')
  expect(page.url().endsWith('/search-params?step=b'))
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

test('Direct submitting FormData to a Server function returns the correct message', async ({
  page,
}) => {
  await page.goto('/server-fns')

  await page.waitForLoadState('networkidle')

  const expected =
    (await page
      .getByTestId('expected-submit-formdata-server-fn-result')
      .textContent()) || ''
  expect(expected).not.toBe('')

  await page.getByTestId('test-submit-formdata-fn-calls-btn').click()
  await page.waitForLoadState('networkidle')

  const result = await page.innerText('body')
  expect(result).toBe(expected)
})
