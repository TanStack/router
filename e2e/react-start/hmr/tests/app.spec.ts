import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const whitelistErrors = [
  'Failed to load resource: net::ERR_NAME_NOT_RESOLVED',
  'Failed to load resource: the server responded with a status of 504',
]

const routeFile = path.join(process.cwd(), 'src/routes/index.tsx')

async function replaceRouteText(from: string, to: string) {
  const source = await readFile(routeFile, 'utf8')

  if (!source.includes(from)) {
    throw new Error(`Expected route file to include ${JSON.stringify(from)}`)
  }

  await writeFile(routeFile, source.replace(from, to))
}

test.describe('react-start hmr', () => {
  test.use({ whitelistErrors })

  test('preserves local state for code-split route component HMR', async ({
    page,
  }) => {
    await page.goto('/')
    await page.getByTestId('hydrated').waitFor({ state: 'visible' })

    await page.getByTestId('increment').click()
    await page.getByTestId('message').fill('hmr state')

    await expect(page.getByTestId('count')).toHaveText('Count: 1')
    await expect(page.getByTestId('marker')).toHaveText('baseline')

    await replaceRouteText('baseline', 'updated')

    try {
      await expect(page.getByTestId('marker')).toHaveText('updated')
      await expect(page.getByTestId('count')).toHaveText('Count: 1')
      await expect(page.getByTestId('message')).toHaveValue('hmr state')
    } finally {
      await replaceRouteText('updated', 'baseline')
      await expect(page.getByTestId('marker')).toHaveText('baseline')
    }
  })
})
