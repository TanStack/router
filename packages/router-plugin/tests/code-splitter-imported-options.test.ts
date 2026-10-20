/**
 * Route options the code splitter cannot read statically: an options
 * object imported from another module, `createFileRoute('/x')(options)`
 * with `import { options } from './x.options'` (FIX-PLAN V2-10; SPEC J2.8,
 * J2.14). The route keeps working through the real router; the compiler
 * either splits the options correctly or tells the developer once, naming
 * the file (the A9 oracle), or refuses the route with an error naming it;
 * with `deleteNodes` (Start's client list) it either removes the server
 * options (and what only they import) or tells the developer: never a
 * silent non-split, never silently kept server options. A local options
 * object is the control.
 *
 * The imported options are real source files of a real Vite dev server
 * app (`routes/-x.options.tsx`, ignored by the route generator, and the
 * `admin-helper.ts` it imports), so a compiler that analyses imported
 * modules can. Whether the client build ships the server code: the real
 * Start build twin, start-plugin-core
 * tests/integration/start-compose-imported-options.test.ts.
 */
import { describe, expect, it } from 'vitest'
import {
  captureConsole,
  diagnosticsOf,
  expectDiagnostic,
} from '@tanstack/compiler-test-utils/diagnostics'
import { renderRoutePath, routerDevServer } from './dev-server'
import { expectValidModules, head, loadRoute } from './regression-helpers'
import type { DeletableNodes } from '../src/core/config'
import type { LoadRouteOptions } from './lazy-tracking'

const localOptions = `${head}import { readSecret } from './admin-helper'
const options = {
  component: () => 'MARK_X_PAGE',
  loader: () => 'MARK_X_DATA',
  server: { handlers: { GET: () => readSecret() } },
}
export const Route = createFileRoute('/x')(options)
`

/** Start's client list of `deleteNodes`. */
const deleteNodes: Array<DeletableNodes> = ['ssr', 'server', 'headers']

/**
 * Loads the local-options route (warnings captured) and returns it with
 * what the console reported.
 */
async function loadLocal(options: LoadRouteOptions = {}) {
  const { result: route, diagnostics } = await captureConsole(() =>
    loadRoute(localOptions, {
      stubs: { './admin-helper': { readSecret: () => 'MARK_HELPER_SECRET' } },
      routeId: '/x',
      ...options,
    }),
  )
  await expectValidModules(route.modules)
  return { route, diagnostics }
}

describe('route options held in a local object (control)', () => {
  it('splits the component and keeps the route working, with nothing reported', async () => {
    const { route, diagnostics } = await loadLocal()
    expect(diagnostics).toEqual([])
    expect(await route.isLazy('component')).toBe(true)
    expect(await route.renderRoute()).toContain('MARK_X_PAGE')
    expect(await route.options.loader()).toBe('MARK_X_DATA')
  })

  it('removes the options of deleteNodes, and what only they import', async () => {
    const { route } = await loadLocal({ deleteNodes })
    expect('server' in route.options).toBe(false)
    // Nothing that loads with the route module requests the helper only
    // the removed `server` option read.
    expect(route.eager).not.toContain('./admin-helper')
    expect(await route.renderRoute()).toContain('MARK_X_PAGE')
  })
})

describe('route options imported from another module', () => {
  const importedOptions = `${head}import { options } from './-x.options'
export const Route = createFileRoute('/x')(options)
`
  const files = {
    'routes/x.tsx': importedOptions,
    'routes/-x.options.tsx': `import { readSecret } from '../admin-helper'
export const options = {
  component: () => 'MARK_X_PAGE',
  loader: () => 'MARK_X_DATA',
  server: { handlers: { GET: () => readSecret() } },
}
`,
    'admin-helper.ts': `export const readSecret = () => 'MARK_HELPER_SECRET'\n`,
  }

  /**
   * Serves the app in a real Vite dev server with the router plugin
   * (`deleteNodes` given to the code splitter) and imports the route
   * module. Returns the route (or the error the import failed with), the
   * route file, and what the console and Vite's logger reported.
   */
  async function serve(nodes?: Array<DeletableNodes>) {
    const { result, diagnostics } = await captureConsole(async () => {
      const server = await routerDevServer({
        files,
        pluginOptions: nodes && {
          codeSplittingOptions: { deleteNodes: nodes },
        },
      })
      try {
        const { Route } = await server.import('/routes/x.tsx')
        return { server, Route, error: undefined }
      } catch (error) {
        return { server, Route: undefined, error }
      }
    })
    return {
      ...result,
      file: result.server.file('routes/x.tsx'),
      diagnostics: [...diagnostics, ...diagnosticsOf(result.server.logs)],
    }
  }

  /**
   * A refusal is an error naming the route file; otherwise the route works
   * through the real router. Returns whether it works.
   */
  async function expectWorkingOrRefused(
    served: Awaited<ReturnType<typeof serve>>,
  ) {
    const { server, Route, error, file } = served
    if (error !== undefined) {
      expectDiagnostic(error, { severity: 'error', file })
      return false
    }
    expect(await renderRoutePath(server, '/x')).toContain('MARK_X_PAGE')
    expect(await Route.options.loader()).toBe('MARK_X_DATA')
    return true
  }

  it('keep the route working through the real router, or are refused naming the route file', async () => {
    await expectWorkingOrRefused(await serve())
  })

  // Bug: the code splitter resolves the route options only from an object
  // literal of the route file (`resolveIdentifier`, compilers.ts): for an
  // imported binding it finds nothing, leaves the route untouched and says
  // nothing.
  // Impact: the route's component is never split, with no word to the
  // developer (SPEC J2.8: split correctly or report once naming the file).
  // Source: FIX-PLAN V2-10 (split-fable O3/gap 5).
  it.fails('are split, or reported once naming the route file', async () => {
    const served = await serve()
    if (!(await expectWorkingOrRefused(served))) {
      return
    }
    // Split: the route's component is the router's lazy component (its
    // public `preload()`).
    if (!('preload' in served.Route.options.component)) {
      expectDiagnostic(served.diagnostics, {
        severity: 'warning',
        file: served.file,
        times: 1,
      })
    }
  })

  // Bug: same cause; with Start's client `deleteNodes` the `server` option
  // (and `ssr`, `headers`) stays in the route module with the helper it
  // imports, silently.
  // Impact: server handlers and what they read ship to the client (SPEC
  // J2.8 "never ships their ssr/server/headers silently", J2.14, J4.12).
  // Source: FIX-PLAN V2-10.
  it.fails(
    'lose the options of deleteNodes and what only they import, or are reported once naming the route file',
    async () => {
      const served = await serve(deleteNodes)
      if (!(await expectWorkingOrRefused(served))) {
        return
      }
      // What the client environment serves with the route module, followed
      // through every static import, as a browser loads it.
      const clientModules = Object.keys(
        await served.server.load('/routes/x.tsx', { environment: 'client' }),
      )
      const kept =
        'server' in served.Route.options ||
        clientModules.some((url) => url.includes('admin-helper'))
      if (kept) {
        expectDiagnostic(served.diagnostics, {
          severity: 'warning',
          file: served.file,
          times: 1,
        })
      }
    },
  )
})
