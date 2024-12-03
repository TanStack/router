import { expect } from '@playwright/test'
import { linkOptions } from '@tanstack/react-router'
import { test } from './utils'

test.afterEach(async ({ setupApp }) => {
  await setupApp.killProcess()
})

test('Smoke - Renders home', async ({ page, setupApp: { ADDR } }) => {
  await page.goto(ADDR + '/')
  await expect(
    page.getByRole('heading', { name: 'Welcome Home!' }),
  ).toBeVisible()
})

// Test for scroll related stuff
;[
  linkOptions({ to: '/normal-page' }),
  // linkOptions({to:'/lazy-page'}),
  // linkOptions({to:'/virtual-page'}),
  // linkOptions({to:'/lazy-with-loader-page'}),
  linkOptions({ to: '/page-with-search', search: { where: 'footer' } }),
].forEach((options) => {
  test(`On navigate to ${options.to} (from the header), scroll should be at top`, async ({
    page,
    setupApp: { ADDR },
  }) => {
    await page.goto(ADDR + '/')
    await page.getByRole('link', { name: `Head-${options.to}` }).click()
    await expect(page.getByTestId('at-the-top')).toBeInViewport()
  })

  // scroll should be at the bottom on navigation after the page is loaded
  test(`On navigate via index page tests to ${options.to}, scroll should resolve at the bottom`, async ({
    page,
    setupApp: { ADDR },
  }) => {
    await page.goto(ADDR + '/')
    await page
      .getByRole('link', { name: `${options.to}#at-the-bottom` })
      .click()
    await expect(page.getByTestId('at-the-bottom')).toBeInViewport()
  })

  // scroll should be at the bottom on first load
  test(`On first load of ${options.to}, scroll should resolve resolve at the bottom`, async ({
    page,
    setupApp: { ADDR },
  }) => {
    let url: string = options.to
    if ('search' in options) {
      url = `${url}?where=${options.search}`
    }
    await page.goto(ADDR + `${url}#at-the-bottom`)
    await expect(page.getByTestId('at-the-bottom')).toBeInViewport()
  })
})
