import type { Register } from './router'
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
  TRegister,
  TFilePath extends string,
  TParentRoute extends AnyRoute,
  TId extends RouteConstraints['TId'],
  TPath extends RouteConstraints['TPath'],
  TFullPath extends RouteConstraints['TFullPath'],
  TSearchValidator = undefined,
  TParams = ResolveParams<TPath>,
  TContextFn = AnyContext,
  TBeforeLoadFn = AnyContext,
  TLoaderDeps extends Record<string, any> = {},
  TLoaderFn = undefined,
  TSSR = unknown,
  TServerMiddlewares = unknown,
  THandlers = undefined,
  TContextWire = unknown,
  TBeforeLoadWire = unknown,
  TLoaderWire = unknown,
>
  extends
    FileBaseRouteOptions<
      TRegister,
      TParentRoute,
      TId,
      TPath,
      TSearchValidator,
      TParams,
      TLoaderDeps,
      TLoaderFn,
      AnyContext,
      TContextFn,
      TBeforeLoadFn,
      AnyContext,
      TSSR,
      TServerMiddlewares,
      THandlers,
      TContextWire,
      TBeforeLoadWire,
      TLoaderWire
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
      TContextFn,
      TBeforeLoadFn
    > {}

export type CreateFileRoute<
  TFilePath extends string,
  TParentRoute extends AnyRoute,
  TId extends RouteConstraints['TId'],
  TPath extends RouteConstraints['TPath'],
  TFullPath extends RouteConstraints['TFullPath'],
> = <
  TRegister = Register,
  TSearchValidator = undefined,
  TParams = ResolveParams<TPath>,
  TContextFn = AnyContext,
  TBeforeLoadFn = AnyContext,
  TLoaderDeps extends Record<string, any> = {},
  TLoaderFn = undefined,
  TSSR = unknown,
  TServerMiddlewares = unknown,
  THandlers = undefined,
  TContextWire = unknown,
  TBeforeLoadWire = unknown,
  TLoaderWire = unknown,
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
    TContextFn,
    TBeforeLoadFn,
    TLoaderDeps,
    TLoaderFn,
    TSSR,
    TServerMiddlewares,
    THandlers,
    TContextWire,
    TBeforeLoadWire,
    TLoaderWire
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
  TContextFn,
  TBeforeLoadFn,
  TLoaderDeps,
  TLoaderFn,
  unknown,
  unknown,
  TSSR,
  TServerMiddlewares,
  THandlers
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
