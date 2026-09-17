import type { InjectionKey } from 'vue'

// Stable routeId context — a plain string (not reactive) that identifies
// which route this component belongs to. Provided by Match, consumed by
// MatchInner, Outlet, and useMatch for routeId-based store lookups.
export const routeIdContext = Symbol(
  'TanStackRouterRouteId',
) as InjectionKey<string>
