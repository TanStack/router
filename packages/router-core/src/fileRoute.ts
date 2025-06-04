import type {
  AnyContext,
  AnyPathParams,
  AnyRoute,
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

export interface LazyRoute {
  options: {
    id: string
  } & LazyRouteOptions
}
