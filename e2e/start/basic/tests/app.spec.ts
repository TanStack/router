import { exec } from 'node:child_process'
import { expect, test } from '@playwright/test'
import { getRandomPort } from 'get-port-please'
import terminate from 'terminate/promise'
import waitPort from 'wait-port'

async function setup(): Promise<{
  PORT: number
  PID: number
  ADDR: string
  KILL: () => Promise<void>
}> {
  const PORT = await getRandomPort()
  const ADDR = `http://localhost:${PORT}`

  const childProcess = exec(
    `VITE_SERVER_PORT=${PORT} pnpm run dev:e2e --port ${PORT}`,
  )
  childProcess.stdout?.on('data', (data) => {
    const message = data.toString()
    console.log('Stdout:', message)
  })
  await waitPort({ port: PORT })

  const PID = childProcess.pid!
  const KILL = () => terminate(PID)

  return { PORT, PID, ADDR, KILL }
}

test('Navigating to post', async ({ page }) => {
  // setup
  const { ADDR, KILL } = await setup()

  await page.goto(ADDR + '/')
  await page.getByRole('link', { name: 'Posts' }).click()
  await page.getByRole('link', { name: 'sunt aut facere repe' }).click()
  await page.getByRole('link', { name: 'Deep View' }).click()
  await expect(page.getByRole('heading')).toContainText('sunt aut facere')

  // teardown
  await KILL()
})

test('Navigating to user', async ({ page }) => {
  // setup
  const { ADDR, KILL } = await setup()

  await page.goto(ADDR + '/')
  await page.getByRole('link', { name: 'Users' }).click()
  await page.getByRole('link', { name: 'Leanne Graham' }).click()
  await expect(page.getByRole('heading')).toContainText('Leanne Graham')

  // teardown
  await KILL()
})

test('Navigating nested layouts', async ({ page }) => {
  // setup
  const { ADDR, KILL } = await setup()

  await page.goto(ADDR + '/')
  await page.getByRole('link', { name: 'Layout', exact: true }).click()

  await expect(page.locator('body')).toContainText("I'm a layout")
  await expect(page.locator('body')).toContainText("I'm a nested layout")

  await page.getByRole('link', { name: 'Layout A' }).click()
  await expect(page.locator('body')).toContainText("I'm layout A!")

  await page.getByRole('link', { name: 'Layout B' }).click()
  await expect(page.locator('body')).toContainText("I'm layout B!")

  // teardown
  await KILL()
})

test('Navigating to a not-found route', async ({ page }) => {
  // setup
  const { ADDR, KILL } = await setup()

  await page.goto(ADDR + '/')
  await page.getByRole('link', { name: 'This Route Does Not Exist' }).click()
  await page.getByRole('link', { name: 'Start Over' }).click()
  await expect(page.getByRole('heading')).toContainText('Welcome Home!')

  // teardown
  await KILL()
})

test('Navigating to deferred route', async ({ page }) => {
  // setup
  const { ADDR, KILL } = await setup()

  await page.goto(ADDR + '/')
  await page.getByRole('link', { name: 'Deferred' }).click()

  await expect(page.getByTestId('regular-person')).toContainText('John Doe')
  await expect(page.getByTestId('deferred-person')).toContainText(
    'Tanner Linsley',
  )
  await expect(page.getByTestId('deferred-stuff')).toContainText(
    'Hello deferred!',
  )

  // teardown
  await KILL()
})

test('Directly visiting the deferred route', async ({ page }) => {
  // setup
  const { ADDR, KILL } = await setup()

  await page.goto(ADDR + '/deferred')

  await expect(page.getByTestId('regular-person')).toContainText('John Doe')
  await expect(page.getByTestId('deferred-person')).toContainText(
    'Tanner Linsley',
  )
  await expect(page.getByTestId('deferred-stuff')).toContainText(
    'Hello deferred!',
  )

  // teardown
  await KILL()
})

test('Directly visiting the search-params route without search param set', async ({
  page,
}) => {
  // setup
  const { ADDR, KILL } = await setup()

  await page.goto(ADDR + '/search-params')
  await new Promise((r) => setTimeout(r, 500))
  await expect(page.getByTestId('search-param')).toContainText('a')
  expect(page.url().endsWith('/search-params?step=a'))

  // teardown
  await KILL()
})

test('Directly visiting the search-params route with search param set', async ({
  page,
}) => {
  // setup
  const { ADDR, KILL } = await setup()

  await page.goto(ADDR + '/search-params?step=b')
  await new Promise((r) => setTimeout(r, 500))
  await expect(page.getByTestId('search-param')).toContainText('b')
  expect(page.url().endsWith('/search-params?step=b'))

  // teardown
  await KILL()
})

test('invoking a server function with custom response status code', async ({
  page,
}) => {
  // setup
  const { ADDR, KILL } = await setup()

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

  // teardown
  await KILL()
})

test('Consistent server function returns both on client and server for GET and POST calls', async ({
  page,
}) => {
  // setup
  const { ADDR, KILL } = await setup()

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

  // teardown
  await KILL()
})

test('submitting multipart/form-data as server function input', async ({
  page,
}) => {
  // setup
  const { ADDR, KILL } = await setup()

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

  // teardown
  await KILL()
})
