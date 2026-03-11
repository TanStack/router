import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

test.skip(process.env.MODE === 'dev', 'Prod-only repro')

test.describe('CSS styles in SSR (prod only)', () => {
  const buildUrl = (baseURL: string, path: string) => {
    return baseURL.replace(/\/$/, '') + path
  }

  test('CSS modules stay applied when navigating from static to lazy route', async ({
    page,
    baseURL,
  }) => {
    await page.goto(buildUrl(baseURL!, '/lazy-css-static'))

    const widget = page.getByTestId('shared-widget')
    await expect(widget).toBeVisible()

    const backgroundColor = await widget.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    )
    expect(backgroundColor).toBe('rgb(255, 247, 237)')

    const borderTopColor = await widget.evaluate(
      (el) => getComputedStyle(el).borderTopColor,
    )
    expect(borderTopColor).toBe('rgb(249, 115, 22)')

    await expect(page.getByTestId('lazy-css-static-hydrated')).toBeVisible()

    await page.getByTestId('nav-lazy-css-lazy').click()
    await page.waitForURL('**/lazy-css-lazy')
    await expect(page.getByTestId('lazy-css-lazy-heading')).toBeVisible()

    const lazyWidget = page.getByTestId('shared-widget')
    await expect(lazyWidget).toBeVisible()

    await expect
      .poll(
        () => lazyWidget.evaluate((el) => getComputedStyle(el).backgroundColor),
        { timeout: 5_000 },
      )
      .toBe('rgb(255, 247, 237)')
  })

  test('CSS modules stay applied when navigating from lazy to static route', async ({
    page,
    baseURL,
  }) => {
    await page.goto(buildUrl(baseURL!, '/lazy-css-lazy'))
    await expect(page.getByTestId('lazy-css-lazy-heading')).toBeVisible()

    // Wait for lazy widget to load
    const lazyWidget = page.getByTestId('shared-widget')
    await expect(lazyWidget).toBeVisible()

    await expect
      .poll(
        () => lazyWidget.evaluate((el) => getComputedStyle(el).backgroundColor),
        { timeout: 5_000 },
      )
      .toBe('rgb(255, 247, 237)')

    // Navigate to static route
    await page.getByTestId('nav-lazy-css-static').click()
    await page.waitForURL('**/lazy-css-static')

    const staticWidget = page.getByTestId('shared-widget')
    await expect(staticWidget).toBeVisible()

    await expect
      .poll(
        () =>
          staticWidget.evaluate((el) => getComputedStyle(el).backgroundColor),
        { timeout: 5_000 },
      )
      .toBe('rgb(255, 247, 237)')

    const borderTopColor = await staticWidget.evaluate(
      (el) => getComputedStyle(el).borderTopColor,
    )
    expect(borderTopColor).toBe('rgb(249, 115, 22)')
  })

  test('CSS modules applied on direct navigation to lazy route', async ({
    page,
    baseURL,
  }) => {
    // Navigate directly to the lazy route (cold start, no prior static route)
    await page.goto(buildUrl(baseURL!, '/lazy-css-lazy'))
    await expect(page.getByTestId('lazy-css-lazy-heading')).toBeVisible()

    const widget = page.getByTestId('shared-widget')
    await expect(widget).toBeVisible()

    await expect
      .poll(
        () => widget.evaluate((el) => getComputedStyle(el).backgroundColor),
        { timeout: 5_000 },
      )
      .toBe('rgb(255, 247, 237)')

    const borderTopColor = await widget.evaluate(
      (el) => getComputedStyle(el).borderTopColor,
    )
    expect(borderTopColor).toBe('rgb(249, 115, 22)')
  })

  test('CSS persists after navigating away from lazy and back', async ({
    page,
    baseURL,
  }) => {
    await page.goto(buildUrl(baseURL!, '/lazy-css-static'))
    await expect(page.getByTestId('lazy-css-static-hydrated')).toBeVisible()

    // Navigate to lazy
    await page.getByTestId('nav-lazy-css-lazy').click()
    await page.waitForURL('**/lazy-css-lazy')
    await expect(page.getByTestId('shared-widget')).toBeVisible()

    // Navigate away to home
    await page.getByTestId('nav-home').click()
    await page.waitForURL(/\/([^/]*)(\/)?($|\?)/)

    // Navigate back to lazy
    await page.getByTestId('nav-lazy-css-lazy').click()
    await page.waitForURL('**/lazy-css-lazy')

    const widget = page.getByTestId('shared-widget')
    await expect(widget).toBeVisible()

    await expect
      .poll(
        () => widget.evaluate((el) => getComputedStyle(el).backgroundColor),
        { timeout: 5_000 },
      )
      .toBe('rgb(255, 247, 237)')
  })
})
