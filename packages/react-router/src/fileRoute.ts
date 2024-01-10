import { NoInfer } from '@tanstack/react-store'
import { ParsePathParams } from './link'
import {
  AnyRoute,
  ResolveFullPath,
  ResolveFullSearchSchema,
  MergeFromFromParent,
  RouteContext,
  AnyContext,
  RouteOptions,
  UpdatableRouteOptions,
  Route,
  RootRouteId,
  TrimPathLeft,
  RouteConstraints,
  ResolveFullSearchSchemaInput,
  SearchSchemaInput,
  LoaderFnContext,
  RouteLoaderFn,
} from './route'
import { Assign, Expand, IsAny } from './utils'

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

type ReplaceFirstOccurrence<
  T extends string,
  Search extends string,
  Replacement extends string,
> = T extends `${infer Prefix}${Search}${infer Suffix}`
  ? `${Prefix}${Replacement}${Suffix}`
  : T

export type ResolveFilePath<
  TParentRoute extends AnyRoute,
  TFilePath extends string,
> = TParentRoute['id'] extends RootRouteId
  ? TrimPathLeft<TFilePath>
  : ReplaceFirstOccurrence<
      TrimPathLeft<TFilePath>,
      TrimPathLeft<TParentRoute['types']['customId']>,
      ''
    >

export type FileRoutePath<
  TParentRoute extends AnyRoute,
  TFilePath extends string,
> = ResolveFilePath<TParentRoute, TFilePath> extends `_${infer _}`
  ? string
  : ResolveFilePath<TParentRoute, TFilePath> extends `/_${infer _}`
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
    TSearchSchemaInput extends RouteConstraints['TSearchSchema'] = {},
    TSearchSchema extends RouteConstraints['TSearchSchema'] = {},
    TSearchSchemaUsed extends Record<
      string,
      any
    > = TSearchSchemaInput extends SearchSchemaInput
      ? Omit<TSearchSchemaInput, keyof SearchSchemaInput>
      : TSearchSchema,
    TFullSearchSchemaInput extends
      RouteConstraints['TFullSearchSchema'] = ResolveFullSearchSchemaInput<
      TParentRoute,
      TSearchSchemaUsed
    >,
    TFullSearchSchema extends
      RouteConstraints['TFullSearchSchema'] = ResolveFullSearchSchema<
      TParentRoute,
      TSearchSchema
    >,
    TParams extends RouteConstraints['TParams'] = Expand<
      Record<ParsePathParams<TPath>, string>
    >,
    TAllParams extends RouteConstraints['TAllParams'] = MergeFromFromParent<
      TParentRoute['types']['allParams'],
      TParams
    >,
    TRouteContextReturn extends
      RouteConstraints['TRouteContext'] = RouteContext,
    TRouteContext extends RouteConstraints['TRouteContext'] = [
      TRouteContextReturn,
    ] extends [never]
      ? RouteContext
      : TRouteContextReturn,
    TAllContext extends Expand<
      Assign<IsAny<TParentRoute['types']['allContext'], {}>, TRouteContext>
    > = Expand<
      Assign<IsAny<TParentRoute['types']['allContext'], {}>, TRouteContext>
    >,
    TRouterContext extends RouteConstraints['TRouterContext'] = AnyContext,
    TLoaderDeps extends Record<string, any> = {},
    TLoaderData extends any = unknown,
    TChildren extends RouteConstraints['TChildren'] = unknown,
    TRouteTree extends RouteConstraints['TRouteTree'] = AnyRoute,
  >(
    options?: Omit<
      RouteOptions<
        TParentRoute,
        string,
        TPath,
        TSearchSchemaInput,
        TSearchSchema,
        TSearchSchemaUsed,
        TFullSearchSchemaInput,
        TFullSearchSchema,
        TParams,
        TAllParams,
        TRouteContextReturn,
        TRouteContext,
        TRouterContext,
        TAllContext,
        TLoaderDeps,
        TLoaderData
      >,
      'getParentRoute' | 'path' | 'id'
    > &
      UpdatableRouteOptions<TFullSearchSchema>,
  ): Route<
    TParentRoute,
    TPath,
    TFullPath,
    TFilePath,
    TId,
    TSearchSchemaInput,
    TSearchSchema,
    TSearchSchemaUsed,
    TFullSearchSchemaInput,
    TFullSearchSchema,
    TParams,
    TAllParams,
    TRouteContextReturn,
    TRouteContext,
    TAllContext,
    TRouterContext,
    TLoaderDeps,
    TLoaderData,
    TChildren,
    TRouteTree
  > => {
    const route = new Route(options as any)
    ;(route as any).isRoot = false
    return route as any
  }
}

export function FileRouteLoader<
  TFilePath extends keyof FileRoutesByPath,
  TRoute extends FileRoutesByPath[TFilePath]['preLoaderRoute'],
>(
  _path: TFilePath,
): <TLoaderData extends any>(
  loaderFn: RouteLoaderFn<
    TRoute['types']['allParams'],
    TRoute['types']['loaderDeps'],
    TRoute['types']['allContext'],
    TRoute['types']['routeContext'],
    TLoaderData
  >,
) => RouteLoaderFn<
  TRoute['types']['allParams'],
  TRoute['types']['loaderDeps'],
  TRoute['types']['allContext'],
  TRoute['types']['routeContext'],
  NoInfer<TLoaderData>
> {
  return (loaderFn) => loaderFn
}
