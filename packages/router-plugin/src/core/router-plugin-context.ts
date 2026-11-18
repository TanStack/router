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

/**
 * Where a context keeps its internals: on the context itself, under a global
 * symbol, so that each copy of this module (the CJS and the ESM build) finds
 * the same state.
 */
const INTERNALS = Symbol.for('@tanstack/router-plugin/context-internals')

type ContextWithInternals = RouterPluginContext & {
  [INTERNALS]?: ContextInternals
}

/**
 * The shared state of the plugins created for one context: the generator
 * writes `routesByFile` after each run; the compilers subscribe to the
 * change and share one warning ledger.
 */
export function createRouterPluginContext(): RouterPluginContext {
  const context: RouterPluginContext = { routesByFile: new Map() }
  contextInternals(context)
  return context
}

/**
 * Hands a generator session's publication to the context (`publish` of
 * `createGeneratorSession`): the failure first, so a listener of the
 * registry change reads both.
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
 * The internals of a context, created on first use: a context may be one the
 * app built itself (`{ routesByFile: new Map() }`). Assigning `routesByFile`
 * notifies the listeners from then on, whoever assigns it (the router's
 * generator, or the app's own generator plugin).
 */
export function contextInternals(
  context: RouterPluginContext,
): ContextInternals {
  const known = (context as ContextWithInternals)[INTERNALS]
  if (known) {
    return known
  }
  const state: ContextInternals = {
    warnings: new WarningLedger(),
    listeners: new Set(),
  }
  let routesByFile = context.routesByFile
  Object.defineProperty(context, INTERNALS, { value: state })
  Object.defineProperty(context, 'routesByFile', {
    configurable: true,
    enumerable: true,
    get: () => routesByFile,
    set: (next: GetRoutesByFileMapResult) => {
      const previous = routesByFile
      // the generator replaces its registry when a route changed: the same
      // one again (after an event that changed no route) is no change
      if (next === previous) {
        return
      }
      routesByFile = next
      for (const listener of state.listeners) {
        listener(next, previous)
      }
    },
  })
  return state
}

/** Subscribes to registry changes; returns the unsubscribe function. */
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
