import * as Solid from 'solid-js'
import type { AnyRouteMatch } from '@tanstack/router-core'

/**
 * Context that provides stable match accessors.
 * Similar to @solidjs/router's RouteContext approach, this provides
 * a cached accessor that won't trigger during async transitions.
 */
export const MatchAccessorContext = Solid.createContext<
  Solid.Accessor<AnyRouteMatch | undefined>
>()

export function useMatchAccessor() {
  const accessor = Solid.useContext(MatchAccessorContext)
  if (!accessor) {
    // Fallback for components not wrapped in context (shouldn't happen)
    return () => undefined
  }
  return accessor
}
