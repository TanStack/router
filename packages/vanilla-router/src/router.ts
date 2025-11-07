import { RouterCore } from '@tanstack/router-core'
import type { RouterHistory } from '@tanstack/history'
import type {
  AnyRoute,
  CreateRouterFn,
  RouterConstructorOptions,
  RouterState,
  TrailingSlashOption,
} from '@tanstack/router-core'

import type {
  VanillaErrorRouteComponent,
  VanillaNotFoundRouteComponent,
  VanillaRouteComponent,
} from './types'

declare module '@tanstack/router-core' {
  export interface RouterOptionsExtensions {
    /**
     * The default `component` a route should use if no component is provided.
     *
     * @default Outlet
     */
    defaultComponent?: VanillaRouteComponent
    /**
     * The default `errorComponent` a route should use if no error component is provided.
     */
    defaultErrorComponent?: VanillaErrorRouteComponent
    /**
     * The default `pendingComponent` a route should use if no pending component is provided.
     */
    defaultPendingComponent?: VanillaRouteComponent
    /**
     * The default `notFoundComponent` a route should use if no notFound component is provided.
     */
    defaultNotFoundComponent?: VanillaNotFoundRouteComponent
  }
}

export const createRouter: CreateRouterFn = (options) => {
  return new Router(options)
}

export class Router<
  in out TRouteTree extends AnyRoute,
  in out TTrailingSlashOption extends TrailingSlashOption = 'never',
  in out TDefaultStructuralSharingOption extends boolean = false,
  in out TRouterHistory extends RouterHistory = RouterHistory,
  in out TDehydrated extends Record<string, any> = Record<string, any>,
> extends RouterCore<
  TRouteTree,
  TTrailingSlashOption,
  TDefaultStructuralSharingOption,
  TRouterHistory,
  TDehydrated
> {
  constructor(
    options: RouterConstructorOptions<
      TRouteTree,
      TTrailingSlashOption,
      TDefaultStructuralSharingOption,
      TRouterHistory,
      TDehydrated
    >,
  ) {
    super(options)
  }

  /**
   * Subscribe to router state changes
   * This is the recommended way to react to router state updates in vanilla JS
   * Similar to React Router's useRouterState hook
   * 
   * @param callback - Function called whenever router state changes
   * @returns Unsubscribe function
   */
  subscribeState(
    callback: (state: RouterState<TRouteTree>) => void,
  ): () => void {
    // Subscribe directly to the router's store (same as React Router does internally)
    return this.__store.subscribe(() => {
      callback(this.state)
    })
  }
}

