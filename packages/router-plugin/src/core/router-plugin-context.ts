import { WarningLedger } from '@tanstack/router-utils/compiler'
import type { GetRoutesByFileMapResult } from '@tanstack/router-generator'

export type RouterPluginContext = {
  /** The generator's registry: route file path (scanned and real) → route id. */
  routesByFile: GetRoutesByFileMapResult
}

export type RoutesChangedListener = (
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
    warnings: new WarningLedger(() => {}),
    listeners: new Set(),
  }
  const context: RouterPluginContext = {
    get routesByFile() {
      return routesByFile
    },
    set routesByFile(next: GetRoutesByFileMapResult) {
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
  }
  internals.set(context, state)
  return context
}

export function contextInternals(
  context: RouterPluginContext,
): ContextInternals {
  let state = internals.get(context)
  if (!state) {
    // a context object created by hand: give it internals
    state = { warnings: new WarningLedger(() => {}), listeners: new Set() }
    internals.set(context, state)
  }
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

/** The paths whose registry entry differs between two registries. */
export function changedRoutePaths(
  next: GetRoutesByFileMapResult,
  previous: GetRoutesByFileMapResult,
): Array<string> {
  const out: Array<string> = []
  for (const [path, entry] of next) {
    const before = previous.get(path)
    if (!before || before.routeId !== entry.routeId) {
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
