/**
 * A route whose `createFileRoute` comes from a module of the app that
 * re-exports the router's, under Start (SPEC J2.8, J2.14, J4.12): its
 * server handlers read a helper with a neutral file name, so only the
 * route option's removal keeps it out of the client. Only the router's own
 * factory is recognised (by its import binding), so the options cannot be
 * removed: the build fails naming the route file and the fix. Built with
 * Start's Vite and Rsbuild plugins.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { expectDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
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
  'src/lib/router.ts': `export { createFileRoute } from '@tanstack/react-router'\n`,
  'src/admin-helper.ts': `export const readSecret = () => 'MARK_HELPER_SECRET'\n`,
  'src/routes/x.tsx': `import { createFileRoute } from '../lib/router'
import { readSecret } from '../admin-helper'
export const Route = createFileRoute('/x')({
  component: () => <p>MARK_X_PAGE</p>,
  server: { handlers: { GET: () => new Response(readSecret()) } },
})
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

  test('the build fails naming the route file and the fix', () => {
    expect(build).toBeUndefined()
    const report = expectDiagnostic(failure!.diagnostics, {
      severity: 'error',
      file: 'src/routes/x.tsx',
    })
    expect(report.text).toContain(
      `import { createFileRoute } from '@tanstack/react-router'`,
    )
  })
})
