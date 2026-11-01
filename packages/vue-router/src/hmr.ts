import { applyRouteChunkHmr, applyRouteHmr } from '@tanstack/router-core/hmr'
import type { AnyRoute } from '@tanstack/router-core'
import type { RouteHmrAdapter, RouteHmrMeta } from '@tanstack/router-core/hmr'

// plugin-vue-jsx reloads an exported `defineComponent` in place under the same
// `__hmrId`. Anything else (function components, renames) must be swapped.
const keep = (next: any, held: any) =>
  next?.__hmrId !== undefined && next.__hmrId === held?.__hmrId

const adapter: RouteHmrAdapter = { keep, keepUnsplit: keep }

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
