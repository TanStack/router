import { RouterCore } from '@tanstack/router-core'
import { getStoreFactory } from './routerStores'
import type { RouterHistory } from '@tanstack/history'
import type {
  AnyRoute,
  RouterConstructorOptions,
  TrailingSlashOption,
} from '@tanstack/router-core'

/**
 * Create a TanStack Router instance bound to the Remix 3 (`@remix-run/ui`)
 * component runtime.
 *
 * Mirrors `createRouter` from `@tanstack/react-router` but plugs the
 * Remix-flavored reactivity adapter into the framework-agnostic core.
 */
export function createRouter<
  TRouteTree extends AnyRoute,
  TTrailingSlashOption extends TrailingSlashOption = 'never',
  TDefaultStructuralSharingOption extends boolean = false,
  TRouterHistory extends RouterHistory = RouterHistory,
  TDehydrated extends Record<string, any> = Record<string, any>,
>(
  options: RouterConstructorOptions<
    TRouteTree,
    TTrailingSlashOption,
    TDefaultStructuralSharingOption,
    TRouterHistory,
    TDehydrated
  >,
): RouterCore<
  TRouteTree,
  TTrailingSlashOption,
  TDefaultStructuralSharingOption,
  TRouterHistory,
  TDehydrated
> {
  return new RouterCore(options, getStoreFactory)
}

export type Router<
  TRouteTree extends AnyRoute = AnyRoute,
  TTrailingSlashOption extends TrailingSlashOption = 'never',
  TDefaultStructuralSharingOption extends boolean = false,
  TRouterHistory extends RouterHistory = RouterHistory,
  TDehydrated extends Record<string, any> = Record<string, any>,
> = RouterCore<
  TRouteTree,
  TTrailingSlashOption,
  TDefaultStructuralSharingOption,
  TRouterHistory,
  TDehydrated
>
