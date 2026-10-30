/**
 * A route file whose `createFileRoute` comes from a module of the app that
 * re-exports the router's (`export { createFileRoute } from
 * '@tanstack/react-router'`), a shape real apps use for a wrapper module.
 * SPEC J2.8: the route is split correctly or the run reports it once naming
 * the file; with Start's client `deleteNodes` its server options are
 * removed, reported or refused, never shipped silently.
 *
 * The route runs in a real browser page of a real Vite dev server
 * (`./route-app`): what the client gets is what the page requests and
 * evaluates.
 */
import { expect, it } from 'vitest'
import {
  diagnosticsOf,
  expectDiagnostic,
} from '@tanstack/compiler-test-utils/diagnostics'
import { expectValidModules, loadRoute } from './route-app'
import type { DeletableNodes } from '../src'

const files = {
  'lib/router.ts': `export { createFileRoute } from '@tanstack/react-router'\n`,
  'admin-helper.ts': `export const readSecret = () => 'MARK_HELPER_SECRET'\n`,
}

const routeFile = `import { createFileRoute } from './lib/router'
import { readSecret } from './admin-helper'
export const Route = createFileRoute('/x')({
  component: () => 'MARK_X_PAGE',
  server: { handlers: { GET: () => readSecret() } },
})
`

/**
 * Serves the route in a fresh dev server and loads it in the page. Returns
 * what the page saw (or the error compiling or loading it threw), the route
 * file and what the dev server reported on every channel.
 */
async function serve(deleteNodes?: Array<DeletableNodes>) {
  const route = await loadRoute(routeFile, {
    routeId: '/x',
    deleteNodes,
    files,
    // A dev server of its own: an unsplit route is reported once per dev
    // server, so a shared host that compiled this route earlier says nothing
    fresh: true,
  })
  const file = route.host.file('route.tsx')
  let error: unknown
  let seen:
    | { html: string; server: boolean; requested: Array<string> }
    | undefined
  try {
    await expectValidModules(route)
    seen = await route.run(`return {
  html: await renderRoute(),
  server: 'server' in options,
  requested: await requested(),
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

// Bug: the factory is recognised by its import binding only and the warning
// needs an import of a factory from the router package, so the route is
// neither split nor reported. (Main's splitter matched the name, but main's
// generator adds a second `createFileRoute` import to such a file, which
// then no longer parses.)
it.fails(
  'a route whose createFileRoute an app module re-exports is split, or reported once naming the file',
  async () => {
    const { route, file, error, seen, diagnostics } = await serve()
    expect(error).toBeUndefined()
    expect(seen!.html).toContain('MARK_X_PAGE')
    if (!(await route.isLazy('component'))) {
      expectDiagnostic(diagnostics, {
        severity: 'warning',
        file,
        root: route.host.root,
        times: 1,
      })
    }
  },
)

// Bug: same cause; the unrecognised route keeps its server handler and the
// helper it imports in the client module, silently. (Main refused it, by
// the parse error its generator causes.)
it.fails(
  "with Start's client deleteNodes, a route whose createFileRoute an app module re-exports loses its server options, or is reported naming the file",
  async () => {
    const { route, file, error, seen, diagnostics } = await serve([
      'ssr',
      'server',
      'headers',
    ])
    if (error !== undefined || !seen) {
      expectDiagnostic(diagnostics, {
        severity: 'error',
        file,
        root: route.host.root,
      })
      return
    }
    expect(seen.html).toContain('MARK_X_PAGE')
    if (seen.server || seen.requested.includes('/admin-helper.ts')) {
      expectDiagnostic(diagnostics, {
        file,
        root: route.host.root,
      })
    }
  },
)
