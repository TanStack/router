import path from 'node:path'
import { expect } from '@playwright/test'
import { createHmrFileEditor, test } from '@tanstack/router-e2e-utils'

const baselineHeading = 'Octane + TanStack Start'
const updatedHeading = 'Octane + TanStack Start HMR'
const routeEditor = createHmrFileEditor({
  files: {
    index: path.join(process.cwd(), 'src/routes/index.tsrx'),
  },
  normalizeSource: (_fileKey, source) =>
    source.split(updatedHeading).join(baselineHeading),
})

test.afterAll(async () => {
  await routeEditor.capturePromise
  await routeEditor.restoreFiles()
})

test('hot updates a code-split tsrx route without losing state', async ({
  page,
}) => {
  const hydrationErrors: Array<string> = []
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      hydrationErrors.push(message.text())
    }
  })
  page.on('pageerror', (error) => hydrationErrors.push(error.message))

  await routeEditor.capturePromise
  await page.goto('/?probe=hmr')
  await expect(page.getByTestId('home-heading')).toHaveText(baselineHeading)

  await page.getByTestId('counter').click()
  await expect(page.getByTestId('counter')).toHaveText('count 1')

  try {
    await routeEditor.replaceText('index', baselineHeading, updatedHeading)
    await expect(page.getByTestId('home-heading')).toHaveText(updatedHeading, {
      timeout: 20_000,
    })
    await expect(page.getByTestId('counter')).toHaveText('count 1')
  } finally {
    await routeEditor.restoreFiles()
  }

  await expect(page.getByTestId('home-heading')).toHaveText(baselineHeading, {
    timeout: 20_000,
  })
  await expect(page.getByTestId('counter')).toHaveText('count 1')
  await expect(page.locator('#__app nav')).toHaveCount(1)
  await expect(page.locator('#__app main')).toHaveCount(1)
  expect(hydrationErrors).toEqual([])
})
