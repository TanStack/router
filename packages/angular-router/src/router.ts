import {
  AnyRoute,
  CreateRouterFn,
  RouterConstructorOptions,
  RouterCore,
  TrailingSlashOption,
} from '@tanstack/router-core'
import { ErrorRouteComponent, RouteComponent } from './route'
import { RouterHistory } from '@tanstack/history'

declare module '@tanstack/router-core' {
  export interface RouterOptionsExtensions {
    /**
     * The default `component` a route should use if no component is provided.
     *
     * @default Outlet
     * @link [API Docs](https://tanstack.com/router/latest/docs/framework/solid/api/router/RouterOptionsType#defaultcomponent-property)
     */
    defaultComponent?: RouteComponent
    /**
     * The default `errorComponent` a route should use if no error component is provided.
     *
     * @default ErrorComponent
     * @link [API Docs](https://tanstack.com/router/latest/docs/framework/solid/api/router/RouterOptionsType#defaulterrorcomponent-property)
     * @link [Guide](https://tanstack.com/router/latest/docs/framework/solid/guide/data-loading#handling-errors-with-routeoptionserrorcomponent)
     */
    defaultErrorComponent?: ErrorRouteComponent
    /**
     * The default `pendingComponent` a route should use if no pending component is provided.
     *
     * @link [API Docs](https://tanstack.com/router/latest/docs/framework/solid/api/router/RouterOptionsType#defaultpendingcomponent-property)
     * @link [Guide](https://tanstack.com/router/latest/docs/framework/solid/guide/data-loading#showing-a-pending-component)
     */
    defaultPendingComponent?: RouteComponent
    /**
     * The default `notFoundComponent` a route should use if no notFound component is provided.
     *
     * @default NotFound
     * @link [API Docs](https://tanstack.com/router/latest/docs/framework/solid/api/router/RouterOptionsType#defaultnotfoundcomponent-property)
     * @link [Guide](https://tanstack.com/router/latest/docs/framework/solid/guide/not-found-errors#default-router-wide-not-found-handling)
     */
    defaultNotFoundComponent?: RouteComponent
  }
}

export const createRouter: CreateRouterFn = (options: any) => {
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
