import { expect } from '@playwright/test'
import { createHmrFileEditor, test } from '@tanstack/router-e2e-utils'
import path from 'node:path'

const hmrExpect = expect.configure({ timeout: 20_000 })

const routeFiles = {
  rscHmrServerFn: path.join(process.cwd(), 'src/routes/rsc-hmr-serverfn.tsx'),
} as const

const editor = createHmrFileEditor({ files: routeFiles })

test.afterEach(async () => {
  await editor.capturePromise
  await editor.restoreFiles()
})

test.afterAll(async () => {
  await editor.capturePromise
  await editor.restoreFiles()
})

// Regression: a route file that also defines a `createServerFn` must still hot
// update its route component. On the buggy path the edit only reaches the rsc
// graph (`?tss-serverfn-split`) and the client component split
// (`?tsr-split=component`) is never produced, so the DOM never updates.
test('route component with a co-located server fn Fast Refreshes', async ({
  page,
}) => {
  await page.goto('/rsc-hmr-serverfn')
  await expect(page.getByTestId('app-hydrated')).toHaveText('hydrated')

  // Seed client-only state so we can prove the update was HMR, not a reload.
  await page.getByTestId('rsc-hmr-increment').click()
  await expect(page.getByTestId('rsc-hmr-count')).toHaveText('Count: 1')
  await expect(page.getByTestId('rsc-hmr-marker')).toHaveText('rsc-hmr-baseline')
  await expect(page.getByTestId('rsc-hmr-server-content')).toHaveText(
    'server-rendered content',
  )

  await editor.replaceText(
    'rscHmrServerFn',
    'rsc-hmr-baseline',
    'rsc-hmr-updated',
  )

  // FAILS on the buggy path: the marker never updates.
  await hmrExpect(page.getByTestId('rsc-hmr-marker')).toHaveText(
    'rsc-hmr-updated',
  )

  // The component hot-updated rather than fully reloading: local state survives.
  await expect(page.getByTestId('rsc-hmr-count')).toHaveText('Count: 1')
})
