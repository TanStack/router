import { AnyRoutesInfo, DefaultRoutesInfo, RouteByPath } from './routeInfo'
import { ParsedLocation, LocationState, RegisteredRoutesInfo } from './router'
import {
  Expand,
  NoInfer,
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
  ? U extends `$${infer V}`
    ? V
    : never
  : never

type Join<T, Delimiter extends string = '/'> = T extends []
  ? ''
  : T extends [infer L extends string]
  ? L
  : T extends [infer L extends string, ...infer Tail extends [...string[]]]
  ? CleanPath<`${L}${Delimiter}${Join<Tail>}`>
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
  TRoutesInfo extends AnyRoutesInfo = RegisteredRoutesInfo,
  TFrom extends TRoutesInfo['routePaths'] = '/',
  TTo extends string = '',
> = ToOptions<TRoutesInfo, TFrom, TTo> & {
  // `replace` is a boolean that determines whether the navigation should replace the current history entry or push a new one.
  replace?: boolean
}

export type ToOptions<
  TRoutesInfo extends AnyRoutesInfo = RegisteredRoutesInfo,
  TFrom extends TRoutesInfo['routePaths'] = '/',
  TTo extends string = '',
  TResolvedTo = ResolveRelativePath<TFrom, NoInfer<TTo>>,
> = {
  to?: ToPathOption<TRoutesInfo, TFrom, TTo>
  // The new has string or a function to update it
  hash?: Updater<string>
  // State to pass to the history stack
  state?: LocationState
  // The source route path. This is automatically set when using route-level APIs, but for type-safe relative routing on the router itself, this is required
  from?: TFrom
  // // When using relative route paths, this option forces resolution from the current path, instead of the route API's path or `from` path
  // fromCurrent?: boolean
} & CheckPath<TRoutesInfo, NoInfer<TResolvedTo>, {}> &
  SearchParamOptions<TRoutesInfo, TFrom, TResolvedTo> &
  PathParamOptions<TRoutesInfo, TFrom, TResolvedTo>

export type SearchParamOptions<
  TRoutesInfo extends AnyRoutesInfo,
  TFrom,
  TTo,
  TFromSchema = UnionToIntersection<
    TRoutesInfo['fullSearchSchema'] &
      RouteByPath<TRoutesInfo, TFrom> extends never
      ? {}
      : RouteByPath<TRoutesInfo, TFrom>['__types']['fullSearchSchema']
  >,
  // Find the schema for the new path, and make optional any keys
  // that are already defined in the current schema
  TToSchema = Partial<
    RouteByPath<TRoutesInfo, TFrom>['__types']['fullSearchSchema']
  > &
    Omit<
      RouteByPath<TRoutesInfo, TTo>['__types']['fullSearchSchema'],
      keyof PickRequired<
        RouteByPath<TRoutesInfo, TFrom>['__types']['fullSearchSchema']
      >
    >,
  TFromFullSchema = UnionToIntersection<
    TRoutesInfo['fullSearchSchema'] & TFromSchema
  >,
  TToFullSchema = UnionToIntersection<
    TRoutesInfo['fullSearchSchema'] & TToSchema
  >,
> = keyof PickRequired<TToSchema> extends never
  ? {
      search?: true | SearchReducer<TFromFullSchema, TToFullSchema>
    }
  : {
      search: SearchReducer<TFromFullSchema, TToFullSchema>
    }

type SearchReducer<TFrom, TTo> =
  | { [TKey in keyof TTo]: TTo[TKey] }
  | ((current: TFrom) => TTo)

export type PathParamOptions<
  TRoutesInfo extends AnyRoutesInfo,
  TFrom,
  TTo,
  TFromSchema = UnionToIntersection<
    RouteByPath<TRoutesInfo, TFrom> extends never
      ? {}
      : RouteByPath<TRoutesInfo, TFrom>['__types']['allParams']
  >,
  // Find the schema for the new path, and make optional any keys
  // that are already defined in the current schema
  TToSchema = Partial<RouteByPath<TRoutesInfo, TFrom>['__types']['allParams']> &
    Omit<
      RouteByPath<TRoutesInfo, TTo>['__types']['allParams'],
      keyof PickRequired<
        RouteByPath<TRoutesInfo, TFrom>['__types']['allParams']
      >
    >,
  TFromFullParams = UnionToIntersection<TRoutesInfo['allParams'] & TFromSchema>,
  TToFullParams = UnionToIntersection<TRoutesInfo['allParams'] & TToSchema>,
> = keyof PickRequired<TToSchema> extends never
  ? {
      params?: ParamsReducer<TFromFullParams, TToFullParams>
    }
  : {
      params: ParamsReducer<TFromFullParams, TToFullParams>
    }

type ParamsReducer<TFrom, TTo> = TTo | ((current: TFrom) => TTo)

export type ToPathOption<
  TRoutesInfo extends AnyRoutesInfo = RegisteredRoutesInfo,
  TFrom extends TRoutesInfo['routePaths'] = '/',
  TTo extends string = '',
> =
  | TTo
  | RelativeToPathAutoComplete<
      TRoutesInfo['routePaths'],
      NoInfer<TFrom> extends string ? NoInfer<TFrom> : '',
      NoInfer<TTo> & string
    >

export type ToIdOption<
  TRoutesInfo extends AnyRoutesInfo = RegisteredRoutesInfo,
  TFrom extends TRoutesInfo['routePaths'] = '/',
  TTo extends string = '',
> =
  | TTo
  | RelativeToPathAutoComplete<
      TRoutesInfo['routeIds'],
      NoInfer<TFrom> extends string ? NoInfer<TFrom> : '',
      NoInfer<TTo> & string
    >

export interface ActiveOptions {
  exact?: boolean
  includeHash?: boolean
  includeSearch?: boolean
}

export type LinkOptions<
  TRoutesInfo extends AnyRoutesInfo = RegisteredRoutesInfo,
  TFrom extends TRoutesInfo['routePaths'] = '/',
  TTo extends string = '',
> = NavigateOptions<TRoutesInfo, TFrom, TTo> & {
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
  TRoutesInfo extends AnyRoutesInfo,
  TFrom,
  TTo,
> = TTo extends string
  ? TFrom extends string
    ? ResolveRelativePath<TFrom, TTo> extends TRoutesInfo['routePaths']
      ? {}
      : {
          Error: `${TFrom} + ${TTo} resolves to ${ResolveRelativePath<
            TFrom,
            TTo
          >}, which is not a valid route path.`
          'Valid Route Paths': TRoutesInfo['routePaths']
        }
    : {}
  : {}

export type CheckPath<
  TRoutesInfo extends AnyRoutesInfo,
  TPath,
  TPass,
> = Exclude<TPath, TRoutesInfo['routePaths']> extends never
  ? TPass
  : CheckPathError<TRoutesInfo, Exclude<TPath, TRoutesInfo['routePaths']>>

export type CheckPathError<TRoutesInfo extends AnyRoutesInfo, TInvalids> = {
  to: TRoutesInfo['routePaths']
}

export type CheckId<TRoutesInfo extends AnyRoutesInfo, TPath, TPass> = Exclude<
  TPath,
  TRoutesInfo['routeIds']
> extends never
  ? TPass
  : CheckIdError<TRoutesInfo, Exclude<TPath, TRoutesInfo['routeIds']>>

export type CheckIdError<TRoutesInfo extends AnyRoutesInfo, TInvalids> = {
  Error: `${TInvalids extends string
    ? TInvalids
    : never} is not a valid route ID.`
  'Valid Route IDs': TRoutesInfo['routeIds']
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
