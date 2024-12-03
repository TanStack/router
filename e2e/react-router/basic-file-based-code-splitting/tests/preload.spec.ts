import { expect } from '@playwright/test'
import { test } from './utils'

test.beforeEach(async ({ page, setupApp }) => {
  await page.goto(setupApp.ADDR + '/')
})

test.afterEach(async ({ setupApp }) => {
  await setupApp.killProcess()
})

test('hovering a link with preload=intent to a route without a loader should preload route', async ({
  page,
}) => {
  await page.waitForLoadState('networkidle')

  const requestPromise = new Promise<string>((resolve) => {
    page.on('request', (request) => {
      resolve(request.url())
    })
  })

  await page.getByRole('link', { name: 'without-loader' }).hover()
  const url = await requestPromise
  expect(url).toContain('without-loader.tsx?tsr-split')
})
