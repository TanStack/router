import type { InjectionKey, Ref } from 'vue'

// Reactive nearest-match context used by hooks that work relative to the
// current match in the tree.
export const matchContext = Symbol('TanStackRouterMatch') as InjectionKey<
  Ref<string | undefined>
>

// Stable routeId context — a plain string (not reactive) that identifies
// which route this component belongs to. Provided by Match, consumed by
// MatchInner, Outlet, and useMatch for routeId-based store lookups.
export const routeIdContext = Symbol(
  'TanStackRouterRouteId',
) as InjectionKey<string>
