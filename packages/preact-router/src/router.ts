import { RouterCore } from '@tanstack/router-core'
import { createFileRoute, createLazyFileRoute } from './fileRoute'
import type { RouterHistory } from '@tanstack/history'
import type {
  AnyRoute,
  CreateRouterFn,
  RouterConstructorOptions,
  TrailingSlashOption,
} from '@tanstack/router-core'

import type {
  ErrorRouteComponent,
  NotFoundRouteComponent,
  RouteComponent,
} from './route'

declare module '@tanstack/router-core' {
  export interface RouterOptionsExtensions {
    defaultComponent?: RouteComponent
    defaultErrorComponent?: ErrorRouteComponent
    defaultPendingComponent?: RouteComponent
    defaultNotFoundComponent?: NotFoundRouteComponent
    /**
     * A component that will be used to wrap the entire router.
     * Only non-DOM-rendering components like providers should be used.
     */
    Wrap?: (props: { children: any }) => preact.JSX.Element
    /**
     * A component that will be used to wrap the inner contents of the router.
     * Only non-DOM-rendering components like providers should be used.
     */
    InnerWrap?: (props: { children: any }) => preact.JSX.Element
    /**
     * The default `onCatch` handler for errors caught by the Router ErrorBoundary
     */
    defaultOnCatch?: (error: Error, errorInfo: { componentStack?: string }) => void
  }
}

/**
 * Creates a new Router instance for Preact.
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
    super(options)
  }
}

if (typeof globalThis !== 'undefined') {
  ;(globalThis as any).createFileRoute = createFileRoute
  ;(globalThis as any).createLazyFileRoute = createLazyFileRoute
} else if (typeof window !== 'undefined') {
  ;(window as any).createFileRoute = createFileRoute
  ;(window as any).createLazyFileRoute = createLazyFileRoute
}
