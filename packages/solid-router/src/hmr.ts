import { applyRouteChunkHmr, applyRouteHmr } from '@tanstack/router-core/hmr'
import type {
  AnyRoute,
  RouteHmrAdapter,
  RouteHmrMeta,
} from '@tanstack/router-core'

const refreshName = (component: any): string | undefined => {
  const name = typeof component === 'function' ? component.name : undefined
  return name?.startsWith('[solid-refresh]') ? name : undefined
}

const adapter: RouteHmrAdapter = {
  // After a rename solid-refresh stops patching the chunk's first proxy (an
  // upstream bug), so a split component is kept only when the loaded export
  // is the same object.
  keep: (next, held) => next === held,
  // solid-refresh patches the route module's first proxy of a binding in
  // place; keeping it avoids remounting the route's subtree.
  keepUnsplit: (next, held, sameName) =>
    sameName &&
    refreshName(held) !== undefined &&
    refreshName(held) === refreshName(next),
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
