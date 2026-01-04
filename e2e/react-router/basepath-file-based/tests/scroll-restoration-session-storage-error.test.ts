/* eslint-disable */
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const trackConsole = (page: Page) => {
  const consoleWarnings: Array<string> = []

  page.on('console', (msg) => {
    if (msg.type() === 'warning') {
      consoleWarnings.push(msg.text())
    }
  })

  return consoleWarnings
}

test.describe('Scroll Restoration with Session Storage Error', () => {
  test('should not crash when sessionStorage.setItem throws an error', async ({
    page,
  }) => {
    const consoleWarnings = trackConsole(page)

    await page.goto('/app/scroll-error')
    await page.waitForLoadState('networkidle')

    await page.evaluate(() => {
      sessionStorage.setItem = () => {
        throw new Error('Test Error')
      }
    })

    await page.evaluate(() => window.scrollTo(0, 200))
    await page.waitForTimeout(150)

    await page.click('a[href="/app/about"]')
    await page.waitForLoadState('networkidle')

    await page.goBack()
    await page.waitForLoadState('networkidle')

    expect(
      consoleWarnings.some((warning) =>
        warning.includes(
          '[ts-router] Could not persist scroll restoration state to sessionStorage.',
        ),
      ),
    ).toBeTruthy()

    const heading = page.locator('h1:has-text("Scroll Error Test")')
    await expect(heading).toBeVisible()

    const scrollPosition = await page.evaluate(() => window.scrollY)
    expect(scrollPosition).not.toBe(200)
  })

  test('should surface warning when sessionStorage quota is exceeded', async ({
    page,
  }) => {
    const consoleWarnings = trackConsole(page)

    await page.goto('/app/scroll-error')
    await page.waitForLoadState('networkidle')

    await page.evaluate(() => {
      let i = 0
      const chunk = 'x'.repeat(32)

      try {
        while (true) {
          sessionStorage.setItem(`key_${i}`, chunk)
          i += 1
        }
      } catch {
        console.log(`Stored ${i} keys in session storage`)
      }
    })

    await page.evaluate(() => window.scrollTo(0, 200))
    await page.waitForTimeout(150)

    await page.click('a[href="/app/about"]')
    await page.waitForLoadState('networkidle')

    await page.goBack()
    await page.waitForLoadState('networkidle')

    expect(
      consoleWarnings.some((warning) =>
        warning.includes(
          '[ts-router] Could not persist scroll restoration state to sessionStorage.',
        ),
      ),
    ).toBeTruthy()

    const heading = page.locator('h1:has-text("Scroll Error Test")')
    await expect(heading).toBeVisible()

    const scrollPosition = await page.evaluate(() => window.scrollY)
    expect(scrollPosition).not.toBe(200)
  })
})
