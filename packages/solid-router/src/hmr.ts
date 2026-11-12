import {
  applyKeptReaderHmr,
  applyRouteChunkHmr,
  applyRouteHmr,
} from '@tanstack/router-core/hmr'
// TEMPORARY WORKAROUND of web-infra-dev/rspack#16594: see the module
import { forgetChunkExports, recordChunkExports } from './hmr-chunk-importer'
import type { AnyRoute } from '@tanstack/router-core'
import type {
  KeptReaderHot,
  RouteHmrAdapter,
  RouteHmrMeta,
} from '@tanstack/router-core/hmr'

/**
 * The module file and name solid-refresh patches a component under (its
 * proxy's `name`, `[solid-refresh]<Name>`, and the file of its `location`,
 * `<file>:<line>:<column>`); `undefined` for any other value.
 */
const refreshSource = (component: any): string | undefined => {
  if (
    typeof component !== 'function' ||
    !component.name.startsWith('[solid-refresh]')
  ) {
    return undefined
  }
  const location = component.location
  return typeof location === 'string'
    ? `${component.name}@${location.replace(/:\d+:\d+$/, '')}`
    : undefined
}

// solid-refresh patches a module's first proxy of each name in place, per
// module file: keeping it avoids remounting the route's subtree. A chunk
// re-imported after a route update is kept only when it is the same object
// (core's default): after a rename solid-refresh stops patching the chunk's
// first proxy (an upstream bug).
const adapter: RouteHmrAdapter = {
  keepPatched: (next, held) =>
    refreshSource(held) !== undefined &&
    refreshSource(held) === refreshSource(next),
  retire: forgetChunkExports,
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
 * hosts (`applyRouteChunkHmr`), with the chunk's exports and whether it
 * holds a non-component option: solid-refresh makes a chunk holding
 * components accept its own updates, so the chunk hands its components to
 * the route's lazy wrappers itself.
 *
 * Called only by compiler output; not a public API.
 */
export function __tsrRouteChunkHmr(
  routeId: string,
  chunk: string,
  exports: Record<string, any>,
  refresh: boolean,
): void {
  if (process.env.NODE_ENV !== 'production') {
    recordChunkExports(routeId, chunk, exports)
    applyRouteChunkHmr(routeId, chunk, { exports, refresh, adapter })
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

export { __tsrChunkImporter } from './hmr-chunk-importer'
