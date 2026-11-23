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

/**
 * Whether `next` puts a component option of `before` in another module, or
 * leaves the split chunk of one it removed holding another
 * (`RouteHmrMeta.chunks`): solid-refresh cannot follow either.
 */
function regrouped(before = '', next = ''): boolean {
  if (before === next) {
    return false
  }
  const chunkOf = (layout: string) =>
    new Map(
      layout.split(',').map((entry) => entry.split(':') as [string, string]),
    )
  const was = chunkOf(before)
  const is = chunkOf(next)
  const kept = new Set(is.values())
  for (const [key, chunk] of was) {
    // moved, or removed from a split chunk another component stays in
    if (is.has(key) ? is.get(key) !== chunk : chunk !== '' && kept.has(chunk)) {
      return true
    }
  }
  return false
}

/**
 * `reloadOnRecover`: a split component whose import failed reloads the page
 * when that import succeeds again (a deleted file its chunk reads, restored).
 * solid-refresh 0.6.3 patches a module's proxies on Vite only inside that
 * module's own accept callback; after the failed import, the file's return
 * updates the route module alone, which imports the chunk again outside the
 * chunk's own update, so its new component is never patched into the proxy
 * the wrapper holds (keeping that proxy shows the old code until the next
 * edit; taking the new one leaves the wrapper on a proxy solid-refresh never
 * patches). On the webpack-style hosts the dev server's client reloads the
 * page after the failed compile anyway. Remove once solid-refresh patches a
 * module when it evaluates in its ESM mode (oracle KNOWN-BUGS, "Upstream
 * issues").
 */
const adapter: RouteHmrAdapter = {
  keep: samePatched,
  reload: (before, next) => regrouped(before.chunks, next.chunks),
  reloadOnRecover: true,
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
  file: string,
  chunk: string,
  exports: Record<string, any>,
  refresh: boolean,
): void {
  if (process.env.NODE_ENV !== 'production') {
    recordChunkExports(file, chunk, exports)
    applyRouteChunkHmr(file, chunk, adapter, refresh)
  }
}

/**
 * Dev-only entry point called by the router plugin's output at the top level
 * of every evaluation of a module of a route file that reads a binding the
 * route module keeps, on webpack-style hosts (`applyKeptReaderHmr`).
 *
 * Called only by compiler output; not a public API.
 */
export function __tsrKeptReaderHmr(file: string, hot: KeptReaderHot): void {
  if (process.env.NODE_ENV !== 'production') {
    applyKeptReaderHmr(file, hot)
  }
}

export { __tsrChunkImporter } from './hmr-chunk-importer'
