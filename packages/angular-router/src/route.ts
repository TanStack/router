import {
  BaseRootRoute,
  BaseRoute,
  BaseRouteApi,
  notFound,
} from '@tanstack/router-core'
import { injectLoaderData } from './injectLoaderData'
import { injectLoaderDeps } from './injectLoaderDeps'
import { injectParams } from './injectParams'
import { injectSearch } from './injectSearch'
import { injectNavigate } from './injectNavigate'
import { injectMatch } from './injectMatch'
import { injectRouter } from './injectRouter'
import type {
  AnyContext,
  AnyRoute,
  AnyRouter,
  ConstrainLiteral,
  NotFoundError,
  Register,
  RegisteredRouter,
  ResolveFullPath,
  ResolveId,
  ResolveParams,
  RootRoute as RootRouteCore,
  RootRouteId,
  RootRouteOptions,
  RouteConstraints,
  Route as RouteCore,
  RouteIds,
  RouteMask,
  RouteOptions,
  RouteTypesById,
  RouterCore,
  ToMaskOptions,
  UseNavigateResult,
} from '@tanstack/router-core'
import type { InjectLoaderDataRoute } from './injectLoaderData'
import type { InjectMatchRoute } from './injectMatch'
import type { InjectLoaderDepsRoute } from './injectLoaderDeps'
import type { InjectParamsRoute } from './injectParams'
import type { InjectSearchRoute } from './injectSearch'
import type { InjectRouteContextRoute } from './injectRouteContext'
import type { Type } from '@angular/core'

declare module '@tanstack/router-core' {
  export interface UpdatableRouteOptionsExtensions {
    component?: RouteComponent
    errorComponent?: false | null | undefined | ErrorRouteComponent
    notFoundComponent?: NotFoundRouteComponent
    pendingComponent?: RouteComponent
  }

  export interface RootRouteOptionsExtensions {
    shellComponent?: Type<{
      children: any
    }>
  }

  export interface RouteExtensions<
    in out TId extends string,
    in out TFullPath extends string,
  > {
    injectMatch: InjectMatchRoute<TId>
    injectRouteContext: InjectRouteContextRoute<TId>
    injectSearch: InjectSearchRoute<TId>
    injectParams: InjectParamsRoute<TId>
    injectLoaderDeps: InjectLoaderDepsRoute<TId>
    injectLoaderData: InjectLoaderDataRoute<TId>
    injectNavigate: () => UseNavigateResult<TFullPath>
  }
}

export function getRouteApi<
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

  injectMatch: InjectMatchRoute<TId> = (opts) => {
    return injectMatch({
      select: opts?.select,
      from: this.id,
    } as any) as any
  }

  injectRouteContext: InjectRouteContextRoute<TId> = (opts) => {
    return injectMatch({
      from: this.id as any,
      select: (d) => (opts?.select ? opts.select(d.context) : d.context),
    }) as any
  }

  injectSearch: InjectSearchRoute<TId> = (opts) => {
    return injectSearch({
      select: opts?.select,
      from: this.id,
    } as any) as any
  }

  injectParams: InjectParamsRoute<TId> = (opts) => {
    return injectParams({
      select: opts?.select,
      from: this.id,
    } as any) as any
  }

  injectLoaderDeps: InjectLoaderDepsRoute<TId> = (opts) => {
    return injectLoaderDeps({ ...opts, from: this.id, strict: false } as any)
  }

  injectLoaderData: InjectLoaderDataRoute<TId> = (opts) => {
    return injectLoaderData({ ...opts, from: this.id, strict: false } as any)
  }

  injectNavigate = (): UseNavigateResult<
    RouteTypesById<TRouter, TId>['fullPath']
  > => {
    const router = injectRouter()
    return injectNavigate({
      from: router.routesById[this.id as string].fullPath,
    })
  }

  notFound = (opts?: NotFoundError) => {
    return notFound({ routeId: this.id as string, ...opts })
  }
}

export class Route<
    in out TRegister = unknown,
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
    in out TSSR = unknown,
    in out TMiddlewares = unknown,
    in out THandlers = undefined,
  >
  extends BaseRoute<
    TRegister,
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
    TFileRouteTypes,
    TSSR,
    TMiddlewares,
    THandlers
  >
  implements
    RouteCore<
      TRegister,
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
      TFileRouteTypes,
      TSSR,
      TMiddlewares,
      THandlers
    >
{
  /**
   * @deprecated Use the `createRoute` function instead.
   */
  constructor(
    options?: RouteOptions<
      TRegister,
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
      TBeforeLoadFn,
      TSSR,
      TMiddlewares,
      THandlers
    >,
  ) {
    super(options)
  }

  injectMatch: InjectMatchRoute<TId> = (opts?: any) => {
    return injectMatch({
      select: opts?.select,
      from: this.id,
    } as any) as any
  }

  injectRouteContext: InjectRouteContextRoute<TId> = (opts?: any) => {
    return injectMatch({
      ...opts,
      from: this.id,
      select: (d) => (opts?.select ? opts.select(d.context) : d.context),
    }) as any
  }

  injectSearch: InjectSearchRoute<TId> = (opts) => {
    return injectSearch({
      select: opts?.select,
      from: this.id,
    } as any) as any
  }

  injectParams: InjectParamsRoute<TId> = (opts) => {
    return injectParams({
      select: opts?.select,
      from: this.id,
    } as any) as any
  }

  injectLoaderDeps: InjectLoaderDepsRoute<TId> = (opts) => {
    return injectLoaderDeps({ ...opts, from: this.id } as any)
  }

  injectLoaderData: InjectLoaderDataRoute<TId> = (opts) => {
    return injectLoaderData({ ...opts, from: this.id } as any)
  }

  injectNavigate = (): UseNavigateResult<TFullPath> => {
    return injectNavigate({ from: this.fullPath })
  }
}

export function createRoute<
  TRegister = unknown,
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
  TSSR = unknown,
  THandlers = undefined,
>(
  options: RouteOptions<
    TRegister,
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
    TBeforeLoadFn,
    TSSR,
    THandlers
  >,
): Route<
  TRegister,
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
  unknown,
  TSSR,
  THandlers
> {
  return new Route<
    TRegister,
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
    unknown,
    TSSR,
    THandlers
  >(options)
}

export type AnyRootRoute = RootRoute<
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any
>

export function createRootRouteWithContext<TRouterContext extends {}>() {
  return <
    TRegister = Register,
    TRouteContextFn = AnyContext,
    TBeforeLoadFn = AnyContext,
    TSearchValidator = undefined,
    TLoaderDeps extends Record<string, any> = {},
    TLoaderFn = undefined,
    TSSR = unknown,
    THandlers = undefined,
  >(
    options?: RootRouteOptions<
      TRegister,
      TSearchValidator,
      TRouterContext,
      TRouteContextFn,
      TBeforeLoadFn,
      TLoaderDeps,
      TLoaderFn,
      TSSR,
      THandlers
    >,
  ) => {
    return createRootRoute<
      TRegister,
      TSearchValidator,
      TRouterContext,
      TRouteContextFn,
      TBeforeLoadFn,
      TLoaderDeps,
      TLoaderFn,
      TSSR,
      THandlers
    >(options as any)
  }
}

export class RootRoute<
    in out TRegister = Register,
    in out TSearchValidator = undefined,
    in out TRouterContext = {},
    in out TRouteContextFn = AnyContext,
    in out TBeforeLoadFn = AnyContext,
    in out TLoaderDeps extends Record<string, any> = {},
    in out TLoaderFn = undefined,
    in out TChildren = unknown,
    in out TFileRouteTypes = unknown,
    in out TSSR = unknown,
    in out THandlers = undefined,
  >
  extends BaseRootRoute<
    TRegister,
    TSearchValidator,
    TRouterContext,
    TRouteContextFn,
    TBeforeLoadFn,
    TLoaderDeps,
    TLoaderFn,
    TChildren,
    TFileRouteTypes,
    TSSR,
    THandlers
  >
  implements
    RootRouteCore<
      TRegister,
      TSearchValidator,
      TRouterContext,
      TRouteContextFn,
      TBeforeLoadFn,
      TLoaderDeps,
      TLoaderFn,
      TChildren,
      TFileRouteTypes,
      TSSR,
      THandlers
    >
{
  /**
   * @deprecated `RootRoute` is now an internal implementation detail. Use `createRootRoute()` instead.
   */
  constructor(
    options?: RootRouteOptions<
      TRegister,
      TSearchValidator,
      TRouterContext,
      TRouteContextFn,
      TBeforeLoadFn,
      TLoaderDeps,
      TLoaderFn,
      TSSR,
      THandlers
    >,
  ) {
    super(options)
  }

  injectMatch: InjectMatchRoute<RootRouteId> = (opts?: any) => {
    return injectMatch({
      select: opts?.select,
      from: this.id,
    } as any) as any
  }

  injectRouteContext: InjectRouteContextRoute<RootRouteId> = (opts) => {
    return injectMatch({
      ...opts,
      from: this.id,
      select: (d) => (opts?.select ? opts.select(d.context) : d.context),
    }) as any
  }

  injectSearch: InjectSearchRoute<RootRouteId> = (opts) => {
    return injectSearch({
      select: opts?.select,
      from: this.id,
    } as any) as any
  }

  injectParams: InjectParamsRoute<RootRouteId> = (opts) => {
    return injectParams({
      select: opts?.select,
      from: this.id,
    } as any) as any
  }

  injectLoaderDeps: InjectLoaderDepsRoute<RootRouteId> = (opts) => {
    return injectLoaderDeps({ ...opts, from: this.id } as any)
  }

  injectLoaderData: InjectLoaderDataRoute<RootRouteId> = (opts) => {
    return injectLoaderData({ ...opts, from: this.id } as any)
  }

  injectNavigate = (): UseNavigateResult<'/'> => {
    return injectNavigate({ from: this.fullPath })
  }
}

export function createRouteMask<
  TRouteTree extends AnyRoute,
  TFrom extends string,
  TTo extends string,
>(
  opts: {
    routeTree: TRouteTree
  } & ToMaskOptions<RouterCore<TRouteTree, 'never', false>, TFrom, TTo>,
): RouteMask<TRouteTree> {
  return opts as any
}

// Use a function becasue class definitions are not hoisted

export type RouteComponent<TComponent = unknown> = () => Type<TComponent>
export type ErrorRouteComponent = () => Type<unknown>
export type NotFoundRouteComponent = () => Type<unknown>

export class NotFoundRoute<
  TRegister,
  TParentRoute extends AnyRootRoute,
  TRouterContext = AnyContext,
  TRouteContextFn = AnyContext,
  TBeforeLoadFn = AnyContext,
  TSearchValidator = undefined,
  TLoaderDeps extends Record<string, any> = {},
  TLoaderFn = undefined,
  TChildren = unknown,
  TSSR = unknown,
  THandlers = undefined,
> extends Route<
  TRegister,
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
  TChildren,
  TSSR,
  THandlers
> {
  constructor(
    options: Omit<
      RouteOptions<
        TRegister,
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
        TBeforeLoadFn,
        TSSR,
        THandlers
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

export function createRootRoute<
  TRegister = Register,
  TSearchValidator = undefined,
  TRouterContext = {},
  TRouteContextFn = AnyContext,
  TBeforeLoadFn = AnyContext,
  TLoaderDeps extends Record<string, any> = {},
  TLoaderFn = undefined,
  TSSR = unknown,
  THandlers = undefined,
>(
  options?: RootRouteOptions<
    TRegister,
    TSearchValidator,
    TRouterContext,
    TRouteContextFn,
    TBeforeLoadFn,
    TLoaderDeps,
    TLoaderFn,
    TSSR,
    THandlers
  >,
): RootRoute<
  TRegister,
  TSearchValidator,
  TRouterContext,
  TRouteContextFn,
  TBeforeLoadFn,
  TLoaderDeps,
  TLoaderFn,
  unknown,
  unknown,
  TSSR,
  THandlers
> {
  return new RootRoute<
    TRegister,
    TSearchValidator,
    TRouterContext,
    TRouteContextFn,
    TBeforeLoadFn,
    TLoaderDeps,
    TLoaderFn,
    unknown,
    unknown,
    TSSR,
    THandlers
  >(options)
}
