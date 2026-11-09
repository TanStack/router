import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'
import type { Page } from '@playwright/test'

test.use({
  whitelistErrors: [/Failed to load resource.*500/],
})

async function expectHydratedErrorComponent(
  page: Page,
  path: string,
  message: string,
) {
  const hydrationWarnings: Array<string> = []
  page.on('console', (consoleMessage) => {
    if (
      consoleMessage.text().includes('Hydration key miss') ||
      consoleMessage.text().includes('unclaimed server-rendered')
    ) {
      hydrationWarnings.push(consoleMessage.text())
    }
  })

  const response = await page.goto(path)

  expect(response?.status()).toBe(500)
  await expect(page.getByTestId('route-content')).toHaveCount(0)
  await expect(page.getByTestId('error-message')).toHaveText(message)

  const button = page.getByTestId('error-component-button')
  await expect(button).toHaveAttribute('data-clicked', 'false')
  await button.click()
  await expect(button).toHaveAttribute('data-clicked', 'true')
  expect(hydrationWarnings).toEqual([])
}

test('SSR error component is claimed during hydration and remains interactive', async ({
  page,
}) => {
  await expectHydratedErrorComponent(
    page,
    '/error-component-hydration',
    'loader failed',
  )
})

test('falsy loader errors still render an interactive hydrated error component', async ({
  page,
}) => {
  await expectHydratedErrorComponent(
    page,
    '/error-component-hydration?falsy=true',
    'undefined',
  )
})
