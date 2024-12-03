import { expect } from '@playwright/test'
import { test } from './utils'

test.afterEach(async ({ setupApp: setup }) => {
  await setup.killProcess()
})

test('Directly visiting the search-params route without search param set', async ({
  page,
  setupApp,
}) => {
  const { ADDR } = setupApp
  await page.goto(ADDR + '/search-params')

  await new Promise((r) => setTimeout(r, 500))
  await expect(page.getByTestId('search-param')).toContainText('a')
  expect(page.url().endsWith('/search-params?step=a'))
})

test('Directly visiting the search-params route with search param set', async ({
  page,
  setupApp,
}) => {
  const { ADDR } = setupApp
  await page.goto(ADDR + '/search-params?step=b')

  await new Promise((r) => setTimeout(r, 500))
  await expect(page.getByTestId('search-param')).toContainText('b')
  expect(page.url().endsWith('/search-params?step=b'))
})
