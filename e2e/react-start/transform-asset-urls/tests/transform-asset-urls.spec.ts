import { expect, type Page } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

/**
 * Helper: fetch the SSR HTML for the given path using Playwright's
 * APIRequestContext (no navigation/interception needed).
 */
async function getSSRHtml(page: Page, path = '/') {
  const response = await page.request.get(path, {
    headers: {
      Accept: 'text/html',
    },
  })

  expect(response.ok()).toBeTruthy()
  const contentType = response.headers()['content-type'] || ''
  expect(contentType).toContain('text/html')

  return response.text()
}

test.describe('transformAssetUrls with CDN prefix', () => {
  test('test run mode is set (string|function|options)', async () => {
    expect(process.env.TRANSFORM_ASSET_URLS_MODE).toMatch(
      /^(string|function|options)$/,
    )

    if (process.env.TRANSFORM_ASSET_URLS_MODE === 'options') {
      expect(process.env.TRANSFORM_ASSET_URLS_OPTIONS_KIND).toMatch(
        /^(transform|createTransform)$/,
      )

      expect(process.env.TRANSFORM_ASSET_URLS_OPTIONS_CACHE).toMatch(
        /^(true|false)$/,
      )
      expect(process.env.TRANSFORM_ASSET_URLS_OPTIONS_WARMUP).toMatch(
        /^(true|false)$/,
      )
    }
  })

  test('SSR HTML contains CDN-prefixed modulepreload links', async ({
    page,
  }) => {
    const html = await getSSRHtml(page)

    // All modulepreload links should point to the CDN origin
    const modulepreloads = html.match(/rel="modulepreload"[^>]*href="([^"]+)"/g)
    expect(modulepreloads).toBeTruthy()
    expect(modulepreloads!.length).toBeGreaterThan(0)

    for (const match of modulepreloads!) {
      const href = match.match(/href="([^"]+)"/)?.[1]
      expect(href).toBeTruthy()
      expect(href).toMatch(/^http:\/\/localhost:\d+\//)
    }
  })

  test('SSR HTML contains CDN-prefixed stylesheet link', async ({ page }) => {
    const html = await getSSRHtml(page)

    // The emitted stylesheet link should be CDN-prefixed
    const stylesheetLinks = html.match(/rel="stylesheet"[^>]*href="([^"]+)"/g)
    expect(stylesheetLinks).toBeTruthy()

    const firstStylesheetLink = stylesheetLinks![0]
    expect(firstStylesheetLink).toBeTruthy()

    const href = firstStylesheetLink!.match(/href="([^"]+)"/)?.[1]
    expect(href).toBeTruthy()
    expect(href).toMatch(/^http:\/\/localhost:\d+\//)
    expect(href).toMatch(/\.css(\?|$)/)
  })

  test('SSR HTML for /about references CSS modules stylesheet and style applies', async ({
    page,
  }) => {
    const html = await getSSRHtml(page, '/about')

    // Ensure the /about route's CSS module chunk is referenced in SSR HTML.
    // In production builds, Vite emits hashed assets like "about.<hash>.css".
    const stylesheetHrefs = Array.from(
      html.matchAll(/rel="stylesheet"[^>]*href="([^"]+)"/g),
    ).map((m) => m[1])

    expect(stylesheetHrefs.length).toBeGreaterThan(0)

    const aboutCssHrefs = stylesheetHrefs.filter((href) => {
      if (!/^http:\/\/localhost:\d+\//.test(href)) return false

      let pathname = ''
      try {
        pathname = new URL(href).pathname
      } catch {
        return false
      }

      const filename = pathname.split('/').pop() || ''
      return filename.startsWith('about') && /\.css$/.test(filename)
    })

    expect(aboutCssHrefs.length).toBeGreaterThan(0)

    // Now load /about and verify the CSS module style is actually applied.
    await page.goto('/about')
    await expect(page.getByTestId('about-card')).toBeVisible()

    const bgColor = await page
      .getByTestId('about-card')
      .evaluate((el) => getComputedStyle(el).backgroundColor)

    // #fff3c4 = rgb(255, 243, 196)
    expect(bgColor).toBe('rgb(255, 243, 196)')
  })

  test('SSR HTML contains CDN-prefixed client entry script', async ({
    page,
  }) => {
    const html = await getSSRHtml(page)

    // The client entry script should contain an import() with CDN-prefixed URL
    // JSON.stringify produces double quotes; bundler optimisation may use single quotes
    const clientEntryMatch = html.match(
      /import\(["'](http:\/\/localhost:\d+\/[^"']+)["']\)/,
    )
    expect(clientEntryMatch).toBeTruthy()
    expect(clientEntryMatch![1]).toMatch(/^http:\/\/localhost:\d+\//)
  })

  test('page renders correctly with CDN-served assets', async ({ page }) => {
    await page.goto('/')

    // Page content renders
    await expect(page.getByTestId('home-heading')).toHaveText('Welcome Home')
    await expect(page.getByTestId('home-content')).toContainText(
      'transformAssetUrls',
    )
  })

  test('CSS is applied correctly from CDN', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.app-styled')).toBeVisible()

    // Verify that the CSS from app.css is actually applied
    // The .app-styled class sets background-color to #f0f0f0
    const bgColor = await page
      .locator('.app-styled')
      .evaluate((el) => getComputedStyle(el).backgroundColor)

    // #f0f0f0 = rgb(240, 240, 240)
    expect(bgColor).toBe('rgb(240, 240, 240)')
  })

  test('browser fetches assets from CDN server', async ({ page }) => {
    // Track network requests to verify JS/CSS assets are fetched from a
    // different origin than the app server (i.e. the CDN)
    const appOrigin = new URL(
      test.info().project.use.baseURL || 'http://localhost:3000',
    ).origin
    const assetRequests: Array<{ url: string; fromCdn: boolean }> = []

    page.on('request', (request) => {
      const url = request.url()
      // Look for JS/CSS asset requests
      if (/\.(js|css)(\?|$)/.test(url)) {
        const origin = new URL(url).origin
        assetRequests.push({ url, fromCdn: origin !== appOrigin })
      }
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Verify that at least some asset requests went to a non-app origin (the CDN)
    const cdnRequests = assetRequests.filter((r) => r.fromCdn)
    expect(cdnRequests.length).toBeGreaterThan(0)
  })

  test('client-side navigation to /about loads split chunk from CDN', async ({
    page,
  }) => {
    const appOrigin = new URL(
      test.info().project.use.baseURL || 'http://localhost:3000',
    ).origin

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Start tracking network requests after initial page load so we only
    // capture requests triggered by the client-side navigation
    const navigationAssetRequests: Array<{
      url: string
      fromCdn: boolean
    }> = []

    page.on('request', (request) => {
      const url = request.url()
      if (/\.(js|css)(\?|$)/.test(url)) {
        const origin = new URL(url).origin
        navigationAssetRequests.push({ url, fromCdn: origin !== appOrigin })
      }
    })

    await page.getByTestId('link-to-about').click()
    await page.waitForURL('**/about')
    await expect(page.getByTestId('about-heading')).toHaveText('About')

    // Ensure CSS modules were loaded and applied after client navigation
    await expect(page.getByTestId('about-card')).toBeVisible()
    const bgColor = await page
      .getByTestId('about-card')
      .evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(bgColor).toBe('rgb(255, 243, 196)')

    // With base: '', lazy-loaded route chunks should come from the CDN, not the app server.
    // Filter to JS requests only (the route chunk import)
    const jsRequests = navigationAssetRequests.filter((r) =>
      /\.js(\?|$)/.test(r.url),
    )
    expect(jsRequests.length).toBeGreaterThan(0)

    const cdnJsRequests = jsRequests.filter((r) => r.fromCdn)
    expect(cdnJsRequests.length).toBeGreaterThan(0)
  })
})
