import { expect, test } from '@playwright/test'
import { isSpaMode } from './utils/isSpaMode'

const guardError =
  'createServerOnlyFn() functions can only be called on the server!'

test('a server-only loader works on the server but rejects client navigation', async ({
  page,
  request,
}) => {
  const direct = await request.get('/execution-local')
  expect(direct.status()).toBe(200)
  if (!isSpaMode) {
    expect(await direct.text()).toContain('Read on the server')
  }
  await page.goto('/execution-rpc')
  await expect(page.getByTestId('execution-result')).toHaveText(
    'Read on the server',
  )
  await page
    .getByRole('link', { name: 'Call the server-only helper directly' })
    .click()
  await expect(page.getByRole('alert')).toHaveText(guardError)
})

test('a server function preserves the loader result on direct requests and navigation', async ({
  page,
  request,
}) => {
  const direct = await request.get('/execution-rpc')
  expect(direct.status()).toBe(200)
  if (!isSpaMode) {
    expect(await direct.text()).toContain('Read on the server')
  }
  await page.goto('/')
  await page
    .getByRole('link', { name: 'Server function loader', exact: true })
    .click()
  await expect(page.getByTestId('execution-result')).toHaveText(
    'Read on the server',
  )
  await page.reload()
  await expect(page.getByTestId('execution-result')).toHaveText(
    'Read on the server',
  )
})
