import { expect, test } from 'vitest'
import { startRscRsbuildDevServer } from './rsc-app'
import { appFiles, rows, show } from './rsc-css-rsbuild-app'

// SPEC J4.16: discovery and wiring use the configured root, not the process
// working directory.
// On main, the dev server (and build) fails with "Module not found".
test('Rsbuild: the app compiles when the process does not run in the app directory', async () => {
  const server = await startRscRsbuildDevServer({
    browser: true,
    inAppDirectory: false,
    files: appFiles,
  })
  expect(server.errors).toEqual([])
  const page = await show(server, rows[0]!.path)
  expect(page.errors).toEqual([])
})
