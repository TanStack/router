import { test } from './utils'

test.afterEach(async ({ setupApp }) => {
  await setupApp.killProcess()
})

test('loads', async ({ page, setupApp }) => {
  const { ADDR } = setupApp
  await page.goto(ADDR + '/')
})
