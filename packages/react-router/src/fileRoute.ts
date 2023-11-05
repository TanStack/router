import { ParsePathParams } from './link'
import {
  AnyRoute,
  ResolveFullPath,
  ResolveFullSearchSchema,
  MergeFromFromParent,
  RouteMeta,
  AnyContext,
  RouteOptions,
  UpdatableRouteOptions,
  Route,
  AnyPathParams,
  RootRouteId,
  TrimPathLeft,
  RouteConstraints,
} from './route'
import { Assign, AssignAll, Expand, IsAny } from './utils'

export interface FileRoutesByPath {
  // '/': {
  //   parentRoute: typeof rootRoute
  // }
}

type Replace<
  S extends string,
  From extends string,
  To extends string,
> = S extends `${infer Start}${From}${infer Rest}`
  ? `${Start}${To}${Replace<Rest, From, To>}`
  : S

export type TrimLeft<
  T extends string,
  S extends string,
> = T extends `${S}${infer U}` ? U : T

export type TrimRight<
  T extends string,
  S extends string,
> = T extends `${infer U}${S}` ? U : T

export type Trim<T extends string, S extends string> = TrimLeft<
  TrimRight<T, S>,
  S
>

export type RemoveUnderScores<T extends string> = Replace<
  Replace<TrimRight<TrimLeft<T, '/_'>, '_'>, '_/', '/'>,
  '/_',
  '/'
>

export type ResolveFilePath<
  TParentRoute extends AnyRoute,
  TFilePath extends string,
> = TParentRoute['id'] extends RootRouteId
  ? TrimPathLeft<TFilePath>
  : Replace<
      TrimPathLeft<TFilePath>,
      TrimPathLeft<TParentRoute['types']['customId']>,
      ''
    >

export type FileRoutePath<
  TParentRoute extends AnyRoute,
  TFilePath extends string,
> = ResolveFilePath<TParentRoute, TFilePath> extends `_${infer _}`
  ? string
  : ResolveFilePath<TParentRoute, TFilePath>

export class FileRoute<
  TFilePath extends keyof FileRoutesByPath,
  TParentRoute extends AnyRoute = FileRoutesByPath[TFilePath]['parentRoute'],
  TId extends RouteConstraints['TId'] = TFilePath,
  TPath extends RouteConstraints['TPath'] = FileRoutePath<
    TParentRoute,
    TFilePath
  >,
  TFullPath extends RouteConstraints['TFullPath'] = ResolveFullPath<
    TParentRoute,
    RemoveUnderScores<TPath>
  >,
> {
  constructor(public path: TFilePath) {}

  createRoute = <
    TSearchSchema extends RouteConstraints['TSearchSchema'] = {},
    TFullSearchSchema extends RouteConstraints['TFullSearchSchema'] = ResolveFullSearchSchema<
      TParentRoute,
      TSearchSchema
    >,
    TParams extends RouteConstraints['TParams'] = ParsePathParams<TPath> extends never
      ? AnyPathParams
      : Record<ParsePathParams<TPath>, RouteConstraints['TPath']>,
    TAllParams extends RouteConstraints['TAllParams'] = MergeFromFromParent<
      TParentRoute['types']['allParams'],
      TParams
    >,
    TRouteMeta extends RouteConstraints['TRouteMeta'] = RouteMeta,
    TContext extends Expand<
      Assign<IsAny<TParentRoute['types']['allMeta'], {}>, TRouteMeta>
    > = Expand<Assign<IsAny<TParentRoute['types']['allMeta'], {}>, TRouteMeta>>,
    TRouterMeta extends RouteConstraints['TRouterMeta'] = AnyContext,
    TChildren extends RouteConstraints['TChildren'] = unknown,
    TRouteTree extends RouteConstraints['TRouteTree'] = AnyRoute,
  >(
    options: Omit<
      RouteOptions<
        TParentRoute,
        string,
        string,
        TSearchSchema,
        TFullSearchSchema,
        TParams,
        TAllParams,
        TRouteMeta,
        TContext
      >,
      'getParentRoute' | 'path' | 'id'
    > &
      UpdatableRouteOptions<TFullSearchSchema, TAllParams, TContext>,
  ): Route<
    TParentRoute,
    TPath,
    TFullPath,
    TFilePath,
    TId,
    TSearchSchema,
    TFullSearchSchema,
    TParams,
    TAllParams,
    TRouteMeta,
    TContext,
    TRouterMeta,
    TChildren,
    TRouteTree
  > => {
    const route = new Route(options as any)
    ;(route as any).isRoot = false
    return route as any
  }
}
