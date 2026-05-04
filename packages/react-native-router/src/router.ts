import { RouterCore } from '@tanstack/router-core'
import { getStoreFactory } from './routerStores'
import type { RouterHistory } from '@tanstack/history'
import type {
  AnyRoute,
  CreateRouterFn,
  RouterConstructorOptions,
  TrailingSlashOption,
} from '@tanstack/router-core'
import type {
  ErrorRouteComponent,
  NativeMinStackState,
  NotFoundRouteComponent,
  RouteComponent,
} from './route'
import type { NativeLinkingOptions } from './linking'

export interface NativeRouterOptions {
  pausedDepth?: number
  detachedDepth?: number
  defaultMinStackState?: NativeMinStackState
  linking?: boolean | NativeLinkingOptions
}

declare module '@tanstack/router-core' {
  export interface RouterOptionsExtensions {
    native?: NativeRouterOptions
    /**
     * The default `component` a route should use if no component is provided.
     */
    defaultComponent?: RouteComponent
    /**
     * The default `errorComponent` a route should use if no error component is provided.
     */
    defaultErrorComponent?: ErrorRouteComponent
    /**
     * The default `pendingComponent` a route should use if no pending component is provided.
     */
    defaultPendingComponent?: RouteComponent
    /**
     * The default `notFoundComponent` a route should use if no notFound component is provided.
     */
    defaultNotFoundComponent?: NotFoundRouteComponent
    /**
     * A component that will be used to wrap the entire router.
     */
    Wrap?: (props: { children: any }) => React.JSX.Element
    /**
     * A component that will be used to wrap the inner contents of the router.
     */
    InnerWrap?: (props: { children: any }) => React.JSX.Element
    /**
     * The default `onCatch` handler for errors caught by the Router ErrorBoundary
     */
    defaultOnCatch?: (error: Error, errorInfo: React.ErrorInfo) => void
  }
}

/**
 * Create a new React Native router instance.
 * Pass the resulting router to `NativeRouterProvider`.
 */
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
    super(options, getStoreFactory)
  }
}
