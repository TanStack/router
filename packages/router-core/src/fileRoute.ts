import { T } from 'vitest/dist/types-198fd1d9'
import { CleanPath, Last, ParsePathParams, Split } from './link'
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
  AnyPathParams,
  RootRouteId,
  TrimPathLeft,
} from './route'
import { DefaultRoutesInfo } from './routeInfo'

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

export type ResolveFilePath<
  TParentRoute extends AnyRoute,
  TFilePath extends string,
> = TParentRoute['id'] extends RootRouteId
  ? TrimPathLeft<TFilePath>
  : Replace<
      TrimPathLeft<TFilePath>,
      TrimPathLeft<TParentRoute['__types']['customId']>,
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
  TId extends string = TFilePath,
  TPath extends string = FileRoutePath<TParentRoute, TFilePath>,
  TFullPath extends string = ResolveFullPath<TParentRoute, TPath>,
> {
  constructor(public path: TFilePath) {}

  createRoute = <
    TLoader = unknown,
    TSearchSchema extends AnySearchSchema = {},
    TFullSearchSchema extends AnySearchSchema = ResolveFullSearchSchema<
      TParentRoute,
      TSearchSchema
    >,
    TParams extends ParsePathParams<TPath> extends never
      ? AnyPathParams
      : Record<
          ParsePathParams<TPath>,
          any
        > = ParsePathParams<TPath> extends never
      ? AnyPathParams
      : Record<ParsePathParams<TPath>, string>,
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
        string,
        string,
        TLoader,
        InferFullSearchSchema<TParentRoute>,
        TSearchSchema,
        TFullSearchSchema,
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
    TFilePath,
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
    const route = new Route(options as any)
    ;(route as any).isRoot = false
    return route as any
  }
}
