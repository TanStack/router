import { InjectionToken, runInInjectionContext } from '@angular/core'
import { BaseRootRoute, BaseRoute, BaseRouteApi } from '@tanstack/router-core'
import { loaderData, loaderData$ } from './loader-data'
import { loaderDeps, loaderDeps$ } from './loader-deps'
import { match, match$ } from './match'
import { params, params$ } from './params'
import { routeContext, routeContext$ } from './route-context'
import { search, search$ } from './search'

import type { Provider, Type } from '@angular/core'
import type {
  AnyContext,
  AnyRoute,
  AnyRouter,
  ConstrainLiteral,
  ErrorComponentProps,
  NotFoundRouteProps,
  RegisteredRouter,
  ResolveFullPath,
  ResolveId,
  ResolveParams,
  RootRouteId,
  RootRouteOptions,
  RouteConstraints,
  RouteIds,
  RouteOptions,
} from '@tanstack/router-core'
import type { LoaderDataRoute } from './loader-data'
import type { LoaderDepsRoute } from './loader-deps'
import type { MatchRoute } from './match'
import type { ParamsRoute } from './params'
import type { RouteContextRoute } from './route-context'
import type { SearchRoute } from './search'

declare module '@tanstack/router-core' {
  export interface UpdatableRouteOptionsExtensions {
    component?: () => RouteComponent
    errorComponent?: false | null | (() => RouteComponent)
    notFoundComponent?: () => RouteComponent
    pendingComponent?: () => RouteComponent
    providers?: Array<Provider>
  }

  export interface RouteExtensions<
    TId extends string,
    TFullPath extends string,
  > {
    match$: MatchRoute<true, TId>
    match: MatchRoute<false, TId>
    routeContext$: RouteContextRoute<true, TId>
    routeContext: RouteContextRoute<false, TId>
    search$: SearchRoute<true, TId>
    search: SearchRoute<false, TId>
    params$: ParamsRoute<true, TId>
    params: ParamsRoute<false, TId>
    loaderDeps$: LoaderDepsRoute<true, TId>
    loaderDeps: LoaderDepsRoute<false, TId>
    loaderData$: LoaderDataRoute<true, TId>
    loaderData: LoaderDataRoute<false, TId>
  }
}

export const ERROR_COMPONENT_CONTEXT = new InjectionToken<ErrorComponentProps>(
  'ERROR_COMPONENT_CONTEXT',
)
export const NOT_FOUND_COMPONENT_CONTEXT =
  new InjectionToken<NotFoundRouteProps>('NOT_FOUND_COMPONENT_CONTEXT')

export type RouteComponent<TComponent extends object = object> =
  Type<TComponent>

export function routeApi<
  const TId,
  TRouter extends AnyRouter = RegisteredRouter,
>(id: ConstrainLiteral<TId, RouteIds<TRouter['routeTree']>>) {
  return new RouteApi<TId, TRouter>({ id })
}

export class RouteApi<
  TId,
  TRouter extends AnyRouter = RegisteredRouter,
> extends BaseRouteApi<TId, TRouter> {
  /**
   * @deprecated Use the `getRouteApi` function instead.
   */
  constructor({ id }: { id: TId }) {
    super({ id })
  }

  match$: MatchRoute<true, TId> = (opts) =>
    match$({ ...opts, from: this.id } as any) as any
  match: MatchRoute<false, TId> = (opts) =>
    match({ ...opts, from: this.id } as any) as any

  routeContext$: RouteContextRoute<true, TId> = (opts) =>
    routeContext$({ ...opts, from: this.id } as unknown as any)
  routeContext: RouteContextRoute<false, TId> = (opts) =>
    routeContext({ ...opts, from: this.id } as unknown as any)

  search$: SearchRoute<true, TId> = (opts) =>
    search$({ ...opts, from: this.id } as any) as any
  search: SearchRoute<false, TId> = (opts) =>
    search({ ...opts, from: this.id } as any) as any

  params$: ParamsRoute<true, TId> = (opts) =>
    params$({ ...opts, from: this.id } as any) as any
  params: ParamsRoute<false, TId> = (opts) =>
    params({ ...opts, from: this.id } as any) as any

  loaderDeps$: LoaderDepsRoute<true, TId> = (opts) =>
    loaderDeps$({ ...opts, from: this.id } as any)
  loaderDeps: LoaderDepsRoute<false, TId> = (opts) =>
    loaderDeps({ ...opts, from: this.id, strict: false } as any)

  loaderData$: LoaderDataRoute<true, TId> = (opts) =>
    loaderData$({ ...opts, from: this.id } as any)
  loaderData: LoaderDataRoute<false, TId> = (opts) =>
    loaderData({ ...opts, from: this.id, strict: false } as any)
}

export class Route<
  in out TParentRoute extends RouteConstraints['TParentRoute'] = AnyRoute,
  in out TPath extends RouteConstraints['TPath'] = '/',
  in out TFullPath extends RouteConstraints['TFullPath'] = ResolveFullPath<
    TParentRoute,
    TPath
  >,
  in out TCustomId extends RouteConstraints['TCustomId'] = string,
  in out TId extends RouteConstraints['TId'] = ResolveId<
    TParentRoute,
    TCustomId,
    TPath
  >,
  in out TSearchValidator = undefined,
  in out TParams = ResolveParams<TPath>,
  in out TRouterContext = AnyContext,
  in out TRouteContextFn = AnyContext,
  in out TBeforeLoadFn = AnyContext,
  in out TLoaderDeps extends Record<string, any> = {},
  in out TLoaderFn = undefined,
  in out TChildren = unknown,
  in out TFileRouteTypes = unknown,
> extends BaseRoute<
  TParentRoute,
  TPath,
  TFullPath,
  TCustomId,
  TId,
  TSearchValidator,
  TParams,
  TRouterContext,
  TRouteContextFn,
  TBeforeLoadFn,
  TLoaderDeps,
  TLoaderFn,
  TChildren,
  TFileRouteTypes
> {
  /**
   * @deprecated Use the `createRoute` function instead.
   */
  constructor(
    options?: RouteOptions<
      TParentRoute,
      TId,
      TCustomId,
      TFullPath,
      TPath,
      TSearchValidator,
      TParams,
      TLoaderDeps,
      TLoaderFn,
      TRouterContext,
      TRouteContextFn,
      TBeforeLoadFn
    >,
  ) {
    super(options)
  }

  match$: MatchRoute<true, TId> = (opts) =>
    match$({ ...opts, from: this.id } as any) as any
  match: MatchRoute<false, TId> = (opts) =>
    match({ ...opts, from: this.id } as any) as any

  routeContext$: RouteContextRoute<true, TId> = (opts) =>
    routeContext$({ ...opts, from: this.id } as unknown as any)
  routeContext: RouteContextRoute<false, TId> = (opts) =>
    routeContext({ ...opts, from: this.id } as unknown as any)

  search$: SearchRoute<true, TId> = (opts) =>
    search$({ ...opts, from: this.id } as any) as any
  search: SearchRoute<false, TId> = (opts) =>
    search({ ...opts, from: this.id } as any) as any

  params$: ParamsRoute<true, TId> = (opts) =>
    params$({ ...opts, from: this.id } as any) as any
  params: ParamsRoute<false, TId> = (opts) =>
    params({ ...opts, from: this.id } as any) as any

  loaderDeps$: LoaderDepsRoute<true, TId> = (opts) =>
    loaderDeps$({ ...opts, from: this.id } as any)
  loaderDeps: LoaderDepsRoute<false, TId> = (opts) =>
    loaderDeps({ ...opts, from: this.id } as any)

  loaderData$: LoaderDataRoute<true, TId> = (opts) =>
    loaderData$({ ...opts, from: this.id } as any)
  loaderData: LoaderDataRoute<false, TId> = (opts) =>
    loaderData({ ...opts, from: this.id } as any)
}

export function createRoute<
  TParentRoute extends RouteConstraints['TParentRoute'] = AnyRoute,
  TPath extends RouteConstraints['TPath'] = '/',
  TFullPath extends RouteConstraints['TFullPath'] = ResolveFullPath<
    TParentRoute,
    TPath
  >,
  TCustomId extends RouteConstraints['TCustomId'] = string,
  TId extends RouteConstraints['TId'] = ResolveId<
    TParentRoute,
    TCustomId,
    TPath
  >,
  TSearchValidator = undefined,
  TParams = ResolveParams<TPath>,
  TRouteContextFn = AnyContext,
  TBeforeLoadFn = AnyContext,
  TLoaderDeps extends Record<string, any> = {},
  TLoaderFn = undefined,
  TChildren = unknown,
>(
  options: RouteOptions<
    TParentRoute,
    TId,
    TCustomId,
    TFullPath,
    TPath,
    TSearchValidator,
    TParams,
    TLoaderDeps,
    TLoaderFn,
    AnyContext,
    TRouteContextFn,
    TBeforeLoadFn
  >,
): Route<
  TParentRoute,
  TPath,
  TFullPath,
  TCustomId,
  TId,
  TSearchValidator,
  TParams,
  AnyContext,
  TRouteContextFn,
  TBeforeLoadFn,
  TLoaderDeps,
  TLoaderFn,
  TChildren,
  unknown
> {
  if (options.loader) {
    options.loader = runFnInInjectionContext(options.loader)
  }

  if (options.shouldReload && typeof options.shouldReload === 'function') {
    options.shouldReload = runFnInInjectionContext(options.shouldReload)
  }

  if (options.beforeLoad) {
    options.beforeLoad = runFnInInjectionContext(options.beforeLoad)
  }

  return new Route<
    TParentRoute,
    TPath,
    TFullPath,
    TCustomId,
    TId,
    TSearchValidator,
    TParams,
    AnyContext,
    TRouteContextFn,
    TBeforeLoadFn,
    TLoaderDeps,
    TLoaderFn,
    TChildren,
    unknown
  >(options)
}

export type AnyRootRoute = RootRoute<any, any, any, any, any, any, any, any>

export function createRootRouteWithContext<TRouterContext extends {}>() {
  return <
    TRouteContextFn = AnyContext,
    TBeforeLoadFn = AnyContext,
    TSearchValidator = undefined,
    TLoaderDeps extends Record<string, any> = {},
    TLoaderFn = undefined,
  >(
    options?: RootRouteOptions<
      TSearchValidator,
      TRouterContext,
      TRouteContextFn,
      TBeforeLoadFn,
      TLoaderDeps,
      TLoaderFn
    >,
  ) => {
    return createRootRoute<
      TSearchValidator,
      TRouterContext,
      TRouteContextFn,
      TBeforeLoadFn,
      TLoaderDeps,
      TLoaderFn
    >(options as any)
  }
}

export class RootRoute<
  in out TSearchValidator = undefined,
  in out TRouterContext = {},
  in out TRouteContextFn = AnyContext,
  in out TBeforeLoadFn = AnyContext,
  in out TLoaderDeps extends Record<string, any> = {},
  in out TLoaderFn = undefined,
  in out TChildren = unknown,
  in out TFileRouteTypes = unknown,
> extends BaseRootRoute<
  TSearchValidator,
  TRouterContext,
  TRouteContextFn,
  TBeforeLoadFn,
  TLoaderDeps,
  TLoaderFn,
  TChildren,
  TFileRouteTypes
> {
  /**
   * @deprecated `RootRoute` is now an internal implementation detail. Use `createRootRoute()` instead.
   */
  constructor(
    options?: RootRouteOptions<
      TSearchValidator,
      TRouterContext,
      TRouteContextFn,
      TBeforeLoadFn,
      TLoaderDeps,
      TLoaderFn
    >,
  ) {
    super(options)
  }

  match$: MatchRoute<true, RootRouteId> = (opts) =>
    match$({ ...opts, from: this.id } as any) as any
  match: MatchRoute<false, RootRouteId> = (opts) =>
    match({ ...opts, from: this.id } as any) as any

  routeContext$: RouteContextRoute<true, RootRouteId> = (opts) =>
    routeContext$({ ...opts, from: this.id } as unknown as any)
  routeContext: RouteContextRoute<false, RootRouteId> = (opts) =>
    routeContext({ ...opts, from: this.id } as unknown as any)

  search$: SearchRoute<true, RootRouteId> = (opts) =>
    search$({ ...opts, from: this.id } as any) as any
  search: SearchRoute<false, RootRouteId> = (opts) =>
    search({ ...opts, from: this.id } as any) as any

  params$: ParamsRoute<true, RootRouteId> = (opts) =>
    params$({ ...opts, from: this.id } as any) as any
  params: ParamsRoute<false, RootRouteId> = (opts) =>
    params({ ...opts, from: this.id } as any) as any

  loaderDeps$: LoaderDepsRoute<true, RootRouteId> = (opts) =>
    loaderDeps$({ ...opts, from: this.id } as any)
  loaderDeps: LoaderDepsRoute<false, RootRouteId> = (opts) =>
    loaderDeps({ ...opts, from: this.id } as any)

  loaderData$: LoaderDataRoute<true, RootRouteId> = (opts) =>
    loaderData$({ ...opts, from: this.id } as any)
  loaderData: LoaderDataRoute<false, RootRouteId> = (opts) =>
    loaderData({ ...opts, from: this.id } as any)
}

export function createRootRoute<
  TSearchValidator = undefined,
  TRouterContext = {},
  TRouteContextFn = AnyContext,
  TBeforeLoadFn = AnyContext,
  TLoaderDeps extends Record<string, any> = {},
  TLoaderFn = undefined,
>(
  options?: RootRouteOptions<
    TSearchValidator,
    TRouterContext,
    TRouteContextFn,
    TBeforeLoadFn,
    TLoaderDeps,
    TLoaderFn
  >,
): RootRoute<
  TSearchValidator,
  TRouterContext,
  TRouteContextFn,
  TBeforeLoadFn,
  TLoaderDeps,
  TLoaderFn,
  unknown,
  unknown
> {
  return new RootRoute<
    TSearchValidator,
    TRouterContext,
    TRouteContextFn,
    TBeforeLoadFn,
    TLoaderDeps,
    TLoaderFn
  >(options)
}

export class NotFoundRoute<
  TParentRoute extends AnyRootRoute,
  TRouterContext = AnyContext,
  TRouteContextFn = AnyContext,
  TBeforeLoadFn = AnyContext,
  TSearchValidator = undefined,
  TLoaderDeps extends Record<string, any> = {},
  TLoaderFn = undefined,
  TChildren = unknown,
> extends Route<
  TParentRoute,
  '/404',
  '/404',
  '404',
  '404',
  TSearchValidator,
  {},
  TRouterContext,
  TRouteContextFn,
  TBeforeLoadFn,
  TLoaderDeps,
  TLoaderFn,
  TChildren
> {
  constructor(
    options: Omit<
      RouteOptions<
        TParentRoute,
        string,
        string,
        string,
        string,
        TSearchValidator,
        {},
        TLoaderDeps,
        TLoaderFn,
        TRouterContext,
        TRouteContextFn,
        TBeforeLoadFn
      >,
      | 'caseSensitive'
      | 'parseParams'
      | 'stringifyParams'
      | 'path'
      | 'id'
      | 'params'
    >,
  ) {
    super({
      ...(options as any),
      id: '404',
    })
  }
}

function runFnInInjectionContext<TFn extends (...args: Array<any>) => any>(
  fn: TFn,
) {
  const originalFn = fn
  return (...args: Parameters<TFn>) => {
    const { context, location, route } = args[0]
    const routeInjector = context.getRouteInjector(route?.id || location.href)
    return runInInjectionContext(routeInjector, originalFn.bind(null, ...args))
  }
}
