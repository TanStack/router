import { expect, test } from 'vitest'
import { appFiles, rows, show } from './rsc-css-rsbuild-app'
import { errorsOf } from './rsc-app'
import { blankPage, startRscRsbuildDevServer } from './rsc-serial'

// SPEC J4.16: discovery and wiring use the configured root, not the process
// working directory.
// On main, the dev server (and build) fails with "Module not found".
test('Rsbuild: the app compiles when the process does not run in the app directory', async () => {
  const page = await blankPage()
  const server = await startRscRsbuildDevServer({
    browser: true,
    inAppDirectory: false,
    files: appFiles,
  })
  expect(server.errors).toEqual([])
  await show(page, server, rows[0]!.path)
  expect(errorsOf(page)).toEqual([])
})
