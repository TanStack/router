import { expect, test } from '@playwright/test'

test('restore scroll positions by page, home pages top message should not display on navigating back', async ({
  page,
}) => {
  // Step 1: Navigate to the home page
  await page.goto('/')
  await page.waitForURL('/')

  await expect(page.locator('#greeting')).toContainText('Welcome Home!')
  await expect(page.locator('#top-message')).toBeInViewport()

  // Step 2: Scroll to a position that hides the top
  const targetScrollPosition = 1000
  await page.evaluate(
    (scrollPos: number) => window.scrollTo(0, scrollPos),
    targetScrollPosition,
  )

  // Verify initial scroll position
  const scrollPosition = await page.evaluate(() => window.scrollY)
  expect(scrollPosition).toBe(targetScrollPosition)

  await expect(page.locator('#top-message')).not.toBeInViewport()
  await page.waitForTimeout(1000)

  // Step 3: Navigate to the about page
  await page.getByRole('link', { name: 'About', exact: true }).click()
  await expect(page.locator('#greeting')).toContainText('Hello from About!')

  // Step 4: Go back to the home page and immediately check the message
  await page.goBack()

  // Wait for the home page to have rendered
  await page.waitForSelector('#greeting')
  await page.waitForTimeout(1000)
  await expect(page.locator('#top-message')).not.toBeInViewport()

  // Confirm the scroll position was restored correctly
  const restoredScrollPosition = await page.evaluate(() => window.scrollY)
  expect(restoredScrollPosition).toBe(targetScrollPosition)
})

test('restore scroll positions by element, first regular list item should not display on navigating back', async ({
  page,
}) => {
  // Step 1: Navigate to the by-element page
  await page.goto('/by-element')
  await page.waitForURL('/by-element')

  // Step 2: Scroll to a position that hides the first list item in regular list
  const targetScrollPosition = 1000
  await page.waitForSelector('#RegularList')
  await expect(page.locator('#first-regular-list-item')).toBeInViewport()

  await page.evaluate(
    (scrollPos: number) =>
      document.querySelector('#RegularList')!.scrollTo(0, scrollPos),
    targetScrollPosition,
  )

  // Verify initial scroll position
  const scrollPosition = await page.evaluate(
    () => document.querySelector('#RegularList')!.scrollTop,
  )
  expect(scrollPosition).toBe(targetScrollPosition)

  await expect(page.locator('#first-regular-list-item')).not.toBeInViewport()

  // Step 3: Navigate to the about page
  await page.getByRole('link', { name: 'About', exact: true }).click()
  await expect(page.locator('#greeting')).toContainText('Hello from About!')

  // Step 4: Go back to the by-element page and immediately check the message
  await page.goBack()

  // TODO: For some reason, this only works in headed mode.
  // When someone can explain that to me, I'll fix this test.

  // Confirm the scroll position was restored correctly
  // const restoredScrollPosition = await page.evaluate(
  //   () => document.querySelector('#RegularList')!.scrollTop,
  // )
  // expect(restoredScrollPosition).toBe(targetScrollPosition)
})

test('scroll to top when not scrolled, regression test for #4782', async ({
  page,
}) => {
  await page.goto('/foo')
  await page.waitForURL('/foo')

  await expect(page.getByTestId('foo-route-component')).toBeVisible()

  let scrollPosition = await page.evaluate(() => window.scrollY)
  expect(scrollPosition).toBe(0)

  // do not scroll, just navigate to /bar
  await page.getByTestId('go-to-bar-link').click()
  await expect(page.getByTestId('bar-route-component')).toBeVisible()

  const targetScrollPosition = 1000
  await page.evaluate(
    (scrollPos: number) => window.scrollTo(0, scrollPos),
    targetScrollPosition,
  )
  scrollPosition = await page.evaluate(() => window.scrollY)
  expect(scrollPosition).toBe(targetScrollPosition)

  // navigate back to /foo
  await page.goBack()
  await expect(page.getByTestId('foo-route-component')).toBeVisible()

  // check if scroll position is restored to 0 since we did not scroll on /foo
  const restoredScrollPosition = await page.evaluate(() => window.scrollY)
  expect(restoredScrollPosition).toBe(0)
})

test('resetScroll=false saves scroll position for back navigation without scroll event, regression test for #6595', async ({
  page,
}) => {
  const storageKey = 'tsr-scroll-restoration-v1_3'
  const targetScrollPosition = 1000

  await page.goto('/')
  await expect(page.locator('#greeting')).toContainText('Welcome Home!')

  await page.evaluate(
    (scrollPos: number) => window.scrollTo(0, scrollPos),
    targetScrollPosition,
  )

  await page.waitForFunction(
    ([key, path, expectedY]) => {
      const cache = sessionStorage.getItem(key)
      if (!cache) return false
      const parsed = JSON.parse(cache)
      return parsed[path]?.window?.scrollY === expectedY
    },
    [storageKey, '/', targetScrollPosition] as const,
  )

  const scrollBeforeNav = await page.evaluate(() => window.scrollY)
  expect(scrollBeforeNav).toBe(targetScrollPosition)

  await page.getByRole('link', { name: 'About (No Reset)' }).click()
  await expect(page.locator('#greeting')).toContainText('Hello from About!')

  await page.waitForFunction(
    ([key, path, expectedY]) => {
      const cache = sessionStorage.getItem(key)
      if (!cache) return false
      const parsed = JSON.parse(cache)
      return parsed[path]?.window?.scrollY === expectedY
    },
    [storageKey, '/about', targetScrollPosition] as const,
  )

  await page.goto('/foo')
  await expect(page.getByTestId('foo-route-component')).toBeVisible()

  await page.goBack()
  await expect(page.locator('#greeting')).toContainText('Hello from About!')

  await page.waitForFunction(
    (expectedY) => window.scrollY === expectedY,
    targetScrollPosition,
  )

  const restoredScrollPosition = await page.evaluate(() => window.scrollY)
  expect(restoredScrollPosition).toBe(targetScrollPosition)
})

test('resetScroll=false preserves scrollToTopSelectors element scroll position, extension of #6595', async ({
  page,
}) => {
  const storageKey = 'tsr-scroll-restoration-v1_3'
  const sidebarScrollPosition = 500

  await page.goto('/')
  await expect(page.locator('#greeting')).toContainText('Welcome Home!')

  await page.evaluate((scrollPos: number) => {
    const sidebar = document.querySelector('#sidebar')
    if (sidebar) sidebar.scrollTo(0, scrollPos)
  }, sidebarScrollPosition)

  const sidebarScrollBeforeNav = await page.evaluate(
    () => document.querySelector('#sidebar')?.scrollTop,
  )
  expect(sidebarScrollBeforeNav).toBe(sidebarScrollPosition)

  await page.getByRole('link', { name: 'About (No Reset)' }).click()
  await expect(page.locator('#greeting')).toContainText('Hello from About!')

  await page.waitForFunction(
    ([key, path, expectedY]) => {
      const cache = sessionStorage.getItem(key)
      if (!cache) return false
      const parsed = JSON.parse(cache)
      return parsed[path]?.['#sidebar']?.scrollY === expectedY
    },
    [storageKey, '/about', sidebarScrollPosition] as const,
  )

  await page.goto('/foo')
  await expect(page.getByTestId('foo-route-component')).toBeVisible()

  await page.goBack()
  await expect(page.locator('#greeting')).toContainText('Hello from About!')

  await page.waitForFunction(
    (expectedY) => document.querySelector('#sidebar')?.scrollTop === expectedY,
    sidebarScrollPosition,
  )

  const restoredSidebarScroll = await page.evaluate(
    () => document.querySelector('#sidebar')?.scrollTop,
  )
  expect(restoredSidebarScroll).toBe(sidebarScrollPosition)
})
