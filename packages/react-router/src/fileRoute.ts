import warning from 'tiny-warning'
import { createRoute } from './route'
import { useMatch } from './useMatch'
import { useLoaderDeps } from './useLoaderDeps'
import { useLoaderData } from './useLoaderData'
import { useSearch } from './useSearch'
import { useParams } from './useParams'
import { useNavigate } from './useNavigate'
import type { NoInfer } from '@tanstack/react-store'
import type { ParsePathParams } from './link'
import type {
  AnyContext,
  AnyPathParams,
  AnyRoute,
  AnySearchValidator,
  DefaultSearchValidator,
  FileBaseRouteOptions,
  ResolveAllParamsFromParent,
  ResolveLoaderData,
  ResolveParams,
  ResolveRouteContext,
  Route,
  RouteConstraints,
  RouteContext,
  RouteContextFn,
  RouteLoaderFn,
  UpdatableRouteOptions,
} from './route'
import type { MakeRouteMatch } from './Matches'
import type { RegisteredRouter } from './router'
import type { RouteById, RouteIds } from './routeInfo'

export interface FileRoutesByPath {
  // '/': {
  //   parentRoute: typeof rootRoute
  // }
}

export function createFileRoute<
  TFilePath extends keyof FileRoutesByPath,
  TParentRoute extends AnyRoute = FileRoutesByPath[TFilePath]['parentRoute'],
  TId extends RouteConstraints['TId'] = FileRoutesByPath[TFilePath]['id'],
  TPath extends RouteConstraints['TPath'] = FileRoutesByPath[TFilePath]['path'],
  TFullPath extends
    RouteConstraints['TFullPath'] = FileRoutesByPath[TFilePath]['fullPath'],
>(
  path: TFilePath,
): FileRoute<TFilePath, TParentRoute, TId, TPath, TFullPath>['createRoute'] {
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
    public path: TFilePath,
    _opts?: { silent: boolean },
  ) {
    this.silent = _opts?.silent
  }

  createRoute = <
    TSearchValidator extends AnySearchValidator = DefaultSearchValidator,
    TParams = ResolveParams<TPath>,
    TAllParams = ResolveAllParamsFromParent<TParentRoute, TParams>,
    TRouteContextFn = AnyContext,
    TBeforeLoadFn = AnyContext,
    TLoaderDeps extends Record<string, any> = {},
    TLoaderDataReturn = {},
    TLoaderData = ResolveLoaderData<TLoaderDataReturn>,
    TChildren = unknown,
  >(
    options?: FileBaseRouteOptions<
      TParentRoute,
      TPath,
      TSearchValidator,
      TParams,
      TLoaderDeps,
      TLoaderDataReturn,
      AnyContext,
      TRouteContextFn,
      TBeforeLoadFn
    > &
      UpdatableRouteOptions<
        TParentRoute,
        TId,
        TAllParams,
        TSearchValidator,
        TLoaderData,
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
    TAllParams,
    AnyContext,
    TRouteContextFn,
    TBeforeLoadFn,
    TLoaderDeps,
    TLoaderDataReturn,
    TLoaderData,
    TChildren
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
): <TLoaderData>(
  loaderFn: RouteLoaderFn<
    TRoute['parentRoute'],
    TRoute['types']['params'],
    TRoute['types']['loaderDeps'],
    TRoute['types']['routerContext'],
    TRoute['types']['routeContextFn'],
    TRoute['types']['beforeLoadFn'],
    TLoaderData
  >,
) => RouteLoaderFn<
  TRoute['parentRoute'],
  TRoute['types']['params'],
  TRoute['types']['loaderDeps'],
  TRoute['types']['routerContext'],
  TRoute['types']['routeContextFn'],
  TRoute['types']['beforeLoadFn'],
  NoInfer<TLoaderData>
> {
  warning(
    false,
    `FileRouteLoader is deprecated and will be removed in the next major version. Please place the loader function in the the main route file, inside the \`createFileRoute('/path/to/file')(options)\` options`,
  )
  return (loaderFn) => loaderFn
}

export type LazyRouteOptions = Pick<
  UpdatableRouteOptions<
    AnyRoute,
    string,
    AnyPathParams,
    AnySearchValidator,
    {},
    AnyContext,
    AnyContext,
    AnyContext,
    AnyContext
  >,
  'component' | 'errorComponent' | 'pendingComponent' | 'notFoundComponent'
>

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

  useMatch = <
    TRouteMatch = MakeRouteMatch<
      RegisteredRouter['routeTree'],
      TRoute['types']['id']
    >,
    TSelected = TRouteMatch,
  >(opts?: {
    select?: (match: TRouteMatch) => TSelected
  }): TSelected => {
    return useMatch({ select: opts?.select, from: this.options.id })
  }

  useRouteContext = <TSelected = TRoute['types']['allContext']>(opts?: {
    select?: (s: TRoute['types']['allContext']) => TSelected
  }): TSelected => {
    return useMatch({
      from: this.options.id,
      select: (d: any) => (opts?.select ? opts.select(d.context) : d.context),
    })
  }

  useSearch = <TSelected = TRoute['types']['fullSearchSchema']>(opts?: {
    select?: (s: TRoute['types']['fullSearchSchema']) => TSelected
  }): TSelected => {
    return useSearch({ ...opts, from: this.options.id })
  }

  useParams = <TSelected = TRoute['types']['allParams']>(opts?: {
    select?: (s: TRoute['types']['allParams']) => TSelected
  }): TSelected => {
    return useParams({ ...opts, from: this.options.id })
  }

  useLoaderDeps = <TSelected = TRoute['types']['loaderDeps']>(opts?: {
    select?: (s: TRoute['types']['loaderDeps']) => TSelected
  }): TSelected => {
    return useLoaderDeps({ ...opts, from: this.options.id } as any)
  }

  useLoaderData = <TSelected = TRoute['types']['loaderData']>(opts?: {
    select?: (s: TRoute['types']['loaderData']) => TSelected
  }): TSelected => {
    return useLoaderData({ ...opts, from: this.options.id } as any)
  }

  useNavigate = () => {
    return useNavigate({ from: this.options.id })
  }
}

export function createLazyRoute<
  TId extends RouteIds<RegisteredRouter['routeTree']>,
  TRoute extends AnyRoute = RouteById<RegisteredRouter['routeTree'], TId>,
>(id: TId) {
  return (opts: LazyRouteOptions) => {
    return new LazyRoute<TRoute>({ id: id as any, ...opts })
  }
}

export function createLazyFileRoute<
  TFilePath extends keyof FileRoutesByPath,
  TRoute extends FileRoutesByPath[TFilePath]['preLoaderRoute'],
>(id: TFilePath) {
  return (opts: LazyRouteOptions) => new LazyRoute<TRoute>({ id, ...opts })
}
