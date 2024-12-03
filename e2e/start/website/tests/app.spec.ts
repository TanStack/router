import { expect } from '@playwright/test'
import { test } from './utils'

test.afterEach(async ({ setupApp }) => {
  await setupApp.killProcess()
})

const routeTestId = 'selected-route-label'

test('resolves to the latest version on load of a project like "/router"', async ({
  page,
  setupApp,
}) => {
  const { ADDR } = setupApp
  await page.goto(ADDR + '/router')

  await expect(page.getByTestId(routeTestId)).toContainText('/router/latest')
})

test('resolves to the overview docs page', async ({ page, setupApp }) => {
  const { ADDR } = setupApp
  await page.goto(ADDR + '/router/latest/docs')

  await expect(page.getByTestId(routeTestId)).toContainText(
    '/router/latest/docs/framework/react/overview',
  )
})
