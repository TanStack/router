import { expect } from '@playwright/test'
import { test } from './utils'

test.afterEach(async ({ setupApp: setup }) => {
  await setup.killProcess()
})

test('Navigating to post', async ({ page, setupApp }) => {
  const { ADDR } = setupApp
  await page.goto(ADDR + '/')

  await page.getByRole('link', { name: 'Posts' }).click()
  await page.getByRole('link', { name: 'sunt aut facere repe' }).click()
  await page.getByRole('link', { name: 'Deep View' }).click()
  await expect(page.getByRole('heading')).toContainText('sunt aut facere')
})

test('Navigating to user', async ({ page, setupApp }) => {
  const { ADDR } = setupApp
  await page.goto(ADDR + '/')

  await page.getByRole('link', { name: 'Users' }).click()
  await page.getByRole('link', { name: 'Leanne Graham' }).click()
  await expect(page.getByRole('heading')).toContainText('Leanne Graham')
})

test('Navigating nested layouts', async ({ page, setupApp }) => {
  const { ADDR } = setupApp
  await page.goto(ADDR + '/')

  await page.getByRole('link', { name: 'Layout', exact: true }).click()

  await expect(page.locator('body')).toContainText("I'm a layout")
  await expect(page.locator('body')).toContainText("I'm a nested layout")

  await page.getByRole('link', { name: 'Layout A' }).click()
  await expect(page.locator('body')).toContainText("I'm layout A!")

  await page.getByRole('link', { name: 'Layout B' }).click()
  await expect(page.locator('body')).toContainText("I'm layout B!")
})

test('Navigating to a not-found route', async ({ page, setupApp }) => {
  const { ADDR } = setupApp
  await page.goto(ADDR + '/')

  await page.getByRole('link', { name: 'This Route Does Not Exist' }).click()
  await page.getByRole('link', { name: 'Start Over' }).click()
  await expect(page.getByRole('heading')).toContainText('Welcome Home!')
})

test('Navigating to deferred route', async ({ page, setupApp }) => {
  const { ADDR } = setupApp
  await page.goto(ADDR + '/')

  await page.getByRole('link', { name: 'Deferred' }).click()

  await expect(page.getByTestId('regular-person')).toContainText('John Doe')
  await expect(page.getByTestId('deferred-person')).toContainText(
    'Tanner Linsley',
  )
  await expect(page.getByTestId('deferred-stuff')).toContainText(
    'Hello deferred!',
  )
})

test('Directly visiting the deferred route', async ({ page, setupApp }) => {
  const { ADDR } = setupApp
  await page.goto(ADDR + '/deferred')

  await expect(page.getByTestId('regular-person')).toContainText('John Doe')
  await expect(page.getByTestId('deferred-person')).toContainText(
    'Tanner Linsley',
  )
  await expect(page.getByTestId('deferred-stuff')).toContainText(
    'Hello deferred!',
  )
})

test('invoking a server function with custom response status code', async ({
  page,
  setupApp,
}) => {
  const { ADDR } = setupApp
  await page.goto(ADDR + '/status')

  await page.waitForLoadState('networkidle')
  await page.getByTestId('invoke-server-fn').click()

  const requestPromise = new Promise<void>((resolve) => {
    page.on('response', async (response) => {
      expect(response.status()).toBe(225)
      expect(response.statusText()).toBe('hello')
      expect(response.headers()['content-type']).toBe('application/json')
      expect(await response.json()).toEqual({
        result: { hello: 'world' },
        context: {},
      })
      resolve()
    })
  })
  await requestPromise
})

test('Consistent server function returns both on client and server for GET and POST calls', async ({
  page,
  setupApp,
}) => {
  const { ADDR } = setupApp
  await page.goto(ADDR + '/server-fns')

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
  setupApp,
}) => {
  const { ADDR } = setupApp
  await page.goto(ADDR + '/server-fns')

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
