import { expect, test } from '@playwright/test'
import { linkOptions } from '@tanstack/react-router'
import { toRuntimePath } from '@tanstack/router-e2e-utils'

test('Smoke - Renders home', async ({ page }) => {
  await page.goto(toRuntimePath('/'))
  await expect(
    page.getByRole('heading', { name: 'Welcome Home!' }),
  ).toBeVisible()
})

const pages = [
  linkOptions({ to: '/normal-page' }),
  linkOptions({ to: '/lazy-page' }),
  linkOptions({ to: '/virtual-page' }),
  linkOptions({ to: '/lazy-with-loader-page' }),
  linkOptions({ to: '/page-with-search', search: { where: 'footer' } }),
] as const

pages.forEach((options, index) => {
  const from = index === 0 ? pages[1].to : pages[0].to
  test(`On navigate from ${from} to ${options.to} (from the footer), scroll should be at top`, async ({
    page,
  }) => {
    await page.goto(toRuntimePath(from))
    const link = page.getByTestId(`Foot-${options.to}-link`)
    await link.scrollIntoViewIfNeeded()
    await page.waitForTimeout(500)
    await link.click()
    await expect(page.getByTestId('at-the-top')).toBeInViewport()
  })
})

// Test for scroll related stuff
pages.forEach((options) => {
  test(`On navigate to ${options.to} (from the header), scroll should be at top`, async ({
    page,
  }) => {
    await page.goto(toRuntimePath('/'))
    await page.getByTestId(`Head-${options.to}-link`).click()
    await expect(page.getByTestId('at-the-top')).toBeInViewport()
  })

  // scroll should be at the bottom on navigation after the page is loaded
  test(`On navigate via index page tests to ${options.to}, scroll should resolve at the bottom`, async ({
    page,
  }) => {
    await page.goto(toRuntimePath('/'))
    await page.getByTestId(`index-${options.to}-hash-link`).click()
    await expect(page.getByTestId('at-the-bottom')).toBeInViewport()
  })

  // scroll should be at the bottom on first load
  test(`On first load of ${options.to}, scroll should resolve resolve at the bottom`, async ({
    page,
  }) => {
    let url: string = options.to
    if ('search' in options) {
      url = `${url}?where=${options.search.where}`
    }
    await page.goto(toRuntimePath(`${url}#at-the-bottom`))
    await expect(page.getByTestId('at-the-bottom')).toBeInViewport()
  })
})

// Test for scrollRestorationBehavior option
test('scrollRestorationBehavior: smooth should pass behavior to window.scrollTo', async ({
  page,
}) => {
  // Intercept window.scrollTo to capture calls with their options
  await page.addInitScript(() => {
    ;(window as any).__scrollToCalls = []
    const originalScrollTo = window.scrollTo.bind(window)
    window.scrollTo = ((...args: any[]) => {
      ;(window as any).__scrollToCalls.push(args)
      return originalScrollTo(...args)
    }) as typeof window.scrollTo
  })

  // First go to /normal-page
  await page.goto(toRuntimePath('/normal-page'))
  await expect(page.getByTestId('at-the-top')).toBeInViewport()

  // Scroll down a bit
  await page.evaluate(() => window.scrollBy(0, 300))
  await page.waitForTimeout(200)

  // Go back to home
  await page.getByTestId('Head-home-link').click()
  await expect(
    page.getByRole('heading', { name: 'Welcome Home!' }),
  ).toBeVisible()

  // Clear any scroll calls from previous navigations
  await page.evaluate(() => {
    ;(window as any).__scrollToCalls = []
  })

  // Click link with scrollRestorationBehavior: 'smooth'
  await page.getByTestId('smooth-scroll-link').click()
  await expect(page.getByTestId('at-the-top')).toBeInViewport()

  // Get the scroll calls and find the one with behavior option
  const smoothCalls = await page.evaluate(() => (window as any).__scrollToCalls)

  // There should be at least one scrollTo call with behavior: 'smooth'
  const hasSmoothBehavior = smoothCalls.some(
    (call: any) => call[0]?.behavior === 'smooth',
  )
  expect(hasSmoothBehavior).toBe(true)
})

test('scrollRestorationBehavior should reset to default after navigation', async ({
  page,
}) => {
  // Intercept window.scrollTo to capture calls with their options
  await page.addInitScript(() => {
    ;(window as any).__scrollToCalls = []
    const originalScrollTo = window.scrollTo.bind(window)
    window.scrollTo = ((...args: any[]) => {
      ;(window as any).__scrollToCalls.push(args)
      return originalScrollTo(...args)
    }) as typeof window.scrollTo
  })

  // First go to /normal-page
  await page.goto(toRuntimePath('/normal-page'))
  await expect(page.getByTestId('at-the-top')).toBeInViewport()

  // Scroll down a bit
  await page.evaluate(() => window.scrollBy(0, 300))
  await page.waitForTimeout(200)

  // Go back to home
  await page.getByTestId('Head-home-link').click()
  await expect(
    page.getByRole('heading', { name: 'Welcome Home!' }),
  ).toBeVisible()

  // Navigate with smooth scroll
  await page.getByTestId('smooth-scroll-link').click()
  await expect(page.getByTestId('at-the-top')).toBeInViewport()

  // Scroll down a bit on normal-page
  await page.evaluate(() => window.scrollBy(0, 300))
  await page.waitForTimeout(200)

  // Navigate back to home
  await page.getByTestId('Head-home-link').click()
  await expect(
    page.getByRole('heading', { name: 'Welcome Home!' }),
  ).toBeVisible()

  // Clear scroll calls
  await page.evaluate(() => {
    ;(window as any).__scrollToCalls = []
  })

  // Now navigate with default scroll (no scrollRestorationBehavior)
  await page.getByTestId('default-scroll-link').click()
  await expect(page.getByTestId('at-the-top')).toBeInViewport()

  // Get the scroll calls - should NOT have behavior: 'smooth'
  const defaultCalls = await page.evaluate(
    () => (window as any).__scrollToCalls,
  )

  // The scrollTo calls should not have behavior: 'smooth'
  // (they should have undefined behavior or no behavior property)
  const hasSmoothBehavior = defaultCalls.some(
    (call: any) => call[0]?.behavior === 'smooth',
  )
  expect(hasSmoothBehavior).toBe(false)
})

// Test for imperative navigate() with scrollRestorationBehavior option
test('navigate() with scrollRestorationBehavior: smooth should pass behavior to window.scrollTo', async ({
  page,
}) => {
  // Intercept window.scrollTo to capture calls with their options
  await page.addInitScript(() => {
    ;(window as any).__scrollToCalls = []
    const originalScrollTo = window.scrollTo.bind(window)
    window.scrollTo = ((...args: any[]) => {
      ;(window as any).__scrollToCalls.push(args)
      return originalScrollTo(...args)
    }) as typeof window.scrollTo
  })

  // First go to /normal-page
  await page.goto(toRuntimePath('/normal-page'))
  await expect(page.getByTestId('at-the-top')).toBeInViewport()

  // Scroll down a bit
  await page.evaluate(() => window.scrollBy(0, 300))
  await page.waitForTimeout(200)

  // Go back to home
  await page.getByTestId('Head-home-link').click()
  await expect(
    page.getByRole('heading', { name: 'Welcome Home!' }),
  ).toBeVisible()

  // Clear any scroll calls from previous navigations
  await page.evaluate(() => {
    ;(window as any).__scrollToCalls = []
  })

  // Click button that uses navigate() with scrollRestorationBehavior: 'smooth'
  await page.getByTestId('smooth-scroll-navigate-btn').click()
  await expect(page.getByTestId('at-the-top')).toBeInViewport()

  // Get the scroll calls and find the one with behavior option
  const smoothCalls = await page.evaluate(() => (window as any).__scrollToCalls)

  // There should be at least one scrollTo call with behavior: 'smooth'
  const hasSmoothBehavior = smoothCalls.some(
    (call: any) => call[0]?.behavior === 'smooth',
  )
  expect(hasSmoothBehavior).toBe(true)
})

test('navigate() scrollRestorationBehavior should reset to default after navigation', async ({
  page,
}) => {
  // Intercept window.scrollTo to capture calls with their options
  await page.addInitScript(() => {
    ;(window as any).__scrollToCalls = []
    const originalScrollTo = window.scrollTo.bind(window)
    window.scrollTo = ((...args: any[]) => {
      ;(window as any).__scrollToCalls.push(args)
      return originalScrollTo(...args)
    }) as typeof window.scrollTo
  })

  // First go to /normal-page
  await page.goto(toRuntimePath('/normal-page'))
  await expect(page.getByTestId('at-the-top')).toBeInViewport()

  // Scroll down a bit
  await page.evaluate(() => window.scrollBy(0, 300))
  await page.waitForTimeout(200)

  // Go back to home
  await page.getByTestId('Head-home-link').click()
  await expect(
    page.getByRole('heading', { name: 'Welcome Home!' }),
  ).toBeVisible()

  // Navigate with smooth scroll using navigate()
  await page.getByTestId('smooth-scroll-navigate-btn').click()
  await expect(page.getByTestId('at-the-top')).toBeInViewport()

  // Scroll down a bit on normal-page
  await page.evaluate(() => window.scrollBy(0, 300))
  await page.waitForTimeout(200)

  // Navigate back to home
  await page.getByTestId('Head-home-link').click()
  await expect(
    page.getByRole('heading', { name: 'Welcome Home!' }),
  ).toBeVisible()

  // Clear scroll calls
  await page.evaluate(() => {
    ;(window as any).__scrollToCalls = []
  })

  // Now navigate with default scroll using navigate() (no scrollRestorationBehavior)
  await page.getByTestId('default-scroll-navigate-btn').click()
  await expect(page.getByTestId('at-the-top')).toBeInViewport()

  // Get the scroll calls - should NOT have behavior: 'smooth'
  const defaultCalls = await page.evaluate(
    () => (window as any).__scrollToCalls,
  )

  // The scrollTo calls should not have behavior: 'smooth'
  // (they should have undefined behavior or no behavior property)
  const hasSmoothBehavior = defaultCalls.some(
    (call: any) => call[0]?.behavior === 'smooth',
  )
  expect(hasSmoothBehavior).toBe(false)
})
