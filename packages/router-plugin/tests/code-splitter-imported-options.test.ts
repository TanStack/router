/**
 * Route options the code splitter cannot read statically: an options
 * object imported from another module, `createFileRoute('/x')(options)`
 * with `import { options } from './x.options'` (FIX-PLAN V2-10; SPEC J2.8,
 * J2.14). The route keeps working through the real router; the compiler
 * either splits the options correctly or tells the developer once, naming
 * the file (the A9 oracle), and with `deleteNodes` (Start's client list)
 * either removes the server options or tells the developer: never a silent
 * non-split, never silently kept server options. A local options object is
 * the control.
 */
import { describe, expect, it } from 'vitest'
import {
  captureConsole,
  expectDiagnostic,
} from '@tanstack/compiler-test-utils/diagnostics'
import { expectValidModules, head, loadRoute } from './regression-helpers'
import type { LoadRouteOptions } from './lazy-tracking'

const importedOptions = `${head}import { options } from './x.options'
export const Route = createFileRoute('/x')(options)
`

const localOptions = `${head}import { readSecret } from './admin-helper'
const options = {
  component: () => 'MARK_X_PAGE',
  loader: () => 'MARK_X_DATA',
  server: { handlers: { GET: () => readSecret() } },
}
export const Route = createFileRoute('/x')(options)
`

/**
 * The modules the route files import, fresh for each load: the real router
 * keeps and updates the options object a route is created with.
 */
const stubs = () => ({
  './admin-helper': { readSecret: () => 'MARK_HELPER_SECRET' },
  './x.options': {
    options: {
      component: () => 'MARK_X_PAGE',
      loader: () => 'MARK_X_DATA',
      server: { handlers: { GET: () => 'MARK_HELPER_SECRET' } },
    },
  },
})

/**
 * Loads the route (warnings captured) and returns it with the warnings
 * naming the route file.
 */
async function loadReported(code: string, options: LoadRouteOptions = {}) {
  const { result: route, diagnostics } = await captureConsole(() =>
    loadRoute(code, { stubs: stubs(), routeId: '/x', ...options }),
  )
  await expectValidModules(route.modules)
  return { route, diagnostics }
}

describe('route options held in a local object (control)', () => {
  it('splits the component and keeps the route working, with nothing reported', async () => {
    const { route, diagnostics } = await loadReported(localOptions)
    expect(diagnostics).toEqual([])
    expect(await route.isLazy('component')).toBe(true)
    expect(await route.renderRoute()).toContain('MARK_X_PAGE')
    expect(await route.options.loader()).toBe('MARK_X_DATA')
  })

  it('removes the options of deleteNodes', async () => {
    const { route } = await loadReported(localOptions, {
      deleteNodes: ['ssr', 'server', 'headers'],
    })
    expect('server' in route.options).toBe(false)
    expect(await route.renderRoute()).toContain('MARK_X_PAGE')
  })
})

describe('route options imported from another module', () => {
  it('keep the route working through the real router', async () => {
    const { route } = await loadReported(importedOptions)
    expect(await route.renderRoute()).toContain('MARK_X_PAGE')
    expect(await route.options.loader()).toBe('MARK_X_DATA')
  })

  // Bug: the code splitter resolves the route options only from an object
  // literal of the route file (`resolveIdentifier`, compilers.ts): for an
  // imported binding it finds nothing, leaves the route untouched and says
  // nothing.
  // Impact: the route's component is never split, with no word to the
  // developer (SPEC J2.8: split correctly or report once naming the file).
  // Source: FIX-PLAN V2-10 (split-fable O3/gap 5).
  it.fails('are split, or reported once naming the route file', async () => {
    const { route, diagnostics } = await loadReported(importedOptions)
    if (!(await route.isLazy('component'))) {
      expectDiagnostic(diagnostics, {
        severity: 'warning',
        file: route.ids.reference!,
        times: 1,
      })
    }
  })

  // Bug: same cause; with Start's client `deleteNodes` the `server` option
  // (and `ssr`, `headers`) stays in the client route module, silently.
  // Impact: server handlers and what they read ship to the client (SPEC
  // J2.8 "never ships their ssr/server/headers silently", J2.14, J4.12).
  // Source: FIX-PLAN V2-10.
  it.fails(
    'lose the options of deleteNodes, or are reported once naming the route file',
    async () => {
      const { route, diagnostics } = await loadReported(importedOptions, {
        deleteNodes: ['ssr', 'server', 'headers'],
      })
      if ('server' in route.options) {
        expectDiagnostic(diagnostics, {
          severity: 'warning',
          file: route.ids.reference!,
          times: 1,
        })
      }
    },
  )
})
