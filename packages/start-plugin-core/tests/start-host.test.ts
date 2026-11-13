import path from 'node:path'
import { beforeAll, expect, test } from 'vitest'
import { inPage, useStartHost } from './regression-helpers'

// Controls of the harness (`./start-host`), not of the compiler.

const host = useStartHost()
beforeAll(async () => {
  await (await host()).page()
}, 60_000)

// Source: Windows x64 CI of #8817: one `net::ERR_NO_BUFFER_SPACE` failed 18
// tests of a file. Chromium keeps a failed module fetch in the document's
// module map, and the host's page keeps its document from one run to the
// next, so every later case that imports the same module failed without a
// request.
test('a module request that fails in transport fails no run', async () => {
  const startHost = await host()
  // A module the cases share, new to the page: a host an earlier file of
  // the process gave back has loaded the app's own shared modules already
  const shared = await startHost.case({
    'shared.ts': `export const value = 'shared'`,
  })
  const sharedPath = shared.url('shared.ts')
  const { page } = await startHost.page()
  const failed: Array<string> = []
  // Once, its first request
  await page.route(
    (url) => url.pathname === sharedPath,
    (route) => {
      failed.push(route.request().url())
      return route.abort('failed')
    },
    { times: 1 },
  )
  for (let index = 0; index < 3; index++) {
    const startCase = await startHost.case({
      'module.tsx': `export { value } from '../${path.posix.basename(shared.dir)}/shared'`,
    })
    expect(await inPage(startCase, 'return module.value')).toBe('shared')
  }
  expect(failed).toHaveLength(1)
})
