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

/**
 * solid-refresh patches a module's first proxy of each name in place, per
 * module file: keeping it avoids remounting the route's subtree, also for a
 * chunk the route module imports again after an update (Vite), which
 * solid-refresh patched in the same update.
 *
 * Known gap: after a rename or a removed component, solid-refresh stops
 * patching the module (it keeps the removed name,
 * https://github.com/solidjs/solid-refresh/issues/88; oracle KNOWN-BUGS,
 * "Upstream issues"), so a kept proxy may show no later edit, not even the
 * removal, until a reload. A component that moves to another split chunk
 * (a `codeSplitGroupings` edit) is such a removal, and the new chunk's proxy
 * has the same name and file: the page reloads instead
 * (`RouteHmrMeta.chunks`).
 * Relies on solid-refresh's proxies' `name` and `location`, which it does
 * not document (`refreshSource`).
 */
const samePatched = (next: any, held: any) =>
  refreshSource(held) !== undefined &&
  refreshSource(held) === refreshSource(next)

const adapter: RouteHmrAdapter = {
  keep: samePatched,
  keepPatched: samePatched,
  retire: forgetChunkExports,
}

// Set once this document reloads: two routes that recover in one update
// reload it once.
let reloading = false

/**
 * TEMPORARY WORKAROUND: on Vite, a split component whose import failed
 * reloads the page when that import succeeds again (`RouteHmrAdapter.recovered`).
 * TODO: remove (with `RouteHmrMeta.vite` and its planner line) once
 * solid-refresh patches a module when it evaluates in its ESM (Vite) mode:
 * <solid-refresh issue, to be filed> (oracle KNOWN-BUGS, "Upstream issues")
 *
 * Why: solid-refresh 0.6.3 patches a module's proxies on Vite only inside
 * that module's own accept callback (its webpack mode patches when the module
 * evaluates). When a file a split chunk reads is deleted, the route module's
 * re-import of the chunk fails, and after that failed import analysis Vite
 * sends the file's return to the route module alone: the route module
 * imports the chunk again, the chunk evaluates outside its own update, and
 * its new component is never patched into the proxy the wrapper holds.
 * Keeping that proxy (`samePatched`) shows the old code until the next edit;
 * taking the new one leaves the wrapper on a proxy solid-refresh never
 * patches, so the next edit of the restored file would not show.
 *
 * Cost: the page loses its local state at that recovery (also when the
 * recovering route is not the one shown). main reaches the same end result
 * by reloading. Not covered: a component whose own module reads the deleted
 * file (the route's import never fails), which shows the restored file at
 * the next edit.
 */
const restoredImportReload = () => {
  if (!reloading) {
    reloading = true
    window.location.reload()
  }
}

const viteAdapter: RouteHmrAdapter = {
  ...adapter,
  recovered: restoredImportReload,
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
    applyRouteHmr(routeId, Route, meta, meta.vite ? viteAdapter : adapter)
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
