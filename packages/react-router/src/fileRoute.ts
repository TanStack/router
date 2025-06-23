import warning from 'tiny-warning'
import { createRoute } from './route'

import { useMatch } from './useMatch'
import { useLoaderDeps } from './useLoaderDeps'
import { useLoaderData } from './useLoaderData'
import { useSearch } from './useSearch'
import { useParams } from './useParams'
import { useNavigate } from './useNavigate'
import { useRouter } from './useRouter'
import type { UseParamsRoute } from './useParams'
import type { UseMatchRoute } from './useMatch'
import type { UseSearchRoute } from './useSearch'
import type {
  AnyContext,
  AnyRoute,
  AnyRouter,
  Constrain,
  ConstrainLiteral,
  FileBaseRouteOptions,
  FileRoutesByPath,
  LazyRouteOptions,
  RegisteredRouter,
  ResolveParams,
  Route,
  RouteById,
  RouteConstraints,
  RouteIds,
  RouteLoaderFn,
  UpdatableRouteOptions,
  UseNavigateResult,
} from '@tanstack/router-core'
import type { UseLoaderDepsRoute } from './useLoaderDeps'
import type { UseLoaderDataRoute } from './useLoaderData'
import type { UseRouteContextRoute } from './useRouteContext'

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
  @deprecated It's no longer recommended to use the `FileRoute` class directly.
  Instead, use `createFileRoute('/path/to/file')(options)` to create a file route.
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
    TSearchValidator = undefined,
    TParams = ResolveParams<TPath>,
    TRouteContextFn = AnyContext,
    TBeforeLoadFn = AnyContext,
    TLoaderDeps extends Record<string, any> = {},
    TLoaderFn = undefined,
    TChildren = unknown,
  >(
    options?: FileBaseRouteOptions<
      TParentRoute,
      TId,
      TPath,
      TSearchValidator,
      TParams,
      TLoaderDeps,
      TLoaderFn,
      AnyContext,
      TRouteContextFn,
      TBeforeLoadFn
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
    unknown
  > => {
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
  @deprecated It's recommended not to split loaders into separate files.
  Instead, place the loader function in the the main route file, inside the
  `createFileRoute('/path/to/file)(options)` options.
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
    `FileRouteLoader is deprecated and will be removed in the next major version. Please place the loader function in the the main route file, inside the \`createFileRoute('/path/to/file')(options)\` options`,
  )
  return (loaderFn) => loaderFn as any
}

declare module '@tanstack/router-core' {
  export interface LazyRoute<in out TRoute extends AnyRoute> {
    useMatch: UseMatchRoute<TRoute['id']>
    useRouteContext: UseRouteContextRoute<TRoute['id']>
    useSearch: UseSearchRoute<TRoute['id']>
    useParams: UseParamsRoute<TRoute['id']>
    useLoaderDeps: UseLoaderDepsRoute<TRoute['id']>
    useLoaderData: UseLoaderDataRoute<TRoute['id']>
    useNavigate: () => UseNavigateResult<TRoute['fullPath']>
  }
}

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
    ;(this as any).$$typeof = Symbol.for('react.memo')
  }

  useMatch: UseMatchRoute<TRoute['id']> = (opts) => {
    return useMatch({
      select: opts?.select,
      from: this.options.id,
      structuralSharing: opts?.structuralSharing,
    } as any) as any
  }

  useRouteContext: UseRouteContextRoute<TRoute['id']> = (opts) => {
    return useMatch({
      from: this.options.id,
      select: (d: any) => (opts?.select ? opts.select(d.context) : d.context),
    }) as any
  }

  useSearch: UseSearchRoute<TRoute['id']> = (opts) => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    return useSearch({
      select: opts?.select,
      structuralSharing: opts?.structuralSharing,
      from: this.options.id,
    } as any) as any
  }

  useParams: UseParamsRoute<TRoute['id']> = (opts) => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    return useParams({
      select: opts?.select,
      structuralSharing: opts?.structuralSharing,
      from: this.options.id,
    } as any) as any
  }

  useLoaderDeps: UseLoaderDepsRoute<TRoute['id']> = (opts) => {
    return useLoaderDeps({ ...opts, from: this.options.id } as any)
  }

  useLoaderData: UseLoaderDataRoute<TRoute['id']> = (opts) => {
    return useLoaderData({ ...opts, from: this.options.id } as any)
  }

  useNavigate = (): UseNavigateResult<TRoute['fullPath']> => {
    const router = useRouter()
    return useNavigate({ from: router.routesById[this.options.id].fullPath })
  }
}

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

export function createLazyFileRoute<
  TFilePath extends keyof FileRoutesByPath,
  TRoute extends FileRoutesByPath[TFilePath]['preLoaderRoute'],
>(id: TFilePath): (opts: LazyRouteOptions) => LazyRoute<TRoute> {
  if (typeof id === 'object') {
    return new LazyRoute<TRoute>(id) as any
  }

  return (opts: LazyRouteOptions) => new LazyRoute<TRoute>({ id, ...opts })
}
