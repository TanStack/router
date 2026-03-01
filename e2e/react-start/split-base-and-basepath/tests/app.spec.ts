import { expect, test } from '@playwright/test'

test.describe('split base and basepath', () => {
  test('page renders at root /', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('home-heading')).toHaveText('Welcome Home')
  })

  test('SSR HTML contains asset URLs prefixed with /_ui/', async ({
    request,
  }) => {
    const response = await request.get('/')
    expect(response.ok()).toBeTruthy()
    const html = await response.text()

    // Script tags should reference /_ui/ prefix
    const scriptSrcMatches = html.match(/src="([^"]+)"/g) || []
    const moduleScripts = scriptSrcMatches.filter(
      (s) => s.includes('.js') || s.includes('.ts') || s.includes('@'),
    )

    for (const script of moduleScripts) {
      // Extract the URL from src="..."
      const url = script.replace(/^src="/, '').replace(/"$/, '')
      // Asset URLs should start with /_ui/
      expect(url, `Script URL should be prefixed with /_ui/: ${url}`).toMatch(
        /^\/_ui\//,
      )
    }

    // Stylesheet links should reference /_ui/ prefix.
    // In dev mode, the TanStack Start dev-styles endpoint uses a special
    // /@tanstack-start/ prefix that is not base-prefixed. That's fine because
    // the dev-base-rewrite middleware makes it accessible without the prefix.
    // We only check non-dev-style stylesheets here.
    const stylesheetMatches =
      html.match(/href="([^"]+)"\s*(?:data-tanstack-router-dev-styles)?/g) || []
    for (const match of stylesheetMatches) {
      // Skip dev-only style links (/@tanstack-start/styles.css)
      if (match.includes('@tanstack-start/styles.css')) {
        continue
      }
      const href = match.replace(/.*href="/, '').replace(/".*/, '')
      if (href.endsWith('.css')) {
        expect(
          href,
          `Stylesheet URL should be prefixed with /_ui/: ${href}`,
        ).toMatch(/^\/_ui\//)
      }
    }
  })

  test('CSS loads and applies correctly', async ({ page }) => {
    await page.goto('/')
    // The body should have font-family: sans-serif from our CSS
    const fontFamily = await page.evaluate(() => {
      return window.getComputedStyle(document.body).fontFamily
    })
    expect(fontFamily).toContain('sans-serif')
  })

  test('client-side navigation works', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('home-heading')).toBeVisible()

    // Click the About link
    await page.getByTestId('link-about').click()

    // Should navigate to /about
    await expect(page.getByTestId('about-heading')).toHaveText('About Page')
    await expect(page.getByTestId('about-content')).toBeVisible()

    // URL should be at /about, not /_ui/about
    expect(page.url()).toContain('/about')
    expect(page.url()).not.toContain('/_ui/about')
  })

  test('navigation links do not have /_ui/ prefix', async ({ page }) => {
    await page.goto('/')

    // Check that the Home link href is at / (not /_ui/)
    const homeHref = await page.getByTestId('link-home').getAttribute('href')
    expect(homeHref).toBe('/')

    // Check that the About link href is at /about (not /_ui/about)
    const aboutHref = await page.getByTestId('link-about').getAttribute('href')
    expect(aboutHref).toBe('/about')
  })

  test('navigating directly to /about works via SSR', async ({ page }) => {
    await page.goto('/about')
    await expect(page.getByTestId('about-heading')).toHaveText('About Page')
  })

  test('navigate back to home after visiting about', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('link-about').click()
    await expect(page.getByTestId('about-heading')).toBeVisible()

    await page.getByTestId('link-home').click()
    await expect(page.getByTestId('home-heading')).toBeVisible()
  })
})
