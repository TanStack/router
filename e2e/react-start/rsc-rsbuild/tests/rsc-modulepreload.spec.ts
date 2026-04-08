import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

const isDev = process.env.MODE === 'dev'

/**
 * Tests for modulepreload link tags in SSR HTML.
 *
 * In prod mode, the SSR HTML should include <link rel="modulepreload"> tags
 * for the entry JS and all route-specific async chunks that the browser
 * needs to load. This ensures the browser can start downloading chunks in
 * parallel instead of waiting for the waterfall of dynamic imports.
 */

test.describe('Modulepreload Tests (Rsbuild)', () => {
  function getModulePreloads(html: string): Array<string> {
    return Array.from(
      html.matchAll(/<link rel="modulepreload" href="([^"]*)"/g),
      (match) => match[1]!,
    )
  }

  test('entry JS has modulepreload on all pages', async ({ page }) => {
    const response = await page.goto('/')
    const html = await response?.text()
    expect(html).toBeDefined()

    // The entry JS should always have a modulepreload link
    const modulepreloads = html!.match(
      /<link rel="modulepreload" href="[^"]*"/g,
    )
    expect(modulepreloads).toBeTruthy()
    expect(modulepreloads!.length).toBeGreaterThanOrEqual(1)

    // At least one should be the entry chunk (index.*.js)
    const hasEntryPreload = modulepreloads!.some((link) =>
      link.includes('/static/js/index.'),
    )
    expect(hasEntryPreload).toBe(true)
  })

  test('route-specific preloads on /rsc-basic', async ({ page }) => {
    const response = await page.goto('/rsc-basic')
    const html = await response?.text()
    expect(html).toBeDefined()

    const modulepreloads = html!.match(
      /<link rel="modulepreload" href="[^"]*"/g,
    )
    expect(modulepreloads).toBeTruthy()

    // Should have entry + route async chunks (more than just the entry)
    expect(modulepreloads!.length).toBeGreaterThan(1)

    // Should have async chunk preloads
    const asyncPreloads = modulepreloads!.filter((link) =>
      link.includes('/static/js/async/'),
    )
    expect(asyncPreloads.length).toBeGreaterThan(0)
  })

  test('route-specific preloads on /rsc-client-in-rsc', async ({ page }) => {
    const response = await page.goto('/rsc-client-in-rsc')
    const html = await response?.text()
    expect(html).toBeDefined()

    const modulepreloads = html!.match(
      /<link rel="modulepreload" href="[^"]*"/g,
    )
    expect(modulepreloads).toBeTruthy()

    // Should have entry + route async chunks
    expect(modulepreloads!.length).toBeGreaterThan(1)

    // Should have async chunk preloads
    const asyncPreloads = modulepreloads!.filter((link) =>
      link.includes('/static/js/async/'),
    )
    expect(asyncPreloads.length).toBeGreaterThan(0)
  })

  test('client component inside streamed RSC adds extra modulepreload links', async ({
    page,
  }) => {
    const basicHtml = await (await page.goto('/rsc-basic'))?.text()
    const clientInRscHtml = await (
      await page.goto('/rsc-client-in-rsc')
    )?.text()

    expect(basicHtml).toBeDefined()
    expect(clientInRscHtml).toBeDefined()

    const basicPreloads = getModulePreloads(basicHtml!)
    const clientInRscPreloads = getModulePreloads(clientInRscHtml!)

    expect(clientInRscPreloads.length).toBeGreaterThan(basicPreloads.length)

    const basicPreloadSet = new Set(basicPreloads)
    const extraPreloads = clientInRscPreloads.filter(
      (href) => !basicPreloadSet.has(href),
    )

    expect(extraPreloads.length).toBeGreaterThan(0)
  })

  test('composite component route emits modulepreload links for slot client modules', async ({
    page,
  }) => {
    const response = await page.goto('/rsc-slots')
    const html = await response?.text()
    expect(html).toBeDefined()

    const modulepreloads = getModulePreloads(html!)
    expect(modulepreloads.length).toBeGreaterThan(1)

    const asyncPreloads = modulepreloads.filter((href) =>
      href.includes('/static/js/async/'),
    )
    expect(asyncPreloads.length).toBeGreaterThan(0)
  })

  test('home page has fewer preloads than route pages', async ({ page }) => {
    // Home page should have mostly entry preloads
    const homeResponse = await page.goto('/')
    const homeHtml = await homeResponse?.text()

    const homePreloads =
      homeHtml!.match(/<link rel="modulepreload" href="[^"]*"/g) || []

    // Route page should have more preloads (entry + route chunks)
    const routeResponse = await page.goto('/rsc-basic')
    const routeHtml = await routeResponse?.text()

    const routePreloads =
      routeHtml!.match(/<link rel="modulepreload" href="[^"]*"/g) || []

    // Route pages should have more preloads than the home page
    // (home page has entry + index route chunks, but rsc-basic has more)
    expect(routePreloads.length).toBeGreaterThanOrEqual(homePreloads.length)
  })

  test('CSS stylesheets are included in head for routes with CSS', async ({
    page,
  }) => {
    const response = await page.goto('/rsc-css-modules')
    const html = await response?.text()
    expect(html).toBeDefined()

    // Should include stylesheet links in head. Rsbuild now emits the route CSS
    // hrefs directly in dev and prod.
    expect(html).toContain('rel="stylesheet"')

    const routeStylesheets = html!.match(
      /<link rel="stylesheet" href="[^"]*\/static\/css(?:\/async)?\/[^"]*" type="text\/css"[^>]*data-rsc-css-href[^>]*>/g,
    )
    expect(routeStylesheets).toBeTruthy()
    expect(routeStylesheets!.length).toBeGreaterThan(0)
  })

  test('alternate RSC CSS route emits stylesheet without route hack import', async ({
    page,
  }) => {
    const response = await page.goto('/rsc-css-alt')
    const html = await response?.text()
    expect(html).toBeDefined()

    const routeStylesheets = html!.match(
      /<link rel="stylesheet" href="[^"]*\/static\/css(?:\/async)?\/[^"]*" type="text\/css"[^>]*data-rsc-css-href[^>]*>/g,
    )
    expect(routeStylesheets).toBeTruthy()
    expect(routeStylesheets!.length).toBeGreaterThan(0)
  })
})
