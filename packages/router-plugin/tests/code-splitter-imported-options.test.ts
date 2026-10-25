/**
 * Route options the code splitter cannot read statically: an options
 * object imported from another module, `createFileRoute('/x')(options)`
 * with `import { options } from './x.options'` (SPEC J2.8,
 * J2.14). The route keeps working through the real router; the compiler
 * either splits the options correctly or tells the developer once, naming
 * the file, or refuses the route with an error naming it;
 * with `deleteNodes` (Start's client list) it either removes the server
 * options (and what only they import) or tells the developer: never a
 * silent non-split, never silently kept server options. A local options
 * object is the control.
 *
 * The imported options are real source files of a real Vite dev server
 * app (`routes/-x.options.tsx`, which no route registers, and the
 * `admin-helper.ts` it imports), so a compiler that analyses imported
 * modules can. The route runs in a real browser page (`./route-app`): what
 * the client gets is what the page requests and evaluates. Whether the
 * client build ships the server code: the real Start build twin,
 * start-plugin-core tests/integration/start-compose-imported-options.test.ts.
 */
import { describe, expect, it } from 'vitest'
import {
  diagnosticsOf,
  expectDiagnostic,
} from '@tanstack/compiler-test-utils/diagnostics'
import { expectNoProblems } from '@tanstack/compiler-test-utils/diagnostic-channel'
import { expectValidModules, head, loadRoute } from './route-app'
import type { DeletableNodes } from '../src'
import type { RouteAppOptions } from './route-app'

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

/** Loads the local-options route, its modules checked. */
async function loadLocal(options: RouteAppOptions = {}) {
  const route = await loadRoute(localOptions, {
    files: {
      'admin-helper.ts': `export const readSecret = () => 'MARK_HELPER_SECRET'\n`,
    },
    routeId: '/x',
    ...options,
  })
  await expectValidModules(route)
  return route
}

describe('route options held in a local object (control)', () => {
  it('splits the component and keeps the route working, with nothing reported', async () => {
    const route = await loadLocal()
    expect(await route.isLazy('component')).toBe(true)
    const [html, loaded] = await route.run<[string, unknown]>(
      `return [await renderRoute(), await options.loader()]`,
    )
    expect(html).toContain('MARK_X_PAGE')
    expect(loaded).toBe('MARK_X_DATA')
    // No warning or error on any channel of the dev server (info is free).
    expectNoProblems(await route.diagnostics())
  })

  it('removes the options of deleteNodes, and what only they import', async () => {
    const route = await loadLocal({ deleteNodes })
    // Nothing that loads with the route module requests the helper only
    // the removed `server` option read.
    expect(await route.requested()).not.toContain('/admin-helper.ts')
    const [server, html] = await route.run<[boolean, string]>(
      `return ['server' in options, await renderRoute()]`,
    )
    expect(server).toBe(false)
    expect(html).toContain('MARK_X_PAGE')
  })
})

describe('a route factory called without options', () => {
  // Source: every Start app's `createRootRoute()` (Start's client build
  // configures deleteNodes): there is nothing to remove or split.
  it('compiles with deleteNodes, nothing reported', async () => {
    const route = await loadRoute(
      `${head}export const Route = createFileRoute('/x')()\n`,
      { routeId: '/x', deleteNodes },
    )
    await expectValidModules(route)
    expectNoProblems(await route.diagnostics())
  })
})

describe('route options with a spread or a computed key that holds none of deleteNodes', () => {
  // Source: start-plugin-core's server-only-routes builds (a page whose
  // component the options spread in, `[key]: Page`).
  it.each([
    {
      name: 'a spread of a local object',
      declaration: `const page = { component: () => 'MARK_X_PAGE' }`,
      option: '...page',
    },
    {
      name: 'a computed key naming a const',
      declaration: `const key = 'component'`,
      option: `[key]: () => 'MARK_X_PAGE'`,
    },
  ])(
    'removes the options of deleteNodes next to $name, nothing reported',
    async ({ declaration, option }) => {
      const route = await loadRoute(
        `${head}import { readSecret } from './admin-helper'
${declaration}
export const Route = createFileRoute('/x')({
  server: { handlers: { GET: () => readSecret() } },
  ${option},
})
`,
        {
          files: {
            'admin-helper.ts': `export const readSecret = () => 'MARK_HELPER_SECRET'\n`,
          },
          routeId: '/x',
          deleteNodes,
        },
      )
      await expectValidModules(route)
      expect(await route.requested()).not.toContain('/admin-helper.ts')
      const [server, html] = await route.run<[boolean, string]>(
        `return ['server' in options, await renderRoute()]`,
      )
      expect(server).toBe(false)
      expect(html).toContain('MARK_X_PAGE')
      expectNoProblems(await route.diagnostics())
    },
  )
})

describe('route options imported from another module', () => {
  const importedOptions = `${head}import { options } from './-x.options'
export const Route = createFileRoute('/x')(options)
`
  const files = {
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
   * Serves the app in a real Vite dev server with the router plugin (with
   * route HMR, as a dev server has it; `deleteNodes` given to the code
   * splitter) and loads the route in the page. Returns what the page saw of
   * the route (or the error compiling or loading it threw), the route file,
   * and what the dev server reported on every channel.
   */
  async function serve(nodes?: Array<DeletableNodes>) {
    const route = await loadRoute(importedOptions, {
      filename: 'routes/x.tsx',
      routeId: '/x',
      hmr: true,
      deleteNodes: nodes,
      files,
    })
    const file = route.host.file('routes/x.tsx')
    let error: unknown
    let seen:
      | { html: string; loaded: unknown; split: boolean; server: boolean }
      | undefined
    try {
      await route.transform()
      seen = await route.run(`return {
  html: await renderRoute(),
  loaded: await options.loader(),
  split: 'preload' in options.component,
  server: 'server' in options,
}`)
    } catch (caught) {
      error = caught
    }
    return {
      route,
      file,
      error,
      seen,
      diagnostics: [...diagnosticsOf(error), ...(await route.diagnostics())],
    }
  }

  /**
   * A refusal is an error naming the route file (on any channel); otherwise
   * the route works through the real router in the page. Returns whether it
   * works.
   */
  function expectWorkingOrRefused(served: Awaited<ReturnType<typeof serve>>) {
    const { route, seen, error, file, diagnostics } = served
    if (error !== undefined || !seen) {
      expectDiagnostic(diagnostics, {
        severity: 'error',
        file,
        root: route.host.root,
      })
      return false
    }
    expect(seen.html).toContain('MARK_X_PAGE')
    expect(seen.loaded).toBe('MARK_X_DATA')
    return true
  }

  it('keep the route working through the real router, or are refused naming the route file', async () => {
    expectWorkingOrRefused(await serve())
  })

  // Bug: the code splitter resolves the route options only from an object
  // literal of the route file (`resolveIdentifier`, compilers.ts): for an
  // imported binding it finds nothing, leaves the route untouched and says
  // nothing.
  // Impact: the route's component is never split, with no word to the
  // developer (SPEC J2.8: split correctly or report once naming the file).
  it('are split, or reported once naming the route file', async () => {
    const served = await serve()
    if (!expectWorkingOrRefused(served)) {
      return
    }
    // Split: the route's component is the router's lazy component (its
    // public `preload()`).
    if (!served.seen!.split) {
      expectDiagnostic(served.diagnostics, {
        severity: 'warning',
        file: served.file,
        root: served.route.host.root,
        times: 1,
      })
    }
  })

  // Bug: same cause; with Start's client `deleteNodes` the `server` option
  // (and `ssr`, `headers`) stays in the route module with the helper it
  // imports, silently.
  // Impact: server handlers and what they read ship to the client (SPEC
  // J2.8 "never ships their ssr/server/headers silently", J2.14, J4.12).
  it('lose the options of deleteNodes and what only they import, or are reported once naming the route file', async () => {
    const served = await serve(deleteNodes)
    if (!expectWorkingOrRefused(served)) {
      return
    }
    // What the page requests with the route module.
    const kept =
      served.seen!.server ||
      (await served.route.requested()).includes('/admin-helper.ts')
    if (kept) {
      expectDiagnostic(served.diagnostics, {
        severity: 'warning',
        file: served.file,
        root: served.route.host.root,
        times: 1,
      })
    }
  })
})
