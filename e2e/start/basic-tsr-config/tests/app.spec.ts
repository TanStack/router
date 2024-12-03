import { expect } from '@playwright/test'
import { test } from './utils'

test.afterEach(async ({ setupApp }) => {
  await setupApp.killProcess()
})

test('opening the app', async ({ page, setupApp }) => {
  const { ADDR } = setupApp
  await page.goto(ADDR + '/')

  await expect(page.getByText('Add 1 to 0?')).toBeTruthy()
  await page.click('button')
  await expect(page.getByText('Add 1 to 1?')).toBeTruthy()
})
