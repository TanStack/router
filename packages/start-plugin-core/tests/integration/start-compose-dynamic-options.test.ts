/**
 * Route options the compiler cannot read statically under Start (SPEC
 * J2.8, J2.14, J4.12): options returned by a factory call, and a spread of
 * imported options, holding server handlers that read a helper with a
 * neutral file name. The client build never ships the handlers silently:
 * the helper is absent from the client bundle, or the build reports or
 * fails naming the route file. Built with Start's Vite and Rsbuild plugins.
 * (Main shipped the handlers and the helper eagerly, saying nothing; the
 * compiler now refuses the build, naming the file.)
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

const shapes = [
  {
    name: 'options returned by a factory call',
    route: `import { createFileRoute } from '@tanstack/react-router'
import { readSecret } from '../admin-helper'
const makeOptions = () => ({
  component: () => <p>MARK_X_PAGE</p>,
  server: { handlers: { GET: () => new Response(readSecret()) } },
})
export const Route = createFileRoute('/x')(makeOptions())
`,
  },
  {
    name: 'a spread of imported options',
    route: `import { createFileRoute } from '@tanstack/react-router'
import { shared } from '../x.shared'
export const Route = createFileRoute('/x')({
  ...shared,
  component: () => <p>MARK_X_PAGE</p>,
})
`,
  },
]

describe.each(
  startBundlers.flatMap((bundler) =>
    shapes.map((shape) => ({ bundler, ...shape })),
  ),
)('$name ($bundler build)', ({ bundler, route }) => {
  let build: StartBuild | undefined
  let failure: StartBuildError | undefined
  let dispose: (() => Promise<void>) | undefined

  beforeAll(async () => {
    try {
      build = await buildStart({
        bundler,
        files: {
          'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()
`,
          'src/admin-helper.ts': `export const readSecret = () => 'MARK_HELPER_SECRET'\n`,
          'src/x.shared.ts': `import { readSecret } from './admin-helper'
export const shared = {
  server: { handlers: { GET: () => new Response(readSecret()) } },
}
`,
          'src/routes/x.tsx': route,
          'src/router.ts': `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export const getRouter = () => createRouter({ routeTree })
`,
          'src/client-entry.ts': `export { getRouter } from './router'\n`,
          'src/ssr-entry.ts': `export { getRouter } from './router'
export { renderPath } from '../harness/render'
${callByIdExports}`,
        },
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

  test('the client build never ships the server handlers silently', () => {
    if (failure) {
      expectDiagnostic(failure.diagnostics, {
        severity: 'error',
        file: 'src/routes/x.tsx',
      })
      return
    }
    const reported = findDiagnostics(build!.diagnostics, {
      file: 'src/routes/x.tsx',
    })
    if (reported.length === 0) {
      expect(build!.client.where('MARK_HELPER_SECRET')).toBe('nowhere')
    }
  })
})
