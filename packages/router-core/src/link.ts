import { Trim } from './fileRoute'
import { AnyRoute } from './route'
import {
  AllParams,
  FullSearchSchema,
  RouteByPath,
  RouteIds,
  RoutePaths,
} from './routeInfo'
import { LocationState, ParsedLocation, RegisteredRouter } from './router'
import {
  Expand,
  NoInfer,
  NonNullableUpdater,
  PickRequired,
  UnionToIntersection,
  Updater,
} from './utils'

export type LinkInfo =
  | {
      type: 'external'
      href: string
    }
  | {
      type: 'internal'
      next: ParsedLocation
      handleFocus: (e: any) => void
      handleClick: (e: any) => void
      handleEnter: (e: any) => void
      handleLeave: (e: any) => void
      handleTouchStart: (e: any) => void
      isActive: boolean
      disabled?: boolean
    }

export type CleanPath<T extends string> = T extends `${infer L}//${infer R}`
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

export type ParsePathParams<T extends string> = keyof {
  [K in Trim<Split<T>[number], '_'> as K extends `$${infer L}` ? L : never]: K
}

export type Join<T, Delimiter extends string = '/'> = T extends []
  ? ''
  : T extends [infer L extends string]
  ? L
  : T extends [infer L extends string, ...infer Tail extends [...string[]]]
  ? CleanPath<`${L}${Delimiter}${Join<Tail>}`>
  : never

export type Last<T extends any[]> = T extends [...infer _, infer L] ? L : never

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
  :
      | (TFrom extends `/`
          ? never
          : SplitPaths extends [...Split<TFrom, false>, ...infer RestPath]
          ? Join<RestPath> extends { length: 0 }
            ? never
            : './'
          : never)
      | (TFrom extends `/` ? never : '../')
      | AllPaths

export type NavigateOptions<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RoutePaths<TRouteTree> = '/',
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouteTree> = TFrom,
  TMaskTo extends string = '',
> = ToOptions<TRouteTree, TFrom, TTo, TMaskFrom, TMaskTo> & {
  // `replace` is a boolean that determines whether the navigation should replace the current history entry or push a new one.
  replace?: boolean
  resetScroll?: boolean
}

export type ToOptions<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RoutePaths<TRouteTree> = '/',
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouteTree> = '/',
  TMaskTo extends string = '',
> = ToSubOptions<TRouteTree, TFrom, TTo> & {
  mask?: ToMaskOptions<TRouteTree, TMaskFrom, TMaskTo>
}

export type ToMaskOptions<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TMaskFrom extends RoutePaths<TRouteTree> = '/',
  TMaskTo extends string = '',
> = ToSubOptions<TRouteTree, TMaskFrom, TMaskTo> & {
  unmaskOnReload?: boolean
}

export type ToSubOptions<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RoutePaths<TRouteTree> = '/',
  TTo extends string = '',
  TResolved = ResolveRelativePath<TFrom, NoInfer<TTo>>,
> = {
  to?: ToPathOption<TRouteTree, TFrom, TTo>
  // The new has string or a function to update it
  hash?: true | Updater<string>
  // State to pass to the history stack
  state?: true | NonNullableUpdater<LocationState>
  // The source route path. This is automatically set when using route-level APIs, but for type-safe relative routing on the router itself, this is required
  from?: TFrom
  // // When using relative route paths, this option forces resolution from the current path, instead of the route API's path or `from` path
  // fromCurrent?: boolean
} & CheckPath<TRouteTree, NoInfer<TResolved>, {}> &
  SearchParamOptions<TRouteTree, TFrom, TTo, TResolved> &
  PathParamOptions<TRouteTree, TFrom, TResolved>

export type SearchParamOptions<
  TRouteTree extends AnyRoute,
  TFrom,
  TTo,
  TResolved = ResolveRelativePath<TFrom, NoInfer<TTo>>,
  TFromSearchEnsured = '/' extends TFrom
    ? FullSearchSchema<TRouteTree>
    : Expand<
        UnionToIntersection<
          PickRequired<
            RouteByPath<TRouteTree, TFrom>['types']['fullSearchSchema']
          >
        >
      >,
  TFromSearchOptional = Omit<AllParams<TRouteTree>, keyof TFromSearchEnsured>,
  TFromSearch = Expand<TFromSearchEnsured & TFromSearchOptional>,
  TToSearch = '' extends TTo
    ? FullSearchSchema<TRouteTree>
    : Expand<RouteByPath<TRouteTree, TResolved>['types']['fullSearchSchema']>,
> = keyof PickRequired<TToSearch> extends never
  ? {
      search?: true | SearchReducer<TFromSearch, TToSearch>
    }
  : {
      search: TFromSearchEnsured extends PickRequired<TToSearch>
        ? true | SearchReducer<TFromSearch, TToSearch>
        : SearchReducer<TFromSearch, TToSearch>
    }

type SearchReducer<TFrom, TTo> = TTo | ((current: TFrom) => TTo)

export type PathParamOptions<
  TRouteTree extends AnyRoute,
  TFrom,
  TTo,
  TFromParamsEnsured = Expand<
    UnionToIntersection<
      PickRequired<RouteByPath<TRouteTree, TFrom>['types']['allParams']>
    >
  >,
  TFromParamsOptional = Omit<AllParams<TRouteTree>, keyof TFromParamsEnsured>,
  TFromParams = Expand<TFromParamsOptional & TFromParamsEnsured>,
  TToParams = Expand<RouteByPath<TRouteTree, TTo>['types']['allParams']>,
> = keyof PickRequired<TToParams> extends never
  ? {
      params?: true | ParamsReducer<TFromParams, TToParams>
    }
  : {
      params: TFromParamsEnsured extends PickRequired<TToParams>
        ? true | ParamsReducer<TFromParams, TToParams>
        : ParamsReducer<TFromParams, TToParams>
    }

type ParamsReducer<TFrom, TTo> = TTo | ((current: TFrom) => TTo)

export type ToPathOption<
  TRouteTree extends AnyRoute = AnyRoute,
  TFrom extends RoutePaths<TRouteTree> = '/',
  TTo extends string = '',
> =
  | TTo
  | RelativeToPathAutoComplete<
      RoutePaths<TRouteTree>,
      NoInfer<TFrom> extends string ? NoInfer<TFrom> : '',
      NoInfer<TTo> & string
    >

export type ToIdOption<
  TRouteTree extends AnyRoute = AnyRoute,
  TFrom extends RoutePaths<TRouteTree> = '/',
  TTo extends string = '',
> =
  | TTo
  | RelativeToPathAutoComplete<
      RouteIds<TRouteTree>,
      NoInfer<TFrom> extends string ? NoInfer<TFrom> : '',
      NoInfer<TTo> & string
    >

export interface ActiveOptions {
  exact?: boolean
  includeHash?: boolean
  includeSearch?: boolean
}

export type LinkOptions<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RoutePaths<TRouteTree> = '/',
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouteTree> = TFrom,
  TMaskTo extends string = '',
> = NavigateOptions<TRouteTree, TFrom, TTo, TMaskFrom, TMaskTo> & {
  // The standard anchor tag target attribute
  target?: HTMLAnchorElement['target']
  // Defaults to `{ exact: false, includeHash: false }`
  activeOptions?: ActiveOptions
  // If set, will preload the linked route on hover and cache it for this many milliseconds in hopes that the user will eventually navigate there.
  preload?: false | 'intent'
  // Delay intent preloading by this many milliseconds. If the intent exits before this delay, the preload will be cancelled.
  preloadDelay?: number
  // If true, will render the link without the href attribute
  disabled?: boolean
}

export type CheckRelativePath<
  TRouteTree extends AnyRoute,
  TFrom,
  TTo,
> = TTo extends string
  ? TFrom extends string
    ? ResolveRelativePath<TFrom, TTo> extends RoutePaths<TRouteTree>
      ? {}
      : {
          Error: `${TFrom} + ${TTo} resolves to ${ResolveRelativePath<
            TFrom,
            TTo
          >}, which is not a valid route path.`
          'Valid Route Paths': RoutePaths<TRouteTree>
        }
    : {}
  : {}

export type CheckPath<TRouteTree extends AnyRoute, TPath, TPass> = Exclude<
  TPath,
  RoutePaths<TRouteTree>
> extends never
  ? TPass
  : CheckPathError<TRouteTree, Exclude<TPath, RoutePaths<TRouteTree>>>

export type CheckPathError<TRouteTree extends AnyRoute, TInvalids> = {
  to: RoutePaths<TRouteTree>
}

export type CheckId<TRouteTree extends AnyRoute, TPath, TPass> = Exclude<
  TPath,
  RouteIds<TRouteTree>
> extends never
  ? TPass
  : CheckIdError<TRouteTree, Exclude<TPath, RouteIds<TRouteTree>>>

export type CheckIdError<TRouteTree extends AnyRoute, TInvalids> = {
  Error: `${TInvalids extends string
    ? TInvalids
    : never} is not a valid route ID.`
  'Valid Route IDs': RouteIds<TRouteTree>
}

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
