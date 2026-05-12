import { BaseRootRoute, BaseRoute } from '@tanstack/router-core'
import { useMatch } from './useMatch'
import { useRouteContext } from './useRouteContext'
import { useSearch } from './useSearch'
import { useParams } from './useParams'
import { useLoaderData } from './useLoaderData'
import { useLoaderDeps } from './useLoaderDeps'
import { useNavigate } from './useNavigate'
import type { Handle } from '@remix-run/ui'
import type {
  AnyContext,
  AnyRoute,
  Register,
  ResolveFullPath,
  ResolveId,
  ResolveParams,
  RootRouteOptions,
  RouteConstraints,
  RouteOptions,
  UpdatableRouteOptions,
  UseNavigateResult,
} from '@tanstack/router-core'

/**
 * Subclass of `BaseRoute` that adds Remix-specific instance accessors. Each
 * accessor mirrors its `@tanstack/react-router` equivalent but takes the
 * component `handle` as its first argument.
 *
 * In all binding-specific accessors the route id (or full path for
 * `useNavigate`) is automatically passed as `from`, so callers don't need
 * to repeat it.
 */
export class Route<
  TRegister = unknown,
  TParentRoute extends RouteConstraints['TParentRoute'] = AnyRoute,
  TPath extends RouteConstraints['TPath'] = '/',
  TFullPath extends RouteConstraints['TFullPath'] = ResolveFullPath<TParentRoute, TPath>,
  TCustomId extends RouteConstraints['TCustomId'] = string,
  TId extends RouteConstraints['TId'] = ResolveId<TParentRoute, TCustomId, TPath>,
  TSearchValidator = undefined,
  TParams = ResolveParams<TPath>,
  TRouterContext = AnyContext,
  TRouteContextFn = AnyContext,
  TBeforeLoadFn = AnyContext,
  TLoaderDeps extends Record<string, any> = {},
  TLoaderFn = undefined,
  TChildren = unknown,
  TFileRouteTypes = unknown,
  TSSR = unknown,
  TServerMiddlewares = unknown,
  THandlers = undefined,
> extends BaseRoute<
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
  TServerMiddlewares,
  THandlers
> {
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
      TServerMiddlewares,
      THandlers
    >,
  ) {
    super(options as any)
  }

  useMatch = (handle: Handle<any, any>, opts?: { select?: any }) =>
    useMatch(handle, { from: this.id as any, ...(opts as any) })

  useRouteContext = (handle: Handle<any, any>, opts?: { select?: any }) =>
    useRouteContext(handle, { ...(opts as any), from: this.id as any })

  useSearch = (handle: Handle<any, any>, opts?: { select?: any }) =>
    useSearch(handle, { ...(opts as any), from: this.id as any })

  useParams = (handle: Handle<any, any>, opts?: { select?: any }) =>
    useParams(handle, { ...(opts as any), from: this.id as any })

  useLoaderDeps = (handle: Handle<any, any>, opts?: { select?: any }) =>
    useLoaderDeps(handle, { ...(opts as any), from: this.id as any })

  useLoaderData = (handle: Handle<any, any>, opts?: { select?: any }) =>
    useLoaderData(handle, { ...(opts as any), from: this.id as any })

  useNavigate = (handle: Handle<any, any>): UseNavigateResult<TFullPath> =>
    useNavigate(handle, { from: this.fullPath as any })
}

/**
 * Creates a non-root Route instance for code-based routing.
 *
 * Mirrors `createRoute` from `@tanstack/react-router`.
 */
export function createRoute<
  TRegister = unknown,
  TParentRoute extends RouteConstraints['TParentRoute'] = AnyRoute,
  TPath extends RouteConstraints['TPath'] = '/',
  TFullPath extends RouteConstraints['TFullPath'] = ResolveFullPath<TParentRoute, TPath>,
  TCustomId extends RouteConstraints['TCustomId'] = string,
  TId extends RouteConstraints['TId'] = ResolveId<TParentRoute, TCustomId, TPath>,
  TSearchValidator = undefined,
  TParams = ResolveParams<TPath>,
  TRouteContextFn = AnyContext,
  TBeforeLoadFn = AnyContext,
  TLoaderDeps extends Record<string, any> = {},
  TLoaderFn = undefined,
  TChildren = unknown,
  TSSR = unknown,
  const TServerMiddlewares = unknown,
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
    TServerMiddlewares
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
  TServerMiddlewares
> {
  return new Route(options as any) as any
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
  any,
  any
>

/**
 * Subclass of `BaseRootRoute` with the same Remix-specific instance methods
 * as `Route`.
 */
export class RootRoute<
  TRegister = Register,
  TSearchValidator = undefined,
  TRouterContext = {},
  TRouteContextFn = AnyContext,
  TBeforeLoadFn = AnyContext,
  TLoaderDeps extends Record<string, any> = {},
  TLoaderFn = undefined,
  TChildren = unknown,
  TFileRouteTypes = unknown,
  TSSR = unknown,
  TServerMiddlewares = unknown,
  THandlers = undefined,
> extends BaseRootRoute<
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
  TServerMiddlewares,
  THandlers
> {
  /**
   * @deprecated Use the `createRootRoute` function instead.
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
      TServerMiddlewares
    >,
  ) {
    super(options as any)
  }

  useMatch = (handle: Handle<any, any>, opts?: { select?: any }) =>
    useMatch(handle, { from: this.id as any, ...(opts as any) })

  useRouteContext = (handle: Handle<any, any>, opts?: { select?: any }) =>
    useRouteContext(handle, { ...(opts as any), from: this.id as any })

  useSearch = (handle: Handle<any, any>, opts?: { select?: any }) =>
    useSearch(handle, { ...(opts as any), from: this.id as any })

  useParams = (handle: Handle<any, any>, opts?: { select?: any }) =>
    useParams(handle, { ...(opts as any), from: this.id as any })

  useLoaderDeps = (handle: Handle<any, any>, opts?: { select?: any }) =>
    useLoaderDeps(handle, { ...(opts as any), from: this.id as any })

  useLoaderData = (handle: Handle<any, any>, opts?: { select?: any }) =>
    useLoaderData(handle, { ...(opts as any), from: this.id as any })

  useNavigate = (handle: Handle<any, any>): UseNavigateResult<'/'> =>
    useNavigate(handle, { from: '/' as any })
}

/**
 * Create a root route. Mirrors `createRootRoute` from `@tanstack/react-router`.
 */
export function createRootRoute<
  TRegister = Register,
  TSearchValidator = undefined,
  TRouterContext = {},
  TRouteContextFn = AnyContext,
  TBeforeLoadFn = AnyContext,
  TLoaderDeps extends Record<string, any> = {},
  TLoaderFn = undefined,
  TSSR = unknown,
  const TServerMiddlewares = unknown,
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
    TServerMiddlewares,
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
  TServerMiddlewares,
  THandlers
> {
  return new RootRoute(options as any) as any
}

/**
 * Variant of `createRootRoute` that takes a router-context type up front.
 * Useful when downstream loaders/`beforeLoad` need to reference a typed
 * context provided to `createRouter`.
 */
export function createRootRouteWithContext<TRouterContext extends {}>() {
  return <
    TRegister = Register,
    TSearchValidator = undefined,
    TRouteContextFn = AnyContext,
    TBeforeLoadFn = AnyContext,
    TLoaderDeps extends Record<string, any> = {},
    TLoaderFn = undefined,
    TSSR = unknown,
    const TServerMiddlewares = unknown,
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
      TServerMiddlewares,
      THandlers
    >,
  ) =>
    createRootRoute<
      TRegister,
      TSearchValidator,
      TRouterContext,
      TRouteContextFn,
      TBeforeLoadFn,
      TLoaderDeps,
      TLoaderFn,
      TSSR,
      TServerMiddlewares,
      THandlers
    >(options)
}

/**
 * Lightweight not-found route — equivalent of `<NotFoundRoute>` from
 * `@tanstack/react-router`. Pass to `notFoundRoute` on the root route.
 *
 * @deprecated Prefer per-route `notFoundComponent` / `defaultNotFoundComponent`.
 */
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
  TServerMiddlewares = unknown,
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
  unknown,
  TSSR,
  TServerMiddlewares
> {
  constructor(
    options: Omit<
      RouteOptions<
        TRegister,
        TParentRoute,
        '404',
        '404',
        '/404',
        '/404',
        TSearchValidator,
        {},
        TLoaderDeps,
        TLoaderFn,
        TRouterContext,
        TRouteContextFn,
        TBeforeLoadFn,
        TSSR,
        TServerMiddlewares
      >,
      'caseSensitive' | 'parseParams' | 'stringifyParams' | 'path' | 'id'
    > &
      UpdatableRouteOptions<
        TParentRoute,
        '404',
        '/404',
        {},
        TSearchValidator,
        TLoaderFn,
        TLoaderDeps,
        TRouterContext,
        TRouteContextFn,
        TBeforeLoadFn
      >,
  ) {
    super({ id: '404' as any, ...(options as any) })
  }
}
