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
  const expectedString =
    process.env.NODE_ENV === 'development'
      ? 'without-loader.tsx?tsr-split'
      : '/assets/without-loader'
  expect(url).toContain(expectedString)
})

test('scrolling into viewport a link with preload=viewport to a route should preload route', async ({
  page,
}) => {
  await page.waitForLoadState('networkidle')

  const [request] = await Promise.all([
    page.waitForRequest(() => true),
    page.getByRole('link', { name: 'viewport-test' }).scrollIntoViewIfNeeded(),
  ])

  const expectedString =
    process.env.NODE_ENV === 'development'
      ? 'viewport-test.tsx?tsr-split'
      : '/assets/viewport-test'
  expect(request.url()).toEqual(expect.stringContaining(expectedString))
})

test('preload: false skips an auto-code-split component chunk until navigation', async ({
  page,
}) => {
  await page.waitForLoadState('networkidle')
  const expectedString =
    process.env.NODE_ENV === 'development'
      ? 'preload-disabled.tsx?tsr-split'
      : '/assets/preload-disabled'
  const matchingRequests: Array<string> = []
  page.on('request', (request) => {
    if (request.url().includes(expectedString)) {
      matchingRequests.push(request.url())
    }
  })

  const link = page.getByRole('link', { name: 'preload-disabled' })
  await link.hover()
  await page.waitForTimeout(300)
  expect(matchingRequests).toEqual([])

  await link.click()
  await expect(page.getByTestId('preload-disabled')).toBeVisible()
  expect(matchingRequests.length).toBeGreaterThan(0)
})
