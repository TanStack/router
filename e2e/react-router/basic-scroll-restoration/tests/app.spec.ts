import { expect, test } from '@playwright/test'

test('restore scroll positions by page, home pages top message should not display "shown" on navigating back', async ({
  page,
}) => {
  // Step 1: Navigate to the home page
  await page.goto('/')

  await expect(page.locator('#greeting')).toContainText('Welcome Home!')
  await expect(page.locator('#top-message')).toContainText('shown')

  // Step 2: Scroll to a position that hides the top
  const targetScrollPosition = 1000
  await page.evaluate(
    (scrollPos: number) => window.scrollTo(0, scrollPos),
    targetScrollPosition,
  )

  // Verify initial scroll position
  const scrollPosition = await page.evaluate(() => window.scrollY)
  expect(scrollPosition).toBe(targetScrollPosition)

  await expect(page.locator('#top-message')).toContainText('shown')

  // Step 3: Navigate to the about page
  await page.getByRole('link', { name: 'About', exact: true }).click()
  await expect(page.locator('#greeting')).toContainText('Hello from About!')

  // Step 4: Go back to the home page and immediately check the message
  await page.goBack()

  // Verify that the home page's top message is not shown to the user
  await expect(page.locator('#top-message')).toContainText('not shown')

  // Confirm the scroll position was restored correctly
  const restoredScrollPosition = await page.evaluate(() => window.scrollY)
  expect(restoredScrollPosition).toBe(targetScrollPosition)
})

test('restore scroll positions by element, first regular list item should not display "shown" on navigating back', async ({
  page,
}) => {
  // Step 1: Navigate to the by-element page
  await page.goto('/by-element')

  // Step 2: Scroll to a position that hides the first list item in regular list
  const targetScrollPosition = 1000
  await page.waitForSelector('#RegularList')
  await expect(page.locator('#first-regular-list-item')).toContainText('shown')

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

  // Step 3: Navigate to the about page
  await page.getByRole('link', { name: 'About', exact: true }).click()
  await expect(page.locator('#greeting')).toContainText('Hello from About!')

  // Step 4: Go back to the by-element page and immediately check the message
  await page.goBack()
  await page.waitForSelector('#RegularList')
  await expect(page.locator('#first-regular-list-item')).toContainText(
    'not shown',
  )

  // Confirm the scroll position was restored correctly
  const restoredScrollPosition = await page.evaluate(
    () => document.querySelector('#RegularList')!.scrollTop,
  )
  expect(restoredScrollPosition).toBe(targetScrollPosition)
})
