import {
  BaseRootRoute,
  BaseRoute,
  notFound,
} from '@tanstack/router-core'
import type {
  AnyContext,
  AnyRoute,
  AnyRouter,
  NotFoundError,
  Register,
  ResolveFullPath,
  ResolveId,
  ResolveParams,
  RootRouteOptions,
  RouteConstraints,
  RouteOptions,
} from '@tanstack/router-core'

// Router context for route getters - deprecated, router should be passed as parameter
declare global {
  var __tanstackRouter: import('@tanstack/router-core').AnyRouter | undefined
}

declare module '@tanstack/router-core' {
  export interface UpdatableRouteOptionsExtensions {
    component?: VanillaRouteComponent
    errorComponent?: false | null | undefined | VanillaErrorRouteComponent
    notFoundComponent?: VanillaNotFoundRouteComponent
    pendingComponent?: VanillaRouteComponent
  }

  export interface RootRouteOptionsExtensions {
    shellComponent?: VanillaRouteComponent
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
    in out TServerMiddlewares = unknown,
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
    TServerMiddlewares,
    THandlers
  > {
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
    super(options)
  }

  notFound = (opts?: NotFoundError) => {
    return notFound({ routeId: this.id as string, ...opts })
  }

  /**
   * Get the loader data for this route
   * @param router - The router instance (required)
   */
  getLoaderData = (router: import('@tanstack/router-core').AnyRouter): TLoaderFn extends undefined ? undefined : any => {
    const match = router.state.matches.find((m) => m.routeId === this.id)
    if (!match) return undefined as any
    const matchState = router.getMatch(match.id)
    return matchState?.loaderData as any
  }

  /**
   * Get the params for this route
   * @param router - The router instance (required)
   */
  getParams = (router: import('@tanstack/router-core').AnyRouter): TParams => {
    const match = router.state.matches.find((m) => m.routeId === this.id)
    if (!match) return {} as TParams
    const matchState = router.getMatch(match.id)
    return (matchState?._strictParams ?? matchState?.params ?? {}) as TParams
  }

  /**
   * Get the search params for this route
   * @param router - The router instance (required)
   */
  getSearch = (router: import('@tanstack/router-core').AnyRouter): TSearchValidator extends undefined ? Record<string, unknown> : any => {
    const match = router.state.matches.find((m) => m.routeId === this.id)
    if (!match) return {} as any
    const matchState = router.getMatch(match.id)
    return (matchState?._strictSearch ?? matchState?.search ?? {}) as any
  }

  /**
   * Get the route context for this route
   * @param router - The router instance (required)
   */
  getRouteContext = (router: import('@tanstack/router-core').AnyRouter): TRouteContextFn extends AnyContext ? AnyContext : TRouteContextFn => {
    const match = router.state.matches.find((m) => m.routeId === this.id)
    if (!match) return {} as any
    const matchState = router.getMatch(match.id)
    return matchState?.context as any
  }

  /**
   * Get the loader dependencies for this route
   * @param router - The router instance (required)
   */
  getLoaderDeps = (router: import('@tanstack/router-core').AnyRouter): TLoaderDeps => {
    const match = router.state.matches.find((m) => m.routeId === this.id)
    if (!match) return {} as TLoaderDeps
    const matchState = router.getMatch(match.id)
    return matchState?.loaderDeps ?? ({} as TLoaderDeps)
  }

  /**
   * Get the full match data for this route
   * @param router - The router instance (required)
   */
  getMatch = (router: import('@tanstack/router-core').AnyRouter) => {
    const match = router.state.matches.find((m) => m.routeId === this.id)
    if (!match) return undefined
    return router.getMatch(match.id)
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
  TSSR,
  TServerMiddlewares
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
    TSSR,
    TServerMiddlewares
  >(options as any)
}

export class RootRoute<
    in out TRegister = unknown,
    in out TSearchValidator = undefined,
    in out TRouterContext = {},
    in out TRouteContextFn = AnyContext,
    in out TBeforeLoadFn = AnyContext,
    in out TLoaderDeps extends Record<string, any> = {},
    in out TLoaderFn = undefined,
    in out TChildren = unknown,
    in out TFileRouteTypes = unknown,
    in out TSSR = unknown,
    in out TServerMiddlewares = unknown,
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
    TServerMiddlewares,
    THandlers
  > {
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
      TServerMiddlewares,
      THandlers
    >,
  ) {
    super(options)
  }

  /**
   * Get the loader data for this route
   * @param router - The router instance (required)
   */
  getLoaderData = (router: import('@tanstack/router-core').AnyRouter): TLoaderFn extends undefined ? undefined : any => {
    const match = router.state.matches.find((m) => m.routeId === this.id)
    if (!match) return undefined as any
    const matchState = router.getMatch(match.id)
    return matchState?.loaderData as any
  }

  /**
   * Get the params for this route
   * @param router - The router instance (required)
   */
  getParams = (router: import('@tanstack/router-core').AnyRouter): Record<string, never> => {
    const match = router.state.matches.find((m) => m.routeId === this.id)
    if (!match) return {} as Record<string, never>
    const matchState = router.getMatch(match.id)
    return (matchState?._strictParams ?? matchState?.params ?? {}) as Record<string, never>
  }

  /**
   * Get the search params for this route
   * @param router - The router instance (required)
   */
  getSearch = (router: import('@tanstack/router-core').AnyRouter): TSearchValidator extends undefined ? Record<string, unknown> : any => {
    const match = router.state.matches.find((m) => m.routeId === this.id)
    if (!match) return {} as any
    const matchState = router.getMatch(match.id)
    return (matchState?._strictSearch ?? matchState?.search ?? {}) as any
  }

  /**
   * Get the route context for this route
   * @param router - The router instance (required)
   */
  getRouteContext = (router: import('@tanstack/router-core').AnyRouter): TRouteContextFn extends AnyContext ? AnyContext : TRouteContextFn => {
    const match = router.state.matches.find((m) => m.routeId === this.id)
    if (!match) return {} as any
    const matchState = router.getMatch(match.id)
    return matchState?.context as any
  }

  /**
   * Get the loader dependencies for this route
   * @param router - The router instance (required)
   */
  getLoaderDeps = (router: import('@tanstack/router-core').AnyRouter): TLoaderDeps => {
    const match = router.state.matches.find((m) => m.routeId === this.id)
    if (!match) return {} as TLoaderDeps
    const matchState = router.getMatch(match.id)
    return matchState?.loaderDeps ?? ({} as TLoaderDeps)
  }

  /**
   * Get the full match data for this route
   * @param router - The router instance (required)
   */
  getMatch = (router: import('@tanstack/router-core').AnyRouter) => {
    const match = router.state.matches.find((m) => m.routeId === this.id)
    if (!match) return undefined
    return router.getMatch(match.id)
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
    TServerMiddlewares,
    THandlers
  >(options as any)
}

