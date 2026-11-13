import {
  applyKeptReaderHmr,
  applyRouteChunkHmr,
  applyRouteHmr,
} from '@tanstack/router-core/hmr'
import { isServer } from '@tanstack/router-core/isServer'
import type { AnyRoute } from '@tanstack/router-core'
import type {
  KeptReaderHot,
  RouteHmrAdapter,
  RouteHmrMeta,
} from '@tanstack/router-core/hmr'

// Provided by the webpack/Rspack React Refresh plugins (ProvidePlugin).
declare const __react_refresh_utils__:
  | { enqueueUpdate: (callback?: () => void) => void }
  | undefined

// Globals of the Vite (plugin-react) and webpack/Rspack refresh runtimes.
// All four are private to those plugins (undocumented, no public API to
// hook a refresh pass): `__getReactRefreshIgnoredExports` and
// `__registerBeforePerformReactRefresh` of @vitejs/plugin-react,
// `__reactRefreshInjected` and `__react_refresh_utils__` of
// @rspack/plugin-react-refresh. No upstream issue. If a plugin renames them,
// `refreshActive` is false and an update applies at once, before the
// refresh pass (a component update may then remount what it patches).
type RefreshWindow = Window & {
  __getReactRefreshIgnoredExports?: (ctx: { id: string }) => Array<string>
  __registerBeforePerformReactRefresh?: (hook: () => unknown) => void
  __reactRefreshInjected?: boolean
}

// Per module id: the route it defines and the exports plugin-react ignores.
let ignoredExportsById:
  | Map<string, { routeId: string; ignored: Array<string> }>
  | undefined

function refreshActive() {
  const w = window as RefreshWindow
  return (
    typeof w.__registerBeforePerformReactRefresh === 'function' ||
    typeof __react_refresh_utils__ !== 'undefined' ||
    w.__reactRefreshInjected === true
  )
}

// How long an update waits for a refresh pass that doesn't come (a route
// file the refresh plugin doesn't compile, a chunk first loaded after the
// pass): then it applies, and the edit shows that much later.
const REFRESH_BOUND = 200

// The updates waiting for the next refresh pass, in evaluation order.
let waiting: Array<() => void> = []
let hooked = false

function flush() {
  const entries = waiting
  waiting = []
  for (const entry of entries) {
    entry()
  }
}

/**
 * Runs `apply` once React Refresh processed the modules evaluated so far
 * (its next refresh pass), or after `REFRESH_BOUND`, whichever comes first;
 * at once without a refresh runtime. After the pass React answers whether
 * the held component and the new one are one family (the mounted component
 * and its state stay) or not (a remount with the new code), so the router
 * always takes the new value.
 */
function whenRefreshed(apply: () => void): void {
  if (!refreshActive()) {
    apply()
    return
  }
  let done = false
  const entry = () => {
    if (!done) {
      done = true
      apply()
    }
  }
  waiting.push(entry)
  const w = window as RefreshWindow
  if (typeof __react_refresh_utils__ !== 'undefined') {
    // webpack/Rspack: a route module is never a refresh boundary, so this
    // also makes the pass happen; the callback runs after it (the runtime
    // drops it while a pass is pending: the bound applies then)
    __react_refresh_utils__.enqueueUpdate(flush)
  } else if (
    !hooked &&
    typeof w.__registerBeforePerformReactRefresh === 'function'
  ) {
    // Vite: the runtime awaits these hooks, then runs the pass in the same
    // microtask chain, so a task queued here runs after it
    hooked = true
    w.__registerBeforePerformReactRefresh(() => {
      setTimeout(flush, 0)
    })
  }
  // the bound is the entry's own: it can only apply the update it was armed
  // for, never a later one before its pass
  setTimeout(entry, REFRESH_BOUND)
}

const adapter: RouteHmrAdapter = {
  settled: whenRefreshed,
  retire: (routeId) => {
    ignoredExportsById?.forEach((entry, id, byId) => {
      if (entry.routeId === routeId) {
        byId.delete(id)
      }
    })
  },
}

/**
 * Dev-only route HMR entry point called by the router plugin's output at the
 * top level of every evaluation of a route module.
 *
 * Called only by compiler output; not a public API.
 */
export function __tsrRouteHmr(
  routeId: string,
  Route: AnyRoute,
  meta: RouteHmrMeta,
): void {
  if (process.env.NODE_ENV !== 'production') {
    if (isServer ?? typeof window === 'undefined') {
      return
    }
    const refreshExports = meta.refreshExports
    if (refreshExports) {
      // plugin-react asks for the ignored exports of a module by its id: the
      // route and the compiler's glue. It validates the anchor (a component,
      // which keeps the module a boundary) and the user's other exports.
      let byId = ignoredExportsById
      if (!byId) {
        const w = window as RefreshWindow
        const ids = (byId = ignoredExportsById = new Map())
        const previous = w.__getReactRefreshIgnoredExports
        w.__getReactRefreshIgnoredExports = (ctx) => {
          const ignored = previous?.(ctx) ?? []
          const own = ids.get(ctx.id)
          return own ? [...ignored, ...own.ignored] : ignored
        }
      }
      byId.set(refreshExports.id, {
        routeId,
        ignored: refreshExports.exports.filter(
          (name) => name !== refreshExports.anchor,
        ),
      })
    }
    applyRouteHmr(routeId, Route, meta, adapter)
  }
}

/**
 * Dev-only entry point called by the router plugin's output at the top level
 * of every evaluation of a split chunk of a route module on webpack-style
 * hosts (`applyRouteChunkHmr`).
 *
 * Called only by compiler output; not a public API.
 */
export function __tsrRouteChunkHmr(routeId: string, chunk: string): void {
  if (process.env.NODE_ENV !== 'production') {
    applyRouteChunkHmr(routeId, chunk)
  }
}

/**
 * Dev-only entry point called by the router plugin's output at the top level
 * of every evaluation of a module of a route file that reads a binding the
 * route module keeps, on webpack-style hosts (`applyKeptReaderHmr`).
 *
 * Called only by compiler output; not a public API.
 */
export function __tsrKeptReaderHmr(routeId: string, hot: KeptReaderHot): void {
  if (process.env.NODE_ENV !== 'production') {
    applyKeptReaderHmr(routeId, hot)
  }
}
