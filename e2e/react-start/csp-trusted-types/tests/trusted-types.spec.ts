import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

test('CSP header is set with Trusted Types enforcement', async ({ page }) => {
  const response = await page.goto('/')
  const csp = response?.headers()['content-security-policy']
  expect(csp).toContain("require-trusted-types-for 'script'")
})

test('Hydration works with Trusted Types enabled', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('counter-value')).toContainText('0')

  // Verify hydration by clicking counter
  await page.getByTestId('counter-btn').click()
  await expect(page.getByTestId('counter-value')).toContainText('1')
})

test('Client-side navigation works', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('csp-heading')).toBeVisible()

  const violations: Array<string> = []
  const logViolation = (text: string) => {
    const lowerText = text.toLowerCase()
    if (
      lowerText.includes('trusted type') ||
      lowerText.includes('content security policy') ||
      lowerText.includes('trustedscript')
    ) {
      violations.push(text)
    }
  }

  page.on('console', (msg) => logViolation(msg.text()))
  page.on('pageerror', (err) => logViolation(err.message))

  await page.getByRole('link', { name: 'Other' }).click()
  await expect(page.getByTestId('other-heading')).toBeVisible()

  // Check that the script on the other page actually executed
  const scriptExecuted = await page.evaluate(
    () => (window as any).__OTHER_PAGE_LOADED__,
  )
  expect(typeof scriptExecuted).toBe('number')
})
