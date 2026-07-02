import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'
import type { Page } from '@playwright/test'

const testCount = 7

type BrowserEvent = { type: string; t: number }

function findEvent(events: Array<BrowserEvent>, type: string) {
  const event = events.find((entry) => entry.type === type)
  expect(event, `Expected browser event "${type}"`).toBeTruthy()
  return event!
}

function findLastEvent(events: Array<BrowserEvent>, type: string) {
  let event: BrowserEvent | undefined
  for (let index = events.length - 1; index >= 0; index--) {
    if (events[index]!.type === type) {
      event = events[index]
      break
    }
  }
  expect(event, `Expected browser event "${type}"`).toBeTruthy()
  return event!
}

async function expectSsrFalsePendingMin(page: Page) {
  const errors: Array<string> = []

  page.on('pageerror', (err) => {
    errors.push(err.message)
  })
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text())
    }
  })

  await page.goto('/ssr-false-pending-min')

  const pending = page.getByTestId('ssr-false-pending')
  const visiblePending = page.locator(
    '[data-testid="ssr-false-pending"]:visible',
  )
  const target = page.getByTestId('ssr-false-target')

  await expect(visiblePending).toHaveCount(1)

  await page.waitForTimeout(500)

  await expect(visiblePending).toHaveCount(1)
  await expect(target).toBeHidden()

  await expect(target).toBeVisible()
  await expect(pending).toHaveCount(0)

  const events = await page.evaluate<Array<BrowserEvent>>(
    () => (window as any).__events ?? [],
  )
  const pendingMounted = findEvent(events, 'pending-mounted')
  const pendingUnmounted = findLastEvent(events, 'pending-unmounted')
  const targetMounted = findEvent(events, 'target-mounted')
  const loaderDone = findEvent(events, 'loader-done')

  expect(loaderDone.t - pendingMounted.t).toBeLessThan(500)
  expect(pendingUnmounted.t - pendingMounted.t).toBeGreaterThanOrEqual(1400)
  expect(targetMounted.t - pendingMounted.t).toBeGreaterThanOrEqual(1400)
  expect(errors).toEqual([])
}

test.describe('selective ssr', () => {
  test('testcount matches', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByTestId('test-count')).toHaveText(`${testCount}`)
  })

  for (let i = 0; i < testCount; i++) {
    test(`run test ${i}`, async ({ page }) => {
      await page.goto('/')
      const testId = `testcase-${i}-link`
      await page.getByTestId(testId).click()

      // wait for page to be loaded by waiting for the leaf route to be rendered
      await expect(page.getByTestId('postId-heading')).toContainText('postId')

      // check expectations
      await Promise.all(
        ['root', 'posts', 'postId'].map(async (route) => {
          const expectedData = await page
            .getByTestId(`${route}-data-expected`)
            .textContent()
          expect(expectedData).not.toBeNull()
          await expect(page.getByTestId(`${route}-loader`)).toContainText(
            expectedData!,
          )
          await expect(page.getByTestId(`${route}-context`)).toContainText(
            expectedData!,
          )
        }),
      )
      await expect(page.getByTestId('router-isLoading')).toContainText('false')
      await expect(page.getByTestId('router-status')).toContainText('idle')
    })
  }

  test('direct ssr false hydration keeps pending visible for pendingMinMs', async ({
    page,
  }) => {
    await expectSsrFalsePendingMin(page)
  })
})
