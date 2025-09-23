import type {
  AnyContext,
  AnyPathParams,
  AnyRoute,
  FileBaseRouteOptions,
  ResolveParams,
  Route,
  RouteConstraints,
  UpdatableRouteOptions,
} from './route'
import type { Register } from './router'
import type { AnyValidator } from './validators'

export interface FileRouteTypes {
  fileRoutesByFullPath: any
  fullPaths: any
  to: any
  fileRoutesByTo: any
  id: any
  fileRoutesById: any
}

export type InferFileRouteTypes<TRouteTree extends AnyRoute> =
  unknown extends TRouteTree['types']['fileRouteTypes']
    ? never
    : TRouteTree['types']['fileRouteTypes'] extends FileRouteTypes
      ? TRouteTree['types']['fileRouteTypes']
      : never

export interface FileRoutesByPath {
  // '/': {
  //   parentRoute: typeof rootRoute
  // }
}

export interface FileRouteOptions<
  TRegister extends Register,
  TFilePath extends string,
  TParentRoute extends AnyRoute,
  TId extends RouteConstraints['TId'],
  TPath extends RouteConstraints['TPath'],
  TFullPath extends RouteConstraints['TFullPath'],
  TSearchValidator = undefined,
  TParams = ResolveParams<TPath>,
  TRouteContextFn = AnyContext,
  TBeforeLoadFn = AnyContext,
  TLoaderDeps extends Record<string, any> = {},
  TLoaderFn = undefined,
  TSSR = unknown,
  TServerMiddlewares = unknown,
  TServerSendContext = undefined,
> extends FileBaseRouteOptions<
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
      TServerMiddlewares,
      TServerSendContext
    >,
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
    > {}

export type CreateFileRoute<
  TFilePath extends string,
  TParentRoute extends AnyRoute,
  TId extends RouteConstraints['TId'],
  TPath extends RouteConstraints['TPath'],
  TFullPath extends RouteConstraints['TFullPath'],
> = <
  TRegister extends Register = Register,
  TSearchValidator = undefined,
  TParams = ResolveParams<TPath>,
  TRouteContextFn = AnyContext,
  TBeforeLoadFn = AnyContext,
  TLoaderDeps extends Record<string, any> = {},
  TLoaderFn = undefined,
  TSSR = unknown,
  TMiddlewares = unknown,
>(
  options?: FileRouteOptions<
    TRegister,
    TFilePath,
    TParentRoute,
    TId,
    TPath,
    TFullPath,
    TSearchValidator,
    TParams,
    TRouteContextFn,
    TBeforeLoadFn,
    TLoaderDeps,
    TLoaderFn,
    TSSR,
    TMiddlewares
  >,
) => Route<
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
  unknown,
  unknown,
  TSSR,
  TMiddlewares
>

export type LazyRouteOptions = Pick<
  UpdatableRouteOptions<
    AnyRoute,
    string,
    string,
    AnyPathParams,
    AnyValidator,
    {},
    AnyContext,
    AnyContext,
    AnyContext,
    AnyContext
  >,
  'component' | 'errorComponent' | 'pendingComponent' | 'notFoundComponent'
>

export interface LazyRoute<in out TRoute extends AnyRoute> {
  options: {
    id: string
  } & LazyRouteOptions
}

export type CreateLazyFileRoute<TRoute extends AnyRoute> = (
  opts: LazyRouteOptions,
) => LazyRoute<TRoute>
