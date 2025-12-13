import { expect, test } from '@playwright/test'

test.describe('Hydrate: false feature', () => {
  test('should not include main bundle scripts when hydrate is false', async ({
    page,
  }) => {
    // Visit the route with hydrate: false
    await page.goto('/static')

    // Wait for the page to load
    await expect(page.getByTestId('static-heading')).toBeVisible()

    // Get the HTML content
    const html = await page.content()

    // The main bundle scripts from the manifest should NOT be present
    // These are the scripts that would hydrate the React app
    const hasMainBundleScript = html.includes('type="module"')
    expect(hasMainBundleScript).toBe(false)

    // The serialized router data script ($_TSR) should NOT be present
    const hasRouterDataScript = html.includes('window.$_TSR')
    expect(hasRouterDataScript).toBe(false)

    // Verify that inline scripts from head() option are still present
    const hasInlineScript = html.includes('External scripts still work')
    expect(hasInlineScript).toBe(true)

    // Verify that the page content is still rendered (SSR worked)
    await expect(page.getByTestId('static-heading')).toContainText(
      'Static Route',
    )
    await expect(page.getByTestId('message')).toContainText(
      'This data was loaded on the server',
    )

    // The page should not be interactive (no hydration)
    // Button with onClick should not work
    await expect(page.getByTestId('inactive-button')).toBeVisible()
  })

  test('should render correct meta tags when hydrate is false', async ({
    page,
  }) => {
    await page.goto('/static')

    // Verify meta tags from head() option are present
    const title = await page.title()
    expect(title).toContain('Static Route')

    const description = await page.getAttribute(
      'meta[name="description"]',
      'content',
    )
    expect(description).toBe('A static server-rendered page with no hydration')
  })

  test('should not include modulepreload links when hydrate is false', async ({
    page,
  }) => {
    await page.goto('/static')

    const html = await page.content()

    // Modulepreload links should NOT be present
    const hasModulePreload = html.includes('rel="modulepreload"')
    expect(hasModulePreload).toBe(false)
  })

  test('should still serve static content correctly when hydrate is false', async ({
    page,
  }) => {
    await page.goto('/static')

    // Verify that loader data is rendered (SSR)
    const message = await page.getByTestId('message').textContent()
    expect(message).toContain('This data was loaded on the server')

    // Verify server time is present (loader ran on server)
    const serverTime = await page.getByTestId('server-time').textContent()
    expect(serverTime).toBeTruthy()
    expect(serverTime).toContain('Server Time:')

    // Verify page views are rendered
    const pageViews = await page.getByTestId('page-views').textContent()
    expect(pageViews).toContain('Page Views:')
  })

  test('hydrated route should include all bundles and be interactive', async ({
    page,
  }) => {
    // Visit the hydrated route for comparison
    await page.goto('/hydrated')

    // Wait for hydration to complete
    await expect(page.getByTestId('hydration-status')).toContainText(
      'Hydrated and Interactive',
    )

    // Get the HTML content
    const html = await page.content()

    // The main bundle scripts SHOULD be present
    const hasMainBundleScript = html.includes('type="module"')
    expect(hasMainBundleScript).toBe(true)

    // Verify interactivity works
    const counter = page.getByTestId('counter')
    await expect(counter).toContainText('0')

    // Click the increment button
    await page.click('button:has-text("+")')
    await expect(counter).toContainText('1')

    // Click the decrement button
    await page.click('button:has-text("-")')
    await expect(counter).toContainText('0')
  })

  test('navigation from home to static page should work', async ({ page }) => {
    await page.goto('/')

    // Click the static route link
    await page.click('a[href="/static"]')

    // Verify we're on the static page
    await expect(page.getByTestId('static-heading')).toBeVisible()
    await expect(page).toHaveURL('/static')
  })
})
