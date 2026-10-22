/**
 * Route options imported from another module under Start (FIX-PLAN V2-10;
 * SPEC J2.8, J2.14, J4.12): `createFileRoute('/x')(options)` with `options`
 * from `x.options.tsx`, holding a component, a loader and server handlers
 * that read a server-only helper (a neutral file name, so only the route
 * option's removal keeps it out of the client). The route works on the
 * server; the client build never ships the handlers silently: they and the
 * helper are absent from the client bundle, or the build reports or fails
 * naming the route file. Built with Start's Vite and Rsbuild plugins.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import {
  expectDiagnostic,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import {
  StartBuildError,
  buildStart,
  callByIdExports,
  startBundlers,
} from '../build-harness'
import type { StartBuild } from '../build-harness'

const timeout = 60_000

const files = {
  'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()
`,
  'src/admin-helper.ts': `export const readSecret = () => 'MARK_HELPER_SECRET'\n`,
  'src/x.options.tsx': `import { readSecret } from './admin-helper'
export const options = {
  component: () => <p>MARK_X_PAGE</p>,
  loader: () => 'MARK_X_DATA',
  server: { handlers: { GET: () => new Response(readSecret()) } },
}
`,
  'src/routes/x.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { options } from '../x.options'
export const Route = createFileRoute('/x')(options)
`,
  'src/router.ts': `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export const getRouter = () => createRouter({ routeTree })
`,
  'src/client-entry.ts': `export { getRouter } from './router'\n`,
  'src/ssr-entry.ts': `export { getRouter } from './router'
export { renderPath } from '../harness/render'
${callByIdExports}`,
}

describe.each(startBundlers)('%s build', (bundler) => {
  let build: StartBuild | undefined
  let failure: StartBuildError | undefined
  let dispose: (() => Promise<void>) | undefined

  beforeAll(async () => {
    try {
      build = await buildStart({
        bundler,
        files,
        entry: { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' },
        registerCleanup: (cleanup) => {
          dispose = cleanup
        },
      })
    } catch (error) {
      if (!(error instanceof StartBuildError)) {
        throw error
      }
      failure = error
    }
  }, timeout)
  afterAll(() => dispose?.())

  test('the route renders and its handler answers on the server', async () => {
    if (failure) {
      // A refusal names the route file and the option it cannot read, and
      // explains what to do (SPEC J2.8, §5.7)
      expectDiagnostic(failure.diagnostics, {
        severity: 'error',
        file: 'src/routes/x.tsx',
        names: [['server', 'handlers']],
        explains: true,
      })
      return
    }
    expect(build).toBeDefined()
    const { result } = await build!.ssr.run(`const router = entry.getRouter()
const response = await entry.startServerEntry.fetch(new Request('http://localhost/x'))
return {
  page: await entry.renderPath(router.routeTree, '/x'),
  loader: await router.routeTree.children.find((route) => route.options.id === '/x').options.loader(),
  handler: await response.text(),
}`)
    expect(result).toEqual({
      page: expect.stringContaining('MARK_X_PAGE'),
      loader: 'MARK_X_DATA',
      handler: 'MARK_HELPER_SECRET',
    })
  })

  // Bug: the code splitter resolves route options only from an object
  // literal in the route file (`resolveIdentifier`, compilers.ts), so for
  // an imported options object it neither splits nor deletes anything, and
  // says nothing: Start's client build keeps `server.handlers` and ships
  // the helper they read.
  // Impact: server code in the client bundle, silently.
  // Source: FIX-PLAN V2-10 (split-fable O3/gap 5; SPEC J2.8 "options the
  // compiler cannot read statically ... never ships their ssr/server/headers
  // silently").
  test.fails(
    'the client build never ships the server handlers of imported route options silently',
    () => {
      if (failure) {
        // A build that refuses the shape must name the route file and the
        // option, and explain (on any channel of the build; SPEC J2.8,
        // §5.7).
        expectDiagnostic(failure.diagnostics, {
          severity: 'error',
          file: 'src/routes/x.tsx',
          names: [['server', 'handlers']],
          explains: true,
        })
        return
      }
      // (every channel of the build; a warning that informs the user names
      // the route file and the option, and explains)
      const reported = findDiagnostics(build!.diagnostics, {
        severity: 'warning',
        file: 'src/routes/x.tsx',
        names: [['server', 'handlers']],
        explains: true,
      })
      if (reported.length === 0) {
        expect(build!.client.where('MARK_HELPER_SECRET')).toBe('nowhere')
      }
    },
  )
})
