import { resolveNativeRouteOptions } from '@tanstack/react-router/native'
import type { AnyRoute, AnyRouter, RouterState } from '@tanstack/router-core'
import type {
  NativeScriptRouteContext,
  NativeScriptRouteOptions,
} from './route-options'

export interface NativeScreenSnapshot {
  historyIndex: number
  locationKey: string
  href: string
  revision: number
  state: RouterState<AnyRoute>
  routeContext: NativeScriptRouteContext
  routeOptions: NativeScriptRouteOptions
}

export type NativeStackAction =
  | 'initialize'
  | 'push'
  | 'pop'
  | 'replace'
  | 'update'
  | 'none'

export function cloneRouterState(
  state: RouterState<AnyRoute>,
): RouterState<AnyRoute> {
  return {
    ...state,
    location: {
      ...state.location,
      state: { ...state.location.state },
    },
    resolvedLocation: state.resolvedLocation
      ? {
          ...state.resolvedLocation,
          state: { ...state.resolvedLocation.state },
        }
      : undefined,
    matches: state.matches.map((match) => ({ ...match })),
  }
}

export function createNativeScreenSnapshot(
  router: AnyRouter,
  state: RouterState<AnyRoute>,
): NativeScreenSnapshot {
  const snapshot = cloneRouterState(state)
  const { context, options } = resolveNativeRouteOptions(router, snapshot)

  return {
    historyIndex: snapshot.location.state.__TSR_index ?? 0,
    locationKey:
      snapshot.location.state.__TSR_key ??
      snapshot.location.state.key ??
      snapshot.location.href,
    href: snapshot.location.href,
    revision: snapshot.loadedAt,
    state: snapshot,
    routeContext: context,
    routeOptions: options,
  }
}

export function getNativeStackAction(
  current: NativeScreenSnapshot | undefined,
  next: NativeScreenSnapshot,
): NativeStackAction {
  if (!current) {
    return 'initialize'
  }

  if (next.historyIndex > current.historyIndex) {
    return 'push'
  }

  if (next.historyIndex < current.historyIndex) {
    return 'pop'
  }

  if (next.locationKey !== current.locationKey) {
    return 'replace'
  }

  if (next.href !== current.href || next.revision !== current.revision) {
    return 'update'
  }

  return 'none'
}
