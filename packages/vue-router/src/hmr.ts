import { applyRouteHmr } from '@tanstack/router-core'
import type {
  AnyRoute,
  RouteHmrAdapter,
  RouteHmrMeta,
} from '@tanstack/router-core'

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
