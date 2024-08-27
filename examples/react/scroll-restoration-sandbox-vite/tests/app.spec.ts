import { expect, test } from '@playwright/test'

test('Smoke - Renders home', async ({ page }) => {
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Welcome Home!' }),
  ).toBeVisible()
})

// Test for scroll related stuff
;[
  {
    href: '/normal-page',
  },
  {
    href: '/lazy-page',
  },
  {
    href: '/virtual-page',
  },
].forEach(({ href }) => {
  test(`On navigate to ${href} (from the header), scroll should be at top`, async ({
    page,
  }) => {
    await page.goto('/')
    await page.getByRole('link', { name: `Head-${href}` }).click()
    await expect(page.getByTestId('at-the-top')).toBeInViewport()
  })

  // scroll should be at the bottom on navigation after the page is loaded
  test(`On navigate via index page tests to ${href}, scroll should resolve at the bottom`, async ({
    page,
  }) => {
    await page.goto('/')
    await page.getByRole('link', { name: `${href}#at-the-bottom` }).click()
    await expect(page.getByTestId('at-the-bottom')).toBeInViewport()
  })

  // scroll should be at the bottom on first load
  test(`On first load of ${href}, scroll should resolve resolve at the bottom`, async ({
    page,
  }) => {
    await page.goto(`${href}#at-the-bottom`)
    await expect(page.getByTestId('at-the-bottom')).toBeInViewport()
  })
})
