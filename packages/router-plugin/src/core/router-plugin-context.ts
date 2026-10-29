import fs from 'node:fs'
import { WarningLedger, normalizePath } from '@tanstack/router-utils/compiler'
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
    warnings: new WarningLedger(),
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

/** The internals of a context `createRouterPluginContext` made. */
export function contextInternals(
  context: RouterPluginContext,
): ContextInternals {
  return internals.get(context)!
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
 * The paths whose registry entry differs between two registries: the
 * scanned path and, for a symlinked route file, its real path too (bundlers
 * resolve modules to their real path, so that is where the compiler's plans
 * live; the hosts invalidate every path listed).
 */
export function changedRoutePaths(
  next: GetRoutesByFileMapResult,
  previous: GetRoutesByFileMapResult,
): Array<string> {
  const out = new Set<string>()
  const add = (path: string) => {
    out.add(path)
    try {
      const real = normalizePath(fs.realpathSync.native(path))
      if (real !== path) {
        out.add(real)
      }
    } catch {
      // gone: its plans are evicted at the scanned path, if any
    }
  }
  for (const [path, entry] of next) {
    const before = previous.get(path)
    if (!before || before.routeId !== entry.routeId) {
      add(path)
    }
  }
  for (const path of previous.keys()) {
    if (!next.has(path)) {
      add(path)
    }
  }
  return [...out]
}
