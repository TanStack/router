import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/anchor')
})

// Testing the `Link` component with the `hashChangeScrollIntoView` prop
test('Navigating via anchor `Link` with default hash scrolling behavior', async ({
  page,
}) => {
  await expect(
    page.getByRole('heading', { name: 'Default Anchor' }),
  ).toBeAttached()

  await expect(
    page.getByRole('heading', { name: 'Default Anchor (shown)' }),
  ).not.toBeAttached()

  await page.getByRole('link', { name: 'Default Anchor' }).click()
  await expect(page.locator('#default-anchor')).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Default Anchor (shown)' }),
  ).toBeInViewport()
})

test('Navigating via anchor `Link` with hash scrolling disabled', async ({
  page,
}) => {
  const initialScrollPosition = await page.evaluate(() => window.scrollY)

  await expect(
    page.getByRole('heading', { name: 'No Scroll Into View' }),
  ).toBeAttached()

  await expect(
    page.getByRole('heading', { name: 'No Scroll Into View (shown)' }),
  ).not.toBeAttached()

  await page.getByRole('link', { name: 'No Scroll Into View' }).click()

  // Expect the same scroll position as before
  expect(await page.evaluate(() => window.scrollY)).toBe(initialScrollPosition)

  await expect(
    page.getByRole('heading', { name: 'No Scroll Into View' }),
  ).toBeAttached()

  await expect(
    page.getByRole('heading', { name: 'No Scroll Into View (shown)' }),
  ).not.toBeAttached()
})

test('Navigating via anchor `Link` with smooth hash scrolling behavior', async ({
  page,
}) => {
  await expect(
    page.getByRole('heading', { name: 'Smooth Scroll' }),
  ).toBeAttached()

  await expect(
    page.getByRole('heading', { name: 'Smooth Scroll (shown)' }),
  ).not.toBeAttached()

  await page.getByRole('link', { name: 'Smooth Scroll' }).click()
  await expect(page.locator('#smooth-scroll')).toBeVisible()

  // Smooth scrolling should activate the IntersectionObserver on all headings, making them all render "(shown)"
  await expect(
    page.getByRole('heading', { name: 'Default Anchor (shown)' }),
  ).toBeAttached()

  await expect(
    page.getByRole('heading', { name: 'No Scroll Into View (shown)' }),
  ).toBeAttached()

  await expect(
    page.getByRole('heading', { name: 'Smooth Scroll (shown)' }),
  ).toBeVisible()
})

// Testing the `useNavigate` hook with the `hashChangeScrollIntoView` option
test('Navigating via `useNavigate` with instant scroll behavior', async ({
  page,
}) => {
  await expect(
    page.getByRole('heading', { name: 'Smooth Scroll' }),
  ).toBeAttached()

  await expect(
    page.getByRole('heading', { name: 'Smooth Scroll (shown)' }),
  ).not.toBeAttached()

  // Scroll to the last anchor instantly, should not activate Intersection Observers for the other anchors
  await page.getByLabel('Target Anchor').selectOption('Smooth Scroll')
  await page.getByLabel('Scroll Into View', { exact: true }).check()
  await page.getByLabel('Behavior').selectOption('instant')
  await page.getByLabel('Block').selectOption('start')
  await page.getByLabel('Inline').selectOption('nearest')
  await page.getByRole('button', { name: 'Navigate' }).click()

  await expect(
    page.getByRole('heading', { name: 'Default Anchor (shown)' }),
  ).not.toBeAttached()

  await expect(
    page.getByRole('heading', { name: 'No Scroll Into View (shown)' }),
  ).not.toBeAttached()

  await expect(
    page.getByRole('heading', { name: 'Smooth Scroll (shown)' }),
  ).toBeVisible()
})

test('Navigating via `useNavigate` with scrollIntoView disabled', async ({
  page,
}) => {
  const initialScrollPosition = await page.evaluate(() => window.scrollY)

  await expect(
    page.getByRole('heading', { name: 'Default Anchor (shown)' }),
  ).not.toBeAttached()

  await expect(
    page.getByRole('heading', { name: 'No Scroll Into View (shown)' }),
  ).not.toBeAttached()

  await expect(
    page.getByRole('heading', { name: 'Smooth Scroll (shown)' }),
  ).not.toBeAttached()

  // Navigate to the last anchor, but with scrollIntoView disabled should not activate Intersection Observers for any anchors
  await page.getByLabel('Target Anchor').selectOption('Smooth Scroll')
  await page.getByLabel('Scroll Into View', { exact: true }).uncheck()
  await page.getByRole('button', { name: 'Navigate' }).click()

  await expect(
    page.getByRole('heading', { name: 'Default Anchor (shown)' }),
  ).not.toBeAttached()

  await expect(
    page.getByRole('heading', { name: 'No Scroll Into View (shown)' }),
  ).not.toBeAttached()

  await expect(
    page.getByRole('heading', { name: 'Smooth Scroll (shown)' }),
  ).not.toBeAttached()

  // Expect the same scroll position as before
  expect(await page.evaluate(() => window.scrollY)).toBe(initialScrollPosition)
})

test('Navigating via `useNavigate` with smooth scroll behavior', async ({
  page,
}) => {
  await expect(
    page.getByRole('heading', { name: 'Smooth Scroll' }),
  ).toBeAttached()

  await expect(
    page.getByRole('heading', { name: 'Smooth Scroll (shown)' }),
  ).not.toBeAttached()

  // Scroll to the last anchor smoothly, should activate Intersection Observers for the other anchors, making them all render "(shown)"
  await page.getByLabel('Target Anchor').selectOption('Smooth Scroll')
  await page.getByLabel('Scroll Into View', { exact: true }).check()
  await page.getByLabel('Behavior').selectOption('smooth')
  await page.getByLabel('Block').selectOption('start')
  await page.getByLabel('Inline').selectOption('nearest')
  await page.getByRole('button', { name: 'Navigate' }).click()

  await expect(
    page.getByRole('heading', { name: 'Default Anchor (shown)' }),
  ).toBeAttached()

  await expect(
    page.getByRole('heading', { name: 'No Scroll Into View (shown)' }),
  ).toBeAttached()

  await expect(
    page.getByRole('heading', { name: 'Smooth Scroll (shown)' }),
  ).toBeVisible()
})
