import { beforeAll, expect, test } from 'vitest'
import { inPage, useStartHost } from './regression-helpers'
import { casesDir } from './start-host'

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
  const { page } = await startHost.page()
  const failed: Array<string> = []
  // Once, the first request of a module the cases share (not one of a case)
  await page.route(
    (url) => !url.pathname.startsWith(`/${casesDir}/`),
    (route) => {
      failed.push(route.request().url())
      return route.abort('failed')
    },
    { times: 1 },
  )
  for (let index = 0; index < 3; index++) {
    const startCase = await startHost.case({
      'module.tsx': `import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(async () => 1)
export const value = typeof fn`,
    })
    expect(await inPage(startCase, 'return module.value')).toBe('function')
  }
  expect(failed).toHaveLength(1)
})
