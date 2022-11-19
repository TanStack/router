import { AnyPathParams } from './routeConfig'
import {
  AnyAllRouteInfo,
  DefaultAllRouteInfo,
  RouteInfoByPath,
} from './routeInfo'
import { Location, LocationState } from './router'
import { Expand, NoInfer, PickAsRequired, PickRequired, Updater } from './utils'

export type LinkInfo =
  | {
      type: 'external'
      href: string
    }
  | {
      type: 'internal'
      next: Location
      handleFocus: (e: any) => void
      handleClick: (e: any) => void
      handleEnter: (e: any) => void
      handleLeave: (e: any) => void
      isActive: boolean
      disabled?: boolean
    }

type StartsWith<A, B> = A extends `${B extends string ? B : never}${infer _}`
  ? true
  : false

type CleanPath<T extends string> = T extends `${infer L}//${infer R}`
  ? CleanPath<`${CleanPath<L>}/${CleanPath<R>}`>
  : T extends `${infer L}//`
  ? `${CleanPath<L>}/`
  : T extends `//${infer L}`
  ? `/${CleanPath<L>}`
  : T

export type Split<S, TIncludeTrailingSlash = true> = S extends unknown
  ? string extends S
    ? string[]
    : S extends string
    ? CleanPath<S> extends ''
      ? []
      : TIncludeTrailingSlash extends true
      ? CleanPath<S> extends `${infer T}/`
        ? [...Split<T>, '/']
        : CleanPath<S> extends `/${infer U}`
        ? Split<U>
        : CleanPath<S> extends `${infer T}/${infer U}`
        ? [...Split<T>, ...Split<U>]
        : [S]
      : CleanPath<S> extends `${infer T}/${infer U}`
      ? [...Split<T>, ...Split<U>]
      : S extends string
      ? [S]
      : never
    : never
  : never

export type ParsePathParams<T extends string> = Split<T>[number] extends infer U
  ? U extends `:${infer V}`
    ? V
    : never
  : never

type Join<T> = T extends []
  ? ''
  : T extends [infer L extends string]
  ? L
  : T extends [infer L extends string, ...infer Tail extends [...string[]]]
  ? CleanPath<`${L}/${Join<Tail>}`>
  : never

export type RelativeToPathAutoComplete<
  AllPaths extends string,
  TFrom extends string,
  TTo extends string,
  SplitPaths extends string[] = Split<AllPaths, false>,
> = TTo extends `..${infer _}`
  ? SplitPaths extends [
      ...Split<ResolveRelativePath<TFrom, TTo>, false>,
      ...infer TToRest,
    ]
    ? `${CleanPath<
        Join<
          [
            ...Split<TTo, false>,
            ...(
              | TToRest
              | (Split<
                  ResolveRelativePath<TFrom, TTo>,
                  false
                >['length'] extends 1
                  ? never
                  : ['../'])
            ),
          ]
        >
      >}`
    : never
  : TTo extends `./${infer RestTTo}`
  ? SplitPaths extends [
      ...Split<TFrom, false>,
      ...Split<RestTTo, false>,
      ...infer RestPath,
    ]
    ? `${TTo}${Join<RestPath>}`
    : never
  : './' | '../' | AllPaths

export type NavigateOptionsAbsolute<
  TAllRouteInfo extends AnyAllRouteInfo = DefaultAllRouteInfo,
  TFrom extends ValidFromPath<TAllRouteInfo> = '/',
  TTo extends string = '.',
> = ToOptions<TAllRouteInfo, TFrom, TTo> & {
  // Whether to replace the current history stack instead of pushing a new one
  replace?: boolean
}

export type ToOptions<
  TAllRouteInfo extends AnyAllRouteInfo = DefaultAllRouteInfo,
  TFrom extends ValidFromPath<TAllRouteInfo> = '/',
  TTo extends string = '.',
  TResolvedTo = ResolveRelativePath<TFrom, NoInfer<TTo>>,
> = {
  to?: ToPathOption<TAllRouteInfo, TFrom, TTo>
  // The new has string or a function to update it
  hash?: Updater<string>
  // State to pass to the history stack
  state?: LocationState
  // The source route path. This is automatically set when using route-level APIs, but for type-safe relative routing on the router itself, this is required
  from?: TFrom
  // // When using relative route paths, this option forces resolution from the current path, instead of the route API's path or `from` path
  // fromCurrent?: boolean
} & CheckPath<TAllRouteInfo, NoInfer<TResolvedTo>, {}> &
  SearchParamOptions<TAllRouteInfo, TFrom, TResolvedTo> &
  PathParamOptions<TAllRouteInfo, TFrom, TResolvedTo>

type SearchParamOptions<
  TAllRouteInfo extends AnyAllRouteInfo,
  TFrom,
  TTo,
  TFromSchema = RouteInfoByPath<TAllRouteInfo, TFrom>['fullSearchSchema'],
  TToSchema = RouteInfoByPath<TAllRouteInfo, TTo>['fullSearchSchema'],
> = StartsWith<TFrom, TTo> extends true
  ? // If the next route search extend or cover the from route, params will be optional
    {
      search?: SearchReducer<TFromSchema, TToSchema>
    }
  : // Optional search params? Allow it
  keyof PickRequired<TToSchema> extends never
  ? {
      search?: SearchReducer<TFromSchema, TToSchema>
    }
  : {
      // Must have required search params, enforce it
      search: SearchReducer<TFromSchema, TToSchema>
    }

type SearchReducer<TFrom, TTo> =
  | { [TKey in keyof TTo]: TTo[TKey] }
  | ((current: TFrom) => TTo)

type PathParamOptions<
  TAllRouteInfo extends AnyAllRouteInfo,
  TFrom,
  TTo,
  TFromParams = RouteInfoByPath<TAllRouteInfo, TFrom>['allParams'],
  TToParams = RouteInfoByPath<TAllRouteInfo, TTo>['allParams'],
> =
  // If the next routes params extend or cover the from route, params will be optional
  StartsWith<TFrom, TTo> extends true
    ? {
        params?: ParamsReducer<TFromParams, TToParams>
      }
    : // If the next route doesn't have params, warn if any have been passed
    AnyPathParams extends TToParams
    ? {
        params?: ParamsReducer<TFromParams, Record<string, never>>
      }
    : // If the next route has params, enforce them
      {
        params: ParamsReducer<TFromParams, TToParams>
      }

type ParamsReducer<TFrom, TTo> = TTo | ((current: TFrom) => TTo)

export type ToPathOption<
  TAllRouteInfo extends AnyAllRouteInfo = DefaultAllRouteInfo,
  TFrom extends ValidFromPath<TAllRouteInfo> = '/',
  TTo extends string = '.',
> =
  | TTo
  | RelativeToPathAutoComplete<
      TAllRouteInfo['routePaths'],
      NoInfer<TFrom> extends string ? NoInfer<TFrom> : '',
      NoInfer<TTo> & string
    >

export type ToIdOption<
  TAllRouteInfo extends AnyAllRouteInfo = DefaultAllRouteInfo,
  TFrom extends ValidFromPath<TAllRouteInfo> = '/',
  TTo extends string = '.',
> =
  | TTo
  | RelativeToPathAutoComplete<
      TAllRouteInfo['routeIds'],
      NoInfer<TFrom> extends string ? NoInfer<TFrom> : '',
      NoInfer<TTo> & string
    >

interface ActiveOptions {
  exact?: boolean
  includeHash?: boolean
}

export type LinkOptions<
  TAllRouteInfo extends AnyAllRouteInfo = DefaultAllRouteInfo,
  TFrom extends ValidFromPath<TAllRouteInfo> = '/',
  TTo extends string = '.',
> = NavigateOptionsAbsolute<TAllRouteInfo, TFrom, TTo> & {
  // The standard anchor tag target attribute
  target?: HTMLAnchorElement['target']
  // Defaults to `{ exact: false, includeHash: false }`
  activeOptions?: ActiveOptions
  // If set, will preload the linked route on hover and cache it for this many milliseconds in hopes that the user will eventually navigate there.
  preload?: false | 'intent'
  // When preloaded, the preloaded result will be considered "fresh" for this duration in milliseconds
  preloadMaxAge?: number
  // When preloaded and subsequently inactive, the preloaded result will remain in memory for this duration in milliseconds
  preloadGcMaxAge?: number
  // Delay intent preloading by this many milliseconds. If the intent exits before this delay, the preload will be cancelled.
  preloadDelay?: number
  // If true, will render the link without the href attribute
  disabled?: boolean
}

export type CheckRelativePath<
  TAllRouteInfo extends AnyAllRouteInfo,
  TFrom,
  TTo,
> = TTo extends string
  ? TFrom extends string
    ? ResolveRelativePath<TFrom, TTo> extends TAllRouteInfo['routePaths']
      ? {}
      : {
          Error: `${TFrom} + ${TTo} resolves to ${ResolveRelativePath<
            TFrom,
            TTo
          >}, which is not a valid route path.`
          'Valid Route Paths': TAllRouteInfo['routePaths']
        }
    : {}
  : {}

export type CheckPath<
  TAllRouteInfo extends AnyAllRouteInfo,
  TPath,
  TPass,
> = Exclude<TPath, TAllRouteInfo['routePaths']> extends never
  ? TPass
  : CheckPathError<TAllRouteInfo, Exclude<TPath, TAllRouteInfo['routePaths']>>

export type CheckPathError<
  TAllRouteInfo extends AnyAllRouteInfo,
  TInvalids,
> = Expand<{
  Error: `${TInvalids extends string
    ? TInvalids
    : never} is not a valid route path.`
  'Valid Route Paths': TAllRouteInfo['routePaths']
}>

export type CheckId<
  TAllRouteInfo extends AnyAllRouteInfo,
  TPath,
  TPass,
> = Exclude<TPath, TAllRouteInfo['routeIds']> extends never
  ? TPass
  : CheckIdError<TAllRouteInfo, Exclude<TPath, TAllRouteInfo['routeIds']>>

export type CheckIdError<
  TAllRouteInfo extends AnyAllRouteInfo,
  TInvalids,
> = Expand<{
  Error: `${TInvalids extends string
    ? TInvalids
    : never} is not a valid route ID.`
  'Valid Route IDs': TAllRouteInfo['routeIds']
}>

export type ResolveRelativePath<TFrom, TTo = '.'> = TFrom extends string
  ? TTo extends string
    ? TTo extends '.'
      ? TFrom
      : TTo extends `./`
      ? Join<[TFrom, '/']>
      : TTo extends `./${infer TRest}`
      ? ResolveRelativePath<TFrom, TRest>
      : TTo extends `/${infer TRest}`
      ? TTo
      : Split<TTo> extends ['..', ...infer ToRest]
      ? Split<TFrom> extends [...infer FromRest, infer FromTail]
        ? ToRest extends ['/']
          ? Join<[...FromRest, '/']>
          : ResolveRelativePath<Join<FromRest>, Join<ToRest>>
        : never
      : Split<TTo> extends ['.', ...infer ToRest]
      ? ToRest extends ['/']
        ? Join<[TFrom, '/']>
        : ResolveRelativePath<TFrom, Join<ToRest>>
      : CleanPath<Join<['/', ...Split<TFrom>, ...Split<TTo>]>>
    : never
  : never

export type ValidFromPath<
  TAllRouteInfo extends AnyAllRouteInfo = DefaultAllRouteInfo,
> =
  | undefined
  | (string extends TAllRouteInfo['routePaths']
      ? string
      : TAllRouteInfo['routePaths'])
