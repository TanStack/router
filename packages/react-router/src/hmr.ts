import { applyRouteChunkHmr, applyRouteHmr } from '@tanstack/router-core/hmr'
import { isServer } from '@tanstack/router-core/isServer'
import type { AnyRoute } from '@tanstack/router-core'
import type { RouteHmrAdapter, RouteHmrMeta } from '@tanstack/router-core/hmr'

// Provided by the webpack/Rspack React Refresh plugins (ProvidePlugin).
declare const __react_refresh_utils__:
  | { enqueueUpdate: (callback?: () => void) => void }
  | undefined

// Globals of the Vite (plugin-react) and webpack/Rspack refresh runtimes.
type RefreshWindow = Window & {
  __getReactRefreshIgnoredExports?: (ctx: { id: string }) => Array<string>
  __registerBeforePerformReactRefresh?: unknown
  __reactRefreshInjected?: boolean
}

let ignoredExportsById: Map<string, Array<string>> | undefined

function refreshActive() {
  const w = window as RefreshWindow
  return (
    typeof w.__registerBeforePerformReactRefresh === 'function' ||
    typeof __react_refresh_utils__ !== 'undefined' ||
    w.__reactRefreshInjected === true
  )
}

// A kept component is patched by React Refresh. On webpack/Rspack the route
// module is never a refresh boundary, so ask the runtime to run.
function kept() {
  if (typeof __react_refresh_utils__ !== 'undefined') {
    __react_refresh_utils__.enqueueUpdate(() => {})
  }
  return true
}

const adapter: RouteHmrAdapter = {
  keep: (next, held) =>
    refreshActive() &&
    next?.$$tsrRefreshId !== undefined &&
    next.$$tsrRefreshId === held?.$$tsrRefreshId &&
    kept(),
  keepUnsplit: (_next, _held, sameName) =>
    sameName && refreshActive() && kept(),
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
      // plugin-react asks for the ignored exports of a module by its id. Every
      // export but the anchor is ignored, which keeps the module a boundary.
      let byId = ignoredExportsById
      if (!byId) {
        const w = window as RefreshWindow
        const ids = (byId = ignoredExportsById = new Map())
        const previous = w.__getReactRefreshIgnoredExports
        w.__getReactRefreshIgnoredExports = (ctx) => {
          const ignored = previous?.(ctx) ?? []
          const own = ids.get(ctx.id)
          return own ? [...ignored, ...own] : ignored
        }
      }
      byId.set(
        refreshExports.id,
        refreshExports.exports.filter((name) => name !== refreshExports.anchor),
      )
    }
    applyRouteHmr(routeId, Route, meta, adapter)
  }
}

/**
 * Dev-only entry point called by the router plugin's output at the top level
 * of every evaluation of a split chunk of a route module on webpack-style
 * hosts (the chunk accepts its own hot updates).
 *
 * Called only by compiler output; not a public API.
 */
export function __tsrRouteChunkHmr(routeId: string, chunk: string): void {
  if (process.env.NODE_ENV !== 'production') {
    applyRouteChunkHmr(routeId, chunk)
  }
}
