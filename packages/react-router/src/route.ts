import {
  BaseRootRoute,
  BaseRoute,
  BaseRouteApi,
  notFound,
} from '@tanstack/router-core'
import { useLoaderData } from './useLoaderData'
import { useLoaderDeps } from './useLoaderDeps'
import { useParams } from './useParams'
import { useSearch } from './useSearch'
import { useNavigate } from './useNavigate'
import { useMatch } from './useMatch'
import { useRouter } from './useRouter'
import type {
  AnyContext,
  AnyRoute,
  AnyRouter,
  ConstrainLiteral,
  ErrorComponentProps,
  NotFoundError,
  NotFoundRouteProps,
  RegisteredRouter,
  ResolveFullPath,
  ResolveId,
  ResolveParams,
  RootRouteId,
  RootRouteOptions,
  RouteConstraints,
  RouteIds,
  RouteMask,
  RouteOptions,
  RouteTypesById,
  RouterCore,
  ToMaskOptions,
  UseNavigateResult,
} from '@tanstack/router-core'
import type { UseLoaderDataRoute } from './useLoaderData'
import type { UseMatchRoute } from './useMatch'
import type { UseLoaderDepsRoute } from './useLoaderDeps'
import type { UseParamsRoute } from './useParams'
import type { UseSearchRoute } from './useSearch'
import type * as React from 'react'
import type { UseRouteContextRoute } from './useRouteContext'

declare module '@tanstack/router-core' {
  export interface UpdatableRouteOptionsExtensions {
    component?: RouteComponent
    errorComponent?: false | null | ErrorRouteComponent
    notFoundComponent?: NotFoundRouteComponent
    pendingComponent?: RouteComponent
  }

  export interface RouteExtensions<
    TId extends string,
    TFullPath extends string,
  > {
    useMatch: UseMatchRoute<TId>
    useRouteContext: UseRouteContextRoute<TId>
    useSearch: UseSearchRoute<TId>
    useParams: UseParamsRoute<TId>
    useLoaderDeps: UseLoaderDepsRoute<TId>
    useLoaderData: UseLoaderDataRoute<TId>
    useNavigate: () => UseNavigateResult<TFullPath>
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

  useMatch: UseMatchRoute<TId> = (opts) => {
    return useMatch({
      select: opts?.select,
      from: this.id,
      structuralSharing: opts?.structuralSharing,
    } as any) as any
  }

  useRouteContext: UseRouteContextRoute<TId> = (opts) => {
    return useMatch({
      from: this.id as any,
      select: (d) => (opts?.select ? opts.select(d.context) : d.context),
    }) as any
  }

  useSearch: UseSearchRoute<TId> = (opts) => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    return useSearch({
      select: opts?.select,
      structuralSharing: opts?.structuralSharing,
      from: this.id,
    } as any) as any
  }

  useParams: UseParamsRoute<TId> = (opts) => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    return useParams({
      select: opts?.select,
      structuralSharing: opts?.structuralSharing,
      from: this.id,
    } as any) as any
  }

  useLoaderDeps: UseLoaderDepsRoute<TId> = (opts) => {
    return useLoaderDeps({ ...opts, from: this.id, strict: false } as any)
  }

  useLoaderData: UseLoaderDataRoute<TId> = (opts) => {
    return useLoaderData({ ...opts, from: this.id, strict: false } as any)
  }

  useNavigate = (): UseNavigateResult<
    RouteTypesById<TRouter, TId>['fullPath']
  > => {
    const router = useRouter()
    return useNavigate({ from: router.routesById[this.id as string].fullPath })
  }

  notFound = (opts?: NotFoundError) => {
    return notFound({ routeId: this.id as string, ...opts })
  }
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

  useMatch: UseMatchRoute<TId> = (opts) => {
    return useMatch({
      select: opts?.select,
      from: this.id,
      structuralSharing: opts?.structuralSharing,
    } as any) as any
  }

  useRouteContext: UseRouteContextRoute<TId> = (opts?) => {
    return useMatch({
      ...opts,
      from: this.id,
      select: (d) => (opts?.select ? opts.select(d.context) : d.context),
    }) as any
  }

  useSearch: UseSearchRoute<TId> = (opts) => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    return useSearch({
      select: opts?.select,
      structuralSharing: opts?.structuralSharing,
      from: this.id,
    } as any) as any
  }

  useParams: UseParamsRoute<TId> = (opts) => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    return useParams({
      select: opts?.select,
      structuralSharing: opts?.structuralSharing,
      from: this.id,
    } as any) as any
  }

  useLoaderDeps: UseLoaderDepsRoute<TId> = (opts) => {
    return useLoaderDeps({ ...opts, from: this.id } as any)
  }

  useLoaderData: UseLoaderDataRoute<TId> = (opts) => {
    return useLoaderData({ ...opts, from: this.id } as any)
  }

  useNavigate = (): UseNavigateResult<TFullPath> => {
    return useNavigate({ from: this.fullPath })
  }
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
  TChildren
> {
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
    TChildren
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

/**
 * @deprecated Use the `createRootRouteWithContext` function instead.
 */
export const rootRouteWithContext = createRootRouteWithContext

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

  useMatch: UseMatchRoute<RootRouteId> = (opts) => {
    return useMatch({
      select: opts?.select,
      from: this.id,
      structuralSharing: opts?.structuralSharing,
    } as any) as any
  }

  useRouteContext: UseRouteContextRoute<RootRouteId> = (opts) => {
    return useMatch({
      ...opts,
      from: this.id,
      select: (d) => (opts?.select ? opts.select(d.context) : d.context),
    }) as any
  }

  useSearch: UseSearchRoute<RootRouteId> = (opts) => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    return useSearch({
      select: opts?.select,
      structuralSharing: opts?.structuralSharing,
      from: this.id,
    } as any) as any
  }

  useParams: UseParamsRoute<RootRouteId> = (opts) => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    return useParams({
      select: opts?.select,
      structuralSharing: opts?.structuralSharing,
      from: this.id,
    } as any) as any
  }

  useLoaderDeps: UseLoaderDepsRoute<RootRouteId> = (opts) => {
    return useLoaderDeps({ ...opts, from: this.id } as any)
  }

  useLoaderData: UseLoaderDataRoute<RootRouteId> = (opts) => {
    return useLoaderData({ ...opts, from: this.id } as any)
  }

  useNavigate = (): UseNavigateResult<'/'> => {
    return useNavigate({ from: this.fullPath })
  }
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

export function createRouteMask<
  TRouteTree extends AnyRoute,
  TFrom extends string,
  TTo extends string,
>(
  opts: {
    routeTree: TRouteTree
  } & ToMaskOptions<RouterCore<TRouteTree, 'never', boolean>, TFrom, TTo>,
): RouteMask<TRouteTree> {
  return opts as any
}

export type ReactNode = any

export type SyncRouteComponent<TProps> =
  | ((props: TProps) => ReactNode)
  | React.LazyExoticComponent<(props: TProps) => ReactNode>

export type AsyncRouteComponent<TProps> = SyncRouteComponent<TProps> & {
  preload?: () => Promise<void>
}

export type RouteComponent<TProps = any> = AsyncRouteComponent<TProps>

export type ErrorRouteComponent = RouteComponent<ErrorComponentProps>

export type NotFoundRouteComponent = SyncRouteComponent<NotFoundRouteProps>

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
