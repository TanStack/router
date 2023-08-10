import { Last, ParsePathParams, Split } from './link'
import {
  AnyRoute,
  ResolveFullPath,
  ResolveId,
  AnySearchSchema,
  ResolveFullSearchSchema,
  MergeParamsFromParent,
  RouteContext,
  AnyContext,
  RouteOptions,
  InferFullSearchSchema,
  UpdatableRouteOptions,
  Route,
} from './route'
import { DefaultRoutesInfo } from './routeInfo'

export interface FileRoutesByPath {
  // '/': {
  //   parentRoute: typeof rootRoute
  // }
}

type Test = Last<Split<'/test/:id'>>

export class FileRoute<
  TFilePath extends keyof FileRoutesByPath,
  TParentRoute extends AnyRoute = FileRoutesByPath[TFilePath]['parentRoute'],
  TPath extends string = Last<Split<TFilePath>>,
  TCustomId extends string = TPath extends `_${infer T}` ? T : string,
> {
  constructor(public path: TFilePath) {}

  createRoute = <
    TFullPath extends ResolveFullPath<TParentRoute, TPath> = ResolveFullPath<
      TParentRoute,
      TPath
    >,
    TId extends ResolveId<TParentRoute, TCustomId, TPath> = ResolveId<
      TParentRoute,
      TCustomId,
      TPath
    >,
    TLoader = unknown,
    TSearchSchema extends AnySearchSchema = {},
    TFullSearchSchema extends AnySearchSchema = ResolveFullSearchSchema<
      TParentRoute,
      TSearchSchema
    >,
    TParams extends Record<ParsePathParams<TPath>, any> = Record<
      ParsePathParams<TPath>,
      string
    >,
    TAllParams extends MergeParamsFromParent<
      TParentRoute['__types']['allParams'],
      TParams
    > = MergeParamsFromParent<TParentRoute['__types']['allParams'], TParams>,
    TParentContext extends TParentRoute['__types']['routeContext'] = TParentRoute['__types']['routeContext'],
    TAllParentContext extends TParentRoute['__types']['context'] = TParentRoute['__types']['context'],
    TRouteContext extends RouteContext = RouteContext,
    TContext extends MergeParamsFromParent<
      TParentRoute['__types']['context'],
      TRouteContext
    > = MergeParamsFromParent<
      TParentRoute['__types']['context'],
      TRouteContext
    >,
    TRouterContext extends AnyContext = AnyContext,
    TChildren extends unknown = unknown,
    TRoutesInfo extends DefaultRoutesInfo = DefaultRoutesInfo,
  >(
    options: Omit<
      RouteOptions<
        TParentRoute,
        TCustomId,
        TPath,
        TLoader,
        InferFullSearchSchema<TParentRoute>,
        TSearchSchema,
        TFullSearchSchema,
        TParentRoute['__types']['allParams'],
        TParams,
        TAllParams,
        TParentContext,
        TAllParentContext,
        TRouteContext,
        TContext
      >,
      'getParentRoute' | 'path' | 'id'
    > &
      UpdatableRouteOptions<
        TLoader,
        TSearchSchema,
        TFullSearchSchema,
        TAllParams,
        TRouteContext,
        TContext
      >,
  ): Route<
    TParentRoute,
    TPath,
    TFullPath,
    TCustomId,
    TId,
    TLoader,
    TSearchSchema,
    TFullSearchSchema,
    TParams,
    TAllParams,
    TParentContext,
    TAllParentContext,
    TRouteContext,
    TContext,
    TRouterContext,
    TChildren,
    TRoutesInfo
  > => {
    return new Route(options as any)
  }
}
