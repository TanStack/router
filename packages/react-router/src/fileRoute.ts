import warning from 'tiny-warning'
import { createRoute } from './route'
import { useMatch } from './useMatch'
import { useLoaderDeps } from './useLoaderDeps'
import { useLoaderData } from './useLoaderData'
import { useSearch } from './useSearch'
import { useParams } from './useParams'
import { useNavigate } from './useNavigate'
import type { StructuralSharingOption } from './structuralSharing'
import type { Constrain } from './utils'
import type {
  AnyContext,
  AnyPathParams,
  AnyRoute,
  AnySearchValidator,
  FileBaseRouteOptions,
  ResolveParams,
  RootRoute,
  Route,
  RouteConstraints,
  RouteLoaderFn,
  UpdatableRouteOptions,
} from './route'
import type { MakeRouteMatch } from './Matches'
import type { AnyRouter, RegisteredRouter } from './router'
import type { RouteById, RouteIds } from './routeInfo'

export interface FileRoutesByPath {
  // '/': {
  //   parentRoute: typeof rootRoute
  // }
}

export interface FileRouteTypes {
  fileRoutesByFullPath: any
  fullPaths: any
  to: any
  fileRoutesByTo: any
  id: any
  fileRoutesById: any
}

export type InferFileRouteTypes<TRouteTree extends AnyRoute> =
  TRouteTree extends RootRoute<
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    infer TFileRouteTypes extends FileRouteTypes
  >
    ? TFileRouteTypes
    : never

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
): <TLoaderFn>(
  loaderFn: Constrain<
    TLoaderFn,
    RouteLoaderFn<
      TRoute['parentRoute'],
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

export type LazyRouteOptions = Pick<
  UpdatableRouteOptions<
    AnyRoute,
    string,
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
    TRouter extends AnyRouter = RegisteredRouter,
    TSelected = unknown,
    TRouteMatch = MakeRouteMatch<TRouter['routeTree'], TRoute['types']['id']>,
    TReturn = unknown extends TSelected ? TRouteMatch : TSelected,
  >(
    opts?: {
      select?: (match: TRouteMatch) => TSelected
    } & StructuralSharingOption<TRouter, TSelected>,
  ): TReturn => {
    return useMatch({
      select: opts?.select as any,
      from: this.options.id,
      structuralSharing: opts?.structuralSharing,
    })
  }

  useRouteContext = <
    TRouter extends AnyRouter = RegisteredRouter,
    TSelected = unknown,
    TRouteContext = TRoute['types']['allContext'],
    TReturn = unknown extends TSelected ? TRouteContext : TSelected,
  >(
    opts?: {
      select?: (s: TRouteContext) => TSelected
    } & StructuralSharingOption<TRouter, TSelected>,
  ): TReturn => {
    return useMatch({
      from: this.options.id,
      select: (d: any) => (opts?.select ? opts.select(d.context) : d.context),
      structuralSharing: opts?.structuralSharing,
    })
  }

  useSearch = <
    TRouter extends AnyRouter = RegisteredRouter,
    TSelected = unknown,
    TSearch = TRoute['types']['fullSearchSchema'],
    TReturn = unknown extends TSelected ? TSearch : TSelected,
  >(
    opts?: {
      select?: (s: TRoute['types']['fullSearchSchema']) => TSelected
    } & StructuralSharingOption<TRouter, TSelected>,
  ): TReturn => {
    return useSearch({
      select: opts?.select as any,
      structuralSharing: opts?.structuralSharing,
      from: this.options.id,
    })
  }

  useParams = <
    TRouter extends AnyRouter = RegisteredRouter,
    TSelected = unknown,
    TAllParams = TRoute['types']['allParams'],
    TReturn = unknown extends TSelected ? TAllParams : TSelected,
  >(
    opts?: {
      select?: (s: TRoute['types']['allParams']) => TSelected
    } & StructuralSharingOption<TRouter, TSelected>,
  ): TReturn => {
    return useParams({
      select: opts?.select as any,
      structuralSharing: opts?.structuralSharing,
      from: this.options.id,
    })
  }

  useLoaderDeps = <
    TRouter extends AnyRouter = RegisteredRouter,
    TSelected = unknown,
    TLoaderDeps = TRoute['types']['loaderDeps'],
    TReturn = unknown extends TSelected ? TLoaderDeps : TSelected,
  >(
    opts?: {
      select?: (s: TLoaderDeps) => TSelected
      structuralSharing?: boolean
    } & StructuralSharingOption<TRouter, TSelected>,
  ): TReturn => {
    return useLoaderDeps({ ...opts, from: this.options.id } as any)
  }

  useLoaderData = <
    TRouter extends AnyRouter = RegisteredRouter,
    TSelected = unknown,
    TLoaderData = TRoute['types']['loaderData'],
    TReturn = unknown extends TSelected ? TLoaderData : TSelected,
  >(
    opts?: {
      select?: (s: TRoute['types']['loaderData']) => TSelected
      structuralSharing?: boolean
    } & StructuralSharingOption<TRouter, TSelected>,
  ): TReturn => {
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
