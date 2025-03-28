import {
  ApplicationRef,
  createEnvironmentInjector,
  EnvironmentInjector,
  inject,
  InjectionToken,
  Injector,
  type Provider,
} from '@angular/core';
import type { HistoryLocation, RouterHistory } from '@tanstack/history';
import {
  type AnyRoute,
  type AnyRouter,
  type CreateRouterFn,
  rootRouteId,
  type RouterConstructorOptions,
  RouterCore,
  type RouterState,
  type TrailingSlashOption,
} from '@tanstack/router-core';
import { BehaviorSubject, type Observable } from 'rxjs';
import type { RouteComponent } from './route';

declare module '@tanstack/history' {
  interface HistoryState {
    __tempLocation?: HistoryLocation;
    __tempKey?: string;
    __hashScrollIntoViewOptions?: boolean | ScrollIntoViewOptions;
  }
}

declare module '@tanstack/router-core' {
  export interface RouterOptionsExtensions {
    /**
     * The default `component` a route should use if no component is provided.
     *
     * @default Outlet
     * @link [API Docs](https://tanstack.com/router/latest/docs/framework/solid/api/router/RouterOptionsType#defaultcomponent-property)
     */
    defaultComponent?: () => RouteComponent;
    /**
     * The default `errorComponent` a route should use if no error component is provided.
     *
     * @default ErrorComponent
     * @link [API Docs](https://tanstack.com/router/latest/docs/framework/solid/api/router/RouterOptionsType#defaulterrorcomponent-property)
     * @link [Guide](https://tanstack.com/router/latest/docs/framework/solid/guide/data-loading#handling-errors-with-routeoptionserrorcomponent)
     */
    defaultErrorComponent?: () => RouteComponent;
    /**
     * The default `pendingComponent` a route should use if no pending component is provided.
     *
     * @link [API Docs](https://tanstack.com/router/latest/docs/framework/solid/api/router/RouterOptionsType#defaultpendingcomponent-property)
     * @link [Guide](https://tanstack.com/router/latest/docs/framework/solid/guide/data-loading#showing-a-pending-component)
     */
    defaultPendingComponent?: () => RouteComponent;
    /**
     * The default `notFoundComponent` a route should use if no notFound component is provided.
     *
     * @default NotFound
     * @link [API Docs](https://tanstack.com/router/latest/docs/framework/solid/api/router/RouterOptionsType#defaultnotfoundcomponent-property)
     * @link [Guide](https://tanstack.com/router/latest/docs/framework/solid/guide/not-found-errors#default-router-wide-not-found-handling)
     */
    defaultNotFoundComponent?: () => RouteComponent;
    /**
     * The default `onCatch` handler for errors caught by the Router ErrorBoundary
     *
     * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#defaultoncatch-property)
     * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/data-loading#handling-errors-with-routeoptionsoncatch)
     */
    defaultOnCatch?: (error: Error) => void;
  }
}

export const ROUTER = new InjectionToken<NgRouter<AnyRoute>>('ROUTER');
export const ROUTER_STATE = new InjectionToken<
  Observable<RouterState<AnyRoute>>
>('ROUTER_STATE');

export function injectRouter() {
  return inject(ROUTER);
}

export function injectRouterState() {
  return inject(ROUTER_STATE);
}

export function provideRouter(router: AnyRouter) {
  return [
    { provide: ROUTER, useValue: router },
    {
      provide: ROUTER_STATE,
      useFactory: () => {
        const state = new BehaviorSubject(router.state);
        const appRef = inject(ApplicationRef);

        const unsub = router.__store.subscribe(({ currentVal }) => {
          state.next(currentVal);
        });

        appRef.onDestroy(() => {
          state.complete();
          unsub();
        });

        return state.asObservable();
      },
    },
  ];
}

export const createRouter: CreateRouterFn = (options) => {
  return new NgRouter(options);
};

export class NgRouter<
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
  private injectors = new Map<string, Injector>();
  private envInjectors = new Map<string, EnvironmentInjector>();

  constructor(
    options: RouterConstructorOptions<
      TRouteTree,
      TTrailingSlashOption,
      TDefaultStructuralSharingOption,
      TRouterHistory,
      TDehydrated
    >
  ) {
    super(options);
  }

  getRouteInjector(
    routeId: string,
    parent: Injector,
    providers: Provider[] = []
  ) {
    const existingInjector = this.injectors.get(routeId);
    if (existingInjector) return existingInjector;

    const injector = Injector.create({
      providers,
      parent,
      name: routeId,
    });

    // cache
    this.injectors.set(routeId, injector);
    return injector;
  }

  getRouteEnvInjector(
    routeId: string,
    parent: EnvironmentInjector,
    providers: Provider[] = [],
    router: AnyRouter
  ) {
    const existingInjector = this.envInjectors.get(routeId);
    if (existingInjector) return existingInjector;

    let route = router.routesById[routeId] || router.routesByPath[routeId];

    // walk up the route hierarchy to build the providers
    while (route) {
      if (route.options?.providers) {
        providers.push(...route.options.providers);
      }

      const parentInjector = route.parentRoute
        ? this.envInjectors.get(route.parentRoute.id)
        : null;

      if (parentInjector) {
        parent = parentInjector;
        break;
      }

      route = route.parentRoute;
    }

    const envInjector = createEnvironmentInjector(providers, parent, routeId);

    // if routeId is rootRouteId, we'll switch existing injectors' parent to the __root__ injector
    if (routeId === rootRouteId) {
      this.envInjectors.forEach((ele) => {
        if ('parent' in ele && ele.parent === parent) {
          ele.parent = envInjector;
        }
      });
    }

    // cache
    this.envInjectors.set(routeId, envInjector);
    return envInjector;
  }
}
