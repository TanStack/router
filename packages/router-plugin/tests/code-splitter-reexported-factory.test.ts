/**
 * A route file whose `createFileRoute` comes from a module of the app that
 * re-exports the router's (`export { createFileRoute } from
 * '@tanstack/react-router'`), a shape real apps use for a wrapper module.
 * Only the router's own `createFileRoute` is recognised (by its import
 * binding), so such a route is not split, and the run says so once naming
 * the file and the fix (SPEC J2.8); with Start's client `deleteNodes` its
 * server options would ship, so the compile fails naming the file.
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

/** The fix the report gives: import the factory from the router. */
const fix = `import { createFileRoute } from '@tanstack/react-router'`

it('a route whose createFileRoute an app module re-exports renders, and is reported once naming the file and the fix', async () => {
  const { route, file, error, seen, diagnostics } = await serve()
  expect(error).toBeUndefined()
  expect(seen!.html).toContain('MARK_X_PAGE')
  const report = expectDiagnostic(diagnostics, {
    severity: 'warning',
    file,
    root: route.host.root,
    times: 1,
  })
  expect(report.text).toContain(fix)
})

it("with Start's client deleteNodes, a route whose createFileRoute an app module re-exports fails to compile, naming the file and the fix", async () => {
  const { route, file, error, diagnostics } = await serve([
    'ssr',
    'server',
    'headers',
  ])
  expect(error).toBeDefined()
  const report = expectDiagnostic(diagnostics, {
    severity: 'error',
    file,
    root: route.host.root,
  })
  expect(report.text).toContain(fix)
})
