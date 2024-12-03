import { expect } from '@playwright/test'
import { test } from './utils'

test.afterEach(async ({ setupApp }) => {
  await setupApp.killProcess()
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
  await page.getByRole('link', { name: 'Layout A' }).click()
  await expect(page.locator('body')).toContainText("I'm A!")
  await page.getByRole('link', { name: 'Layout B' }).click()
  await expect(page.locator('body')).toContainText("I'm B!")
})

test('Navigating to a not-found route', async ({ page, setupApp }) => {
  const { ADDR } = setupApp
  await page.goto(ADDR + '/')

  await page.getByRole('link', { name: 'This Route Does Not Exist' }).click()
  await page.getByRole('link', { name: 'Start Over' }).click()
  await expect(page.getByRole('heading')).toContainText('Welcome Home!')
})
