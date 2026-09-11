import { expect, test } from '@playwright/test'
import sharp from 'sharp'

for (const [width, deviceScaleFactor, candidate] of [
  [390, 1, 480],
  [390, 2, 960],
  [1280, 1, 960],
  [1280, 2, 1600],
]) {
  test(`image at ${width}px and ${deviceScaleFactor}x`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      deviceScaleFactor,
    })
    const page = await context.newPage()
    const response = await page.goto('http://127.0.0.1:3130')
    expect(response?.status()).toBe(200)
    expect(await response!.text()).toMatch(/srcset=/i)
    const image = page.getByRole('img')
    await expect(image).toHaveJSProperty('complete', true)
    const selected = await image.evaluate((element) => {
      if (!(element instanceof HTMLImageElement)) {
        throw new Error('Expected an image')
      }
      return element.currentSrc
    })
    expect(selected).toContain(`coast-${candidate}`)
    const downloaded = await page.request.get(selected)
    expect(downloaded.ok()).toBe(true)
    const metadata = await sharp(await downloaded.body()).metadata()
    expect(metadata.width).toBe(candidate)
    expect(metadata.height).toBe((candidate * 9) / 16)
    const size = await image.boundingBox()
    expect(size?.width).toBe(Math.min(960, width - 32))
    expect(size!.height / size!.width).toBeCloseTo(9 / 16, 2)
    await context.close()
  })
}

test('image dimensions survive failed downloads and fallback text stays visible', async ({
  page,
}) => {
  await page.route('**/*.webp*', (route) => route.abort())
  await page.route('**/*.woff2*', (route) => route.abort())
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Coastal field notes' }),
  ).toBeVisible()
  const size = await page.getByRole('img').boundingBox()
  expect(size!.height / size!.width).toBeCloseTo(9 / 16, 2)
})

test('one same-origin font supplies the used weights', async ({ page }) => {
  const fontResponses: string[] = []
  const externalRequests: string[] = []
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1:3130/')) {
      externalRequests.push(request.url())
    }
  })
  page.on('response', (response) => {
    if (response.url().includes('.woff2')) {
      fontResponses.push(response.url())
    }
  })
  await page.goto('/')
  await page.evaluate(() => document.fonts.ready)
  expect(
    await page.evaluate(() => document.fonts.check('650 24px Inter')),
  ).toBe(true)
  expect(fontResponses).toHaveLength(1)
  expect(externalRequests).toEqual([])
  const preload = page.locator('link[as="font"]')
  const href = await preload.getAttribute('href')
  expect(new URL(href!, page.url()).href).toBe(fontResponses[0])
  await expect(preload).toHaveAttribute('crossorigin', 'anonymous')
})
