import type { AnyRoute, RootRoute } from './route'

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
    ? unknown extends TFileRouteTypes
      ? never
      : TFileRouteTypes
    : never

export interface FileRoutesByPath {
  // '/': {
  //   parentRoute: typeof rootRoute
  // }
}
