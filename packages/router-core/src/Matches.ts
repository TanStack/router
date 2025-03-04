import type { AnyRoute, StaticDataRouteOption } from './route'
import type {
  AllContext,
  AllLoaderData,
  AllParams,
  FullSearchSchema,
  ParseRoute,
  RouteById,
  RouteIds,
} from './routeInfo'
import type { AnyRouter, RegisteredRouter } from './router'
import type { Constrain, ControlledPromise } from './utils'

export type AnyMatchAndValue = { match: any; value: any }

export type FindValueByIndex<
  TKey,
  TValue extends ReadonlyArray<any>,
> = TKey extends `${infer TIndex extends number}` ? TValue[TIndex] : never

export type FindValueByKey<TKey, TValue> =
  TValue extends ReadonlyArray<any>
    ? FindValueByIndex<TKey, TValue>
    : TValue[TKey & keyof TValue]

export type CreateMatchAndValue<TMatch, TValue> = TValue extends any
  ? {
      match: TMatch
      value: TValue
    }
  : never

export type NextMatchAndValue<
  TKey,
  TMatchAndValue extends AnyMatchAndValue,
> = TMatchAndValue extends any
  ? CreateMatchAndValue<
      TMatchAndValue['match'],
      FindValueByKey<TKey, TMatchAndValue['value']>
    >
  : never

export type IsMatchKeyOf<TValue> =
  TValue extends ReadonlyArray<any>
    ? number extends TValue['length']
      ? `${number}`
      : keyof TValue & `${number}`
    : TValue extends object
      ? keyof TValue & string
      : never

export type IsMatchPath<
  TParentPath extends string,
  TMatchAndValue extends AnyMatchAndValue,
> = `${TParentPath}${IsMatchKeyOf<TMatchAndValue['value']>}`

export type IsMatchResult<
  TKey,
  TMatchAndValue extends AnyMatchAndValue,
> = TMatchAndValue extends any
  ? TKey extends keyof TMatchAndValue['value']
    ? TMatchAndValue['match']
    : never
  : never

export type IsMatchParse<
  TPath,
  TMatchAndValue extends AnyMatchAndValue,
  TParentPath extends string = '',
> = TPath extends `${string}.${string}`
  ? TPath extends `${infer TFirst}.${infer TRest}`
    ? IsMatchParse<
        TRest,
        NextMatchAndValue<TFirst, TMatchAndValue>,
        `${TParentPath}${TFirst}.`
      >
    : never
  : {
      path: IsMatchPath<TParentPath, TMatchAndValue>
      result: IsMatchResult<TPath, TMatchAndValue>
    }

export type IsMatch<TMatch, TPath> = IsMatchParse<
  TPath,
  TMatch extends any ? { match: TMatch; value: TMatch } : never
>

/**
 * Narrows matches based on a path
 * @experimental
 */
export const isMatch = <TMatch, TPath extends string>(
  match: TMatch,
  path: Constrain<TPath, IsMatch<TMatch, TPath>['path']>,
): match is IsMatch<TMatch, TPath>['result'] => {
  const parts = (path as string).split('.')
  let part
  let value: any = match

  while ((part = parts.shift()) != null && value != null) {
    value = value[part]
  }

  return value != null
}

export interface DefaultRouteMatchExtensions {
  scripts?: unknown
  links?: unknown
  headScripts?: unknown
  meta?: unknown
}

export interface RouteMatchExtensions extends DefaultRouteMatchExtensions {}

export interface RouteMatch<
  out TRouteId,
  out TFullPath,
  out TAllParams,
  out TFullSearchSchema,
  out TLoaderData,
  out TAllContext,
  out TLoaderDeps,
> extends RouteMatchExtensions {
  id: string
  routeId: TRouteId
  fullPath: TFullPath
  index: number
  pathname: string
  params: TAllParams
  _strictParams: TAllParams
  status: 'pending' | 'success' | 'error' | 'redirected' | 'notFound'
  isFetching: false | 'beforeLoad' | 'loader'
  error: unknown
  paramsError: unknown
  searchError: unknown
  updatedAt: number
  loadPromise?: ControlledPromise<void>
  beforeLoadPromise?: ControlledPromise<void>
  loaderPromise?: ControlledPromise<void>
  loaderData?: TLoaderData
  __routeContext: Record<string, unknown>
  __beforeLoadContext: Record<string, unknown>
  context: TAllContext
  search: TFullSearchSchema
  _strictSearch: TFullSearchSchema
  fetchCount: number
  abortController: AbortController
  cause: 'preload' | 'enter' | 'stay'
  loaderDeps: TLoaderDeps
  preload: boolean
  invalid: boolean
  headers?: Record<string, string>
  globalNotFound?: boolean
  staticData: StaticDataRouteOption
  minPendingPromise?: ControlledPromise<void>
  pendingTimeout?: ReturnType<typeof setTimeout>
}

export type MakeRouteMatchFromRoute<TRoute extends AnyRoute> = RouteMatch<
  TRoute['types']['id'],
  TRoute['types']['fullPath'],
  TRoute['types']['allParams'],
  TRoute['types']['fullSearchSchema'],
  TRoute['types']['loaderData'],
  TRoute['types']['allContext'],
  TRoute['types']['loaderDeps']
>

export type MakeRouteMatch<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TRouteId = RouteIds<TRouteTree>,
  TStrict extends boolean = true,
> = RouteMatch<
  TRouteId,
  RouteById<TRouteTree, TRouteId>['types']['fullPath'],
  TStrict extends false
    ? AllParams<TRouteTree>
    : RouteById<TRouteTree, TRouteId>['types']['allParams'],
  TStrict extends false
    ? FullSearchSchema<TRouteTree>
    : RouteById<TRouteTree, TRouteId>['types']['fullSearchSchema'],
  TStrict extends false
    ? AllLoaderData<TRouteTree>
    : RouteById<TRouteTree, TRouteId>['types']['loaderData'],
  TStrict extends false
    ? AllContext<TRouteTree>
    : RouteById<TRouteTree, TRouteId>['types']['allContext'],
  RouteById<TRouteTree, TRouteId>['types']['loaderDeps']
>

export type AnyRouteMatch = RouteMatch<any, any, any, any, any, any, any>

export type MakeRouteMatchUnion<
  TRouter extends AnyRouter = RegisteredRouter,
  TRoute extends AnyRoute = ParseRoute<TRouter['routeTree']>,
> = TRoute extends any
  ? RouteMatch<
      TRoute['id'],
      TRoute['fullPath'],
      TRoute['types']['allParams'],
      TRoute['types']['fullSearchSchema'],
      TRoute['types']['loaderData'],
      TRoute['types']['allContext'],
      TRoute['types']['loaderDeps']
    >
  : never

export interface MatchRouteOptions {
  pending?: boolean
  caseSensitive?: boolean
  includeSearch?: boolean
  fuzzy?: boolean
}
