import { expect } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from '@tanstack/router-e2e-utils'

const isDev = process.env.MODE === 'dev'
const componentFile = path.join(
  process.cwd(),
  'src/utils/basicServerComponent.tsx',
)
const baselineRole = 'Senior Software Engineer'
const updatedRole = 'Principal Software Engineer'

let originalComponentSource: string

test.describe('RSC HMR (Rsbuild)', () => {
  test.skip(!isDev, 'Dev-only HMR repro')

  test.beforeAll(async () => {
    originalComponentSource = await readFile(componentFile, 'utf8')
  })

  test.beforeEach(async () => {
    const currentSource = await readFile(componentFile, 'utf8')
    if (currentSource !== originalComponentSource) {
      await writeFile(componentFile, originalComponentSource)
    }
  })

  test.afterAll(async () => {
    const currentSource = await readFile(componentFile, 'utf8')
    if (currentSource !== originalComponentSource) {
      await writeFile(componentFile, originalComponentSource)
    }
  })

  test('updates a server component without re-hydrating the app shell', async ({
    page,
  }) => {
    const pageErrors: Array<string> = []
    const consoleErrors: Array<string> = []

    page.on('pageerror', (error) => {
      pageErrors.push(String(error))
    })
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })

    await page.goto('/rsc-basic')
    await page.waitForURL('/rsc-basic')
    await expect(page.getByTestId('rsc-basic-hydrated')).toBeVisible()
    await page.getByTestId('rsc-basic-increment').click()
    await page.getByTestId('rsc-basic-message').fill('preserve me')
    await expect(page.getByTestId('rsc-basic-count')).toHaveText('Count: 1')
    await expect(page.getByTestId('rsc-label')).toContainText('Sarah Chen')
    await expect(page.getByText(baselineRole)).toBeVisible()

    const currentSource = await readFile(componentFile, 'utf8')
    if (!currentSource.includes(baselineRole)) {
      throw new Error(
        `Expected file to include ${JSON.stringify(baselineRole)}`,
      )
    }

    await writeFile(
      componentFile,
      currentSource.replace(baselineRole, updatedRole),
    )

    await expect(page.getByText(updatedRole)).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId('rsc-basic-hydrated')).toBeVisible()
    await expect(page.getByTestId('rsc-basic-count')).toHaveText('Count: 1')
    await expect(page.getByTestId('rsc-basic-message')).toHaveValue(
      'preserve me',
    )

    const bootstrapErrors = [...pageErrors, ...consoleErrors].filter(
      (message) =>
        message.includes('Expected to find bootstrap data on window.$_TSR'),
    )

    expect(bootstrapErrors).toEqual([])
  })
})
