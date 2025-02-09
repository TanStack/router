import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
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

test('scrolling into viewport a link with preload=viewport to a route should preload route', async ({
  page,
}) => {
  await page.waitForLoadState('networkidle')

  const [request] = await Promise.all([
    page.waitForRequest(() => true),
    page.getByRole('link', { name: 'viewport-test' }).scrollIntoViewIfNeeded(),
  ])

  expect(request.url()).toEqual(
    expect.stringContaining('viewport-test.tsx?tsr-split'),
  )
})
