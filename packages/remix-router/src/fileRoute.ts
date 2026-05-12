import { createRoute } from './route'
import { useMatch } from './useMatch'
import { useLoaderData } from './useLoaderData'
import { useLoaderDeps } from './useLoaderDeps'
import { useSearch } from './useSearch'
import { useParams } from './useParams'
import { useRouteContext } from './useRouteContext'
import { useNavigate } from './useNavigate'
import { useRouter } from './useRouter'
import type { Handle } from '@remix-run/ui'
import type {
  AnyContext,
  AnyRoute,
  AnyRouter,
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
  UpdatableRouteOptions,
  UseNavigateResult,
} from '@tanstack/router-core'

/**
 * Creates a file-based Route factory for a given path. Mirrors
 * `createFileRoute` from `@tanstack/react-router`. The returned function
 * accepts standard route options.
 */
export function createFileRoute<
  TFilePath extends keyof FileRoutesByPath,
  TParentRoute extends AnyRoute = FileRoutesByPath[TFilePath]['parentRoute'],
  TId extends RouteConstraints['TId'] = FileRoutesByPath[TFilePath]['id'],
  TPath extends RouteConstraints['TPath'] = FileRoutesByPath[TFilePath]['path'],
  TFullPath extends RouteConstraints['TFullPath'] = FileRoutesByPath[TFilePath]['fullPath'],
>(
  path?: TFilePath,
): FileRoute<TFilePath, TParentRoute, TId, TPath, TFullPath>['createRoute'] {
  return new FileRoute<TFilePath, TParentRoute, TId, TPath, TFullPath>(path, {
    silent: true,
  }).createRoute
}

/** @deprecated Prefer `createFileRoute('/path')(options)`. */
export class FileRoute<
  TFilePath extends keyof FileRoutesByPath,
  TParentRoute extends AnyRoute = FileRoutesByPath[TFilePath]['parentRoute'],
  TId extends RouteConstraints['TId'] = FileRoutesByPath[TFilePath]['id'],
  TPath extends RouteConstraints['TPath'] = FileRoutesByPath[TFilePath]['path'],
  TFullPath extends RouteConstraints['TFullPath'] = FileRoutesByPath[TFilePath]['fullPath'],
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
  ): Route<
    TRegister,
    TParentRoute,
    TPath,
    TFullPath,
    TFilePath,
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
    TMiddlewares,
    THandlers
  > => {
    if (process.env.NODE_ENV !== 'production') {
      if (!this.silent) {
        console.warn(
          'Warning: FileRoute is deprecated. Use createFileRoute(path)(options).',
        )
      }
    }
    const route = createRoute(options as any)
    ;(route as any).isRoot = false
    return route as any
  }
}

/**
 * Per-route accessor object returned from `createLazyRoute` /
 * `createLazyFileRoute`. Each method takes the component `handle` as the
 * first argument because `remix/ui` has no fiber stack.
 */
export class LazyRoute<TRoute extends AnyRoute> {
  options: { id: string } & LazyRouteOptions

  constructor(opts: { id: string } & LazyRouteOptions) {
    this.options = opts
  }

  useMatch = (handle: Handle<any, any>, opts?: { select?: any }) =>
    useMatch(handle, { from: this.options.id as any, ...(opts as any) })

  useRouteContext = (handle: Handle<any, any>, opts?: { select?: any }) =>
    useRouteContext(handle, { ...(opts as any), from: this.options.id as any })

  useSearch = (handle: Handle<any, any>, opts?: { select?: any }) =>
    useSearch(handle, { ...(opts as any), from: this.options.id as any })

  useParams = (handle: Handle<any, any>, opts?: { select?: any }) =>
    useParams(handle, { ...(opts as any), from: this.options.id as any })

  useLoaderDeps = (handle: Handle<any, any>, opts?: { select?: any }) =>
    useLoaderDeps(handle, { ...(opts as any), from: this.options.id as any })

  useLoaderData = (handle: Handle<any, any>, opts?: { select?: any }) =>
    useLoaderData(handle, { ...(opts as any), from: this.options.id as any })

  useNavigate = (
    handle: Handle<any, any>,
  ): UseNavigateResult<TRoute['fullPath']> => {
    const router = useRouter(handle)
    return useNavigate(handle, {
      from: router.routesById[this.options.id]?.fullPath,
    })
  }
}

/**
 * Lazy code-based route stub.
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/createLazyRouteFunction
 */
export function createLazyRoute<
  TRouter extends AnyRouter = RegisteredRouter,
  TId extends string = string,
  TRoute extends AnyRoute = RouteById<TRouter['routeTree'], TId>,
>(id: ConstrainLiteral<TId, RouteIds<TRouter['routeTree']>>) {
  return (opts: LazyRouteOptions) =>
    new LazyRoute<TRoute>({ id: id as string, ...opts })
}

/**
 * Lazy file-based route stub.
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/createLazyFileRouteFunction
 */
export function createLazyFileRoute<
  TFilePath extends keyof FileRoutesByPath,
  TRoute extends FileRoutesByPath[TFilePath]['preLoaderRoute'],
>(id: TFilePath): (opts: LazyRouteOptions) => LazyRoute<TRoute> {
  return (opts: LazyRouteOptions) =>
    new LazyRoute<TRoute>({ id: id as string, ...opts })
}
