import warning from 'tiny-warning'
import { createRoute } from './route'
import type {
  AnyContext,
  AnyRoute,
  AnyRouter,
  Constrain,
  ConstrainLiteral,
  FileBaseRouteOptions,
  FileRoutesByPath,
  LazyRouteOptions,
  Register,
  RegisteredRouter,
  ResolveParams,
  Route,
  RouteById,
  RouteConstraints,
  RouteIds,
  RouteLoaderFn,
  UpdatableRouteOptions,
} from '@tanstack/router-core'
import type { VanillaRouteComponent } from './types'

/**
 * Create a file route for vanilla JS
 * This is adapted from React/Preact fileRoute but without hooks
 * Instead, route getters are used (e.g., route.getLoaderData(router))
 *
 * @param path - The file path (e.g., '/posts/$postId')
 * @returns A function that creates a route with the given options
 */
export function createFileRoute<
  TFilePath extends keyof FileRoutesByPath,
  TParentRoute extends AnyRoute = FileRoutesByPath[TFilePath]['parentRoute'],
  TId extends RouteConstraints['TId'] = FileRoutesByPath[TFilePath]['id'],
  TPath extends RouteConstraints['TPath'] = FileRoutesByPath[TFilePath]['path'],
  TFullPath extends
    RouteConstraints['TFullPath'] = FileRoutesByPath[TFilePath]['fullPath'],
>(
  path?: TFilePath,
): FileRoute<TFilePath, TParentRoute, TId, TPath, TFullPath>['createRoute'] {
  if (typeof path === 'object') {
    return new FileRoute<TFilePath, TParentRoute, TId, TPath, TFullPath>(path, {
      silent: true,
    }).createRoute(path) as any
  }
  return new FileRoute<TFilePath, TParentRoute, TId, TPath, TFullPath>(path, {
    silent: true,
  }).createRoute
}

/**
 * FileRoute class for vanilla JS
 * Provides route creation without hooks - use route getters instead
 *
 * @deprecated It's no longer recommended to use the `FileRoute` class directly.
 * Instead, use `createFileRoute('/path/to/file')(options)` to create a file route.
 */
export class FileRoute<
  TFilePath extends keyof FileRoutesByPath,
  TParentRoute extends AnyRoute = FileRoutesByPath[TFilePath]['parentRoute'],
  TId extends RouteConstraints['TId'] = FileRoutesByPath[TFilePath]['id'],
  TPath extends RouteConstraints['TPath'] = FileRoutesByPath[TFilePath]['path'],
  TFullPath extends
    RouteConstraints['TFullPath'] = FileRoutesByPath[TFilePath]['fullPath'],
> {
  silent?: boolean

  constructor(
    public path?: TFilePath,
    _opts?: { silent: boolean },
  ) {
    this.silent = _opts?.silent
  }

  createRoute = <
    TRegister = Register,
    TSearchValidator = undefined,
    TParams = ResolveParams<TPath>,
    TRouteContextFn = AnyContext,
    TBeforeLoadFn = AnyContext,
    TLoaderDeps extends Record<string, any> = {},
    TLoaderFn = undefined,
    TChildren = unknown,
    TSSR = unknown,
    const TMiddlewares = unknown,
    THandlers = undefined,
  >(
    options?: FileBaseRouteOptions<
      TRegister,
      TParentRoute,
      TId,
      TPath,
      TSearchValidator,
      TParams,
      TLoaderDeps,
      TLoaderFn,
      AnyContext,
      TRouteContextFn,
      TBeforeLoadFn,
      AnyContext,
      TSSR,
      TMiddlewares,
      THandlers
    > &
      UpdatableRouteOptions<
        TParentRoute,
        TId,
        TFullPath,
        TParams,
        TSearchValidator,
        TLoaderFn,
        TLoaderDeps,
        AnyContext,
        TRouteContextFn,
        TBeforeLoadFn
      >,
  ): ReturnType<typeof createRoute> => {
    warning(
      this.silent,
      'FileRoute is deprecated and will be removed in the next major version. Use the createFileRoute(path)(options) function instead.',
    )
    const route = createRoute(options as any)
    ;(route as any).isRoot = false
    return route as any
  }
}

/**
 * FileRouteLoader for vanilla JS
 * Note: In vanilla JS, loaders should be defined directly in route options
 * This is provided for compatibility but is deprecated
 *
 * @deprecated It's recommended not to split loaders into separate files.
 * Instead, place the loader function in the main route file, inside the
 * `createFileRoute('/path/to/file')(options)` options.
 */
export function FileRouteLoader<
  TFilePath extends keyof FileRoutesByPath,
  TRoute extends FileRoutesByPath[TFilePath]['preLoaderRoute'],
>(
  _path: TFilePath,
): <TLoaderFn>(
  loaderFn: Constrain<
    TLoaderFn,
    RouteLoaderFn<
      Register,
      TRoute['parentRoute'],
      TRoute['types']['id'],
      TRoute['types']['params'],
      TRoute['types']['loaderDeps'],
      TRoute['types']['routerContext'],
      TRoute['types']['routeContextFn'],
      TRoute['types']['beforeLoadFn']
    >
  >,
) => TLoaderFn {
  warning(
    false,
    `FileRouteLoader is deprecated and will be removed in the next major version. Please place the loader function in the main route file, inside the \`createFileRoute('/path/to/file')(options)\` options`,
  )
  return (loaderFn) => loaderFn as any
}

/**
 * Create a lazy route for vanilla JS
 * Note: Lazy routes in vanilla JS don't use hooks - use route getters instead
 */
export function createLazyRoute<
  TRouter extends AnyRouter = RegisteredRouter,
  TId extends string = string,
  TRoute extends AnyRoute = RouteById<TRouter['routeTree'], TId>,
>(id: ConstrainLiteral<TId, RouteIds<TRouter['routeTree']>>) {
  return (opts: LazyRouteOptions) => {
    return new LazyRoute<TRoute>({
      id: id,
      ...opts,
    })
  }
}

/**
 * Create a lazy file route for vanilla JS
 */
export function createLazyFileRoute<
  TFilePath extends keyof FileRoutesByPath,
  TRoute extends FileRoutesByPath[TFilePath]['preLoaderRoute'],
>(id: TFilePath): (opts: LazyRouteOptions) => LazyRoute<TRoute> {
  if (typeof id === 'object') {
    return new LazyRoute<TRoute>(id) as any
  }

  return (opts: LazyRouteOptions) => new LazyRoute<TRoute>({ id, ...opts })
}

/**
 * LazyRoute class for vanilla JS
 * Note: In vanilla JS, route getters should be used instead of hooks
 */
export class LazyRoute<TRoute extends AnyRoute> {
  options: {
    id: string
  } & LazyRouteOptions

  constructor(
    opts: {
      id: string
    } & LazyRouteOptions,
  ) {
    this.options = opts
  }

  /**
   * Get match data for this lazy route
   * Use route.getMatch(router) instead of this method
   */
  getMatch(router: import('@tanstack/router-core').AnyRouter) {
    const match = router.state.matches.find(
      (m) => m.routeId === this.options.id,
    )
    if (!match) return undefined
    return router.getMatch(match.id)
  }

  /**
   * Get loader data for this lazy route
   * Use route.getLoaderData(router) instead of this method
   */
  getLoaderData(router: import('@tanstack/router-core').AnyRouter) {
    const match = router.state.matches.find(
      (m) => m.routeId === this.options.id,
    )
    if (!match) return undefined
    const matchState = router.getMatch(match.id)
    return matchState?.loaderData
  }

  /**
   * Get params for this lazy route
   * Use route.getParams(router) instead of this method
   */
  getParams(router: import('@tanstack/router-core').AnyRouter) {
    const match = router.state.matches.find(
      (m) => m.routeId === this.options.id,
    )
    if (!match) return {}
    const matchState = router.getMatch(match.id)
    return matchState?._strictParams ?? matchState?.params ?? {}
  }

  /**
   * Get search params for this lazy route
   * Use route.getSearch(router) instead of this method
   */
  getSearch(router: import('@tanstack/router-core').AnyRouter) {
    const match = router.state.matches.find(
      (m) => m.routeId === this.options.id,
    )
    if (!match) return {}
    const matchState = router.getMatch(match.id)
    return matchState?._strictSearch ?? matchState?.search ?? {}
  }

  /**
   * Get route context for this lazy route
   * Use route.getRouteContext(router) instead of this method
   */
  getRouteContext(router: import('@tanstack/router-core').AnyRouter) {
    const match = router.state.matches.find(
      (m) => m.routeId === this.options.id,
    )
    if (!match) return {}
    const matchState = router.getMatch(match.id)
    return matchState?.context ?? {}
  }
}
