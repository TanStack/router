import { WarningLedger } from '@tanstack/router-utils/compiler'
import type { GetRoutesByFileMapResult } from '@tanstack/router-generator'

export type RouterPluginContext = {
  /** The generator's registry: route file path (scanned and real) → route id. */
  routesByFile: GetRoutesByFileMapResult
  /**
   * While the generator has never generated the routes (each run failed):
   * its last error. `routesByFile` lists no route then because none is
   * known yet. Set before `routesByFile` by each publication.
   */
  generationFailure?: unknown
}

type RoutesChangedListener = (
  next: GetRoutesByFileMapResult,
  previous: GetRoutesByFileMapResult,
) => void

interface ContextInternals {
  /** Warnings once per (file, reason), shared by every compiler of the context. */
  warnings: WarningLedger
  listeners: Set<RoutesChangedListener>
}

const internals = new WeakMap<RouterPluginContext, ContextInternals>()

/**
 * The shared state of the plugins created for one context: the generator
 * writes `routesByFile` after each run; the compilers subscribe to the
 * change and share one warning ledger.
 */
export function createRouterPluginContext(): RouterPluginContext {
  let routesByFile: GetRoutesByFileMapResult = new Map()
  const state: ContextInternals = {
    warnings: new WarningLedger(),
    listeners: new Set(),
  }
  const context: RouterPluginContext = {
    get routesByFile() {
      return routesByFile
    },
    set routesByFile(next: GetRoutesByFileMapResult) {
      const previous = routesByFile
      // the generator replaces its registry when an entry changed: the same
      // one again (after a run that changed no entry) is no change
      if (next === previous) {
        return
      }
      routesByFile = next
      for (const listener of state.listeners) {
        listener(next, previous)
      }
    },
  }
  internals.set(context, state)
  return context
}

/**
 * Hands a generator session's publication to the context (`publish` of
 * `createGeneratorSession`): the failure first, so a listener of the
 * registry change reads both.
 *
 * @private TanStack Start's wiring, not public API.
 */
export function publishRoutes(
  context: RouterPluginContext,
  routesByFile: GetRoutesByFileMapResult,
  failure: unknown,
): void {
  context.generationFailure = failure
  context.routesByFile = routesByFile
}

/**
 * The internals of a context `createRouterPluginContext` made. The plugins
 * read them when they are created, so a context it didn't make (an object
 * literal, or one from the package's other module format: each has its own
 * factory and internals) fails there.
 */
export function contextInternals(
  context: RouterPluginContext,
): ContextInternals {
  const state = internals.get(context)
  if (!state) {
    throw new Error(
      '[tanstack-router] The router plugin context was not made by this copy of @tanstack/router-plugin. ' +
        "Create it with `createRouterPluginContext()` from '@tanstack/router-plugin/context', " +
        'imported in the same module format (ESM or CJS) as the plugins.',
    )
  }
  return state
}

/**
 * Subscribes to registry changes; returns the unsubscribe function.
 *
 * @private TanStack Start's wiring, not public API.
 */
export function onRoutesChanged(
  context: RouterPluginContext,
  listener: RoutesChangedListener,
): () => void {
  const state = contextInternals(context)
  state.listeners.add(listener)
  return () => {
    state.listeners.delete(listener)
  }
}

/**
 * The paths whose registry entry differs between two registries (a
 * symlinked route file's real path is one of its keys: bundlers resolve
 * modules to it, so that is where the compiler's plans live; the hosts
 * invalidate every path listed).
 *
 * @private TanStack Start's wiring, not public API.
 */
export function changedRoutePaths(
  next: GetRoutesByFileMapResult,
  previous: GetRoutesByFileMapResult,
): Array<string> {
  const out: Array<string> = []
  for (const [path, entry] of next) {
    const before = previous.get(path)
    if (
      before?.routeId !== entry.routeId ||
      before.kind !== entry.kind ||
      before.routerConstructor !== entry.routerConstructor
    ) {
      out.push(path)
    }
  }
  for (const path of previous.keys()) {
    if (!next.has(path)) {
      out.push(path)
    }
  }
  return out
}
