import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    ;(window as any).__viewTransitionCalls = []
    ;(document as any).startViewTransition = (arg: any) => {
      ;(window as any).__viewTransitionCalls.push(arg)

      try {
        if (
          arg &&
          typeof arg === 'object' &&
          typeof arg.update === 'function'
        ) {
          arg.update()
        } else if (typeof arg === 'function') {
          arg()
        }
      } catch {
        // ignore
      }

      return { finished: Promise.resolve() }
    }
  })

  await page.goto('/')
})

test('navigation uses View Transitions API', async ({ page }) => {
  await page.getByRole('link', { name: 'Next Page ->' }).click()
  await expect(page).toHaveURL(/\/how-it-works$/)

  const calls = await page.evaluate(() => (window as any).__viewTransitionCalls)
  expect(Array.isArray(calls)).toBe(true)
  expect(calls.length).toBeGreaterThan(0)
})
