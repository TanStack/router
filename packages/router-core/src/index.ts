import {
  createHashHistory,
  createBrowserHistory,
  createMemoryHistory,
  BrowserHistory,
  MemoryHistory,
  History,
  HashHistory,
} from 'history'
import React from 'react'
import { z } from 'zod'
// import { z } from 'zod'

export { createHashHistory, createBrowserHistory, createMemoryHistory }

import { decode, encode } from './qss'

// Types

export type NoInfer<T> = [T][T extends any ? 0 : never]
export type IsAny<T, Y, N> = 1 extends 0 & T ? Y : N
export type IsAnyBoolean<T> = 1 extends 0 & T ? true : false
export type IsKnown<T, Y, N> = unknown extends T ? N : Y
export type PickRequired<T, K extends keyof T> = Omit<T, K> &
  Required<Pick<T, K>>
export type PickPartial<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>
export type PickUnsafe<T, K> = K extends keyof T ? Pick<T, K> : never
export type PickExtra<T, K> = Expand<{
  [TKey in keyof K as string extends TKey
    ? never
    : TKey extends keyof T
    ? never
    : TKey]: K[TKey]
}>

export interface FrameworkGenerics {
  // The following properties are used internally
  // and are extended by framework adapters, but cannot be
  // pre-defined as constraints:
  //
  // Element: any
  // AsyncElement: any
  // SyncOrAsyncElement?: any
  // LinkProps: any
}

export type RouteDef<
  TId extends string = string,
  TPath extends string = string,
  TLoaderData extends LoaderData = LoaderData,
  TAllLoaderData extends LoaderData = LoaderData,
  TActionPayload = unknown,
  TActionResponse = unknown,
  TSearchZod extends SearchZod = SearchZod,
  TSearchSchema extends AnySearchSchema = {},
  TParentParams extends PathParams = PathParams,
  TParams extends PathParams = PathParams,
  TAllParams extends PathParams = PathParams,
  TKnownChildren = unknown,
> = {
  id: TId
  options: RouteOptions<
    TPath,
    TLoaderData,
    TAllLoaderData,
    TActionPayload,
    TActionResponse,
    TSearchZod,
    TSearchSchema,
    TParentParams,
    TParams,
    TAllParams
  >
  children?: TKnownChildren
  addChildren: <TNewChildren extends any>(
    cb: (
      createChildRoute: CreateRouteFn<
        false,
        TId,
        TAllLoaderData,
        TSearchSchema,
        TAllParams
      >,
    ) => TNewChildren extends AnyRouteDef[]
      ? TNewChildren
      : { error: 'Invalid route detected'; route: TNewChildren },
  ) => RouteDef<
    TId,
    TPath,
    TLoaderData,
    TAllLoaderData,
    TActionPayload,
    TActionResponse,
    TSearchZod,
    TSearchSchema,
    TParentParams,
    TParams,
    TAllParams,
    TNewChildren
  >
}

type CreateRouteFn<
  TIsRoot extends boolean,
  TParentId extends string = string,
  TParentAllLoaderData extends LoaderData = {},
  TParentSearchSchema extends AnySearchSchema = {},
  TParentParams extends PathParams = PathParams,
> = <
  TPath extends string,
  TLoaderData extends LoaderData,
  TActionPayload,
  TActionResponse,
  TSearchZod extends ParentZod<TParentSearchSchema> = {},
  TParams extends PathParams = PathParams,
  TResolvedParams extends PathParams extends TParams
    ? PathParamsFromPath<TPath>
    : TParams = PathParams extends TParams
    ? PathParamsFromPath<TPath>
    : TParams,
  TKnownChildren extends RouteDef[] = RouteDef[],
>(
  options?: TIsRoot extends true
    ? Omit<
        RouteOptions<
          TPath,
          TLoaderData,
          Expand<TParentAllLoaderData & DeepAwaited<NoInfer<TLoaderData>>>,
          TActionPayload,
          TActionResponse,
          TSearchZod,
          Expand<TParentSearchSchema & NoInfer<InferZod<TSearchZod>>>,
          TParentParams,
          TParams,
          Expand<TParentParams & TResolvedParams>
        >,
        'path'
      > & { path?: never }
    : RouteOptions<
        TPath,
        TLoaderData,
        Expand<TParentAllLoaderData & DeepAwaited<NoInfer<TLoaderData>>>,
        TActionPayload,
        TActionResponse,
        TSearchZod,
        Expand<TParentSearchSchema & NoInfer<InferZod<TSearchZod>>>,
        TParentParams,
        TParams,
        Expand<TParentParams & TResolvedParams>
      >,
  children?: TKnownChildren,
  isRoot?: boolean,
) => RouteDef<
  RouteId<TParentId, TPath>,
  TPath,
  TLoaderData,
  Expand<TParentAllLoaderData & DeepAwaited<NoInfer<TLoaderData>>>,
  TActionPayload,
  TActionResponse,
  TSearchZod,
  Expand<TParentSearchSchema & InferZod<TSearchZod>>,
  TParentParams,
  TParams,
  Expand<TParentParams & TResolvedParams>,
  TKnownChildren
>

type ValidateParams<TParams, TParentParams> = PathParams extends TParentParams
  ? true
  : keyof TParams extends keyof TParentParams
  ? true
  : false

export const createRoutes: CreateRouteFn<true> = (
  options = {} as any,
  children,
  isRoot = true,
) => {
  if (isRoot) {
    ;(options as any).path = rootRouteId
  }

  return {
    options,
    children,
    addChildren: (cb: any) =>
      createRoutes(
        options,
        cb((childOptions: any) => createRoutes(childOptions, undefined, false)),
        false,
      ),
  } as any
}

export type AnyRouteDef = RouteDef<
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any
>

export type AnyRouteDefWithChildren<TChildren> = RouteDef<
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  TChildren
>

export type RoutesInfo<
  TRouteDef extends AnyRouteDef = AnyRouteDef,
  TPreParsed extends ParseRouteDef = ParseRouteDef<TRouteDef, TRouteDef>,
  TParsed extends TPreParsed = TPreParsed,
  // TParsed extends TPreParsed extends never
  //   ? Route
  //   : TPreParsed = TPreParsed extends never ? Route : TPreParsed,
> = {
  route: TParsed
  routesById: AnyRouteDef extends TParsed
    ? Record<string, Route>
    : RoutesById<TParsed>
  routesByPath: AnyRouteDef extends TParsed
    ? Record<string, Route>
    : RoutesByPath<TParsed>
  // params: ParseRoute<TRouteDef>['param']
  // routesByParams: IndexObj<ParseRoute<TRouteDef>, 'param'>
  // allLoaderData: LoaderData &
  //   Expand<
  //     UnionToIntersection<
  //       Extract<ParseRoute<TRouteDef>, { loaderData: {} }>['loaderData']
  //     >
  //   >
  // allZodSchemas: Extract<
  //   ParseRoute<TRouteDef>,
  //   { searchSchema: {} }
  // >['searchSchema']
  // fullSearchSchema: Expand<
  //   UnionToIntersection<
  //     InferZod<
  //       Extract<ParseRoute<TRouteDef>, { searchSchema: {} }>['searchSchema']
  //     >
  //   >
  // >
}

export type AnyRoute = Route<
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any
>

type RoutesById<TParsed> = {
  [TRoute in TParsed as TRoute extends AnyRoute ? TRoute['id'] : never]: TRoute
}

type RoutesByPath<TParsed> = {
  [TRoute in TParsed as TRoute extends AnyRoute
    ? TrimPathRight<`${TRoute['id']}/`>
    : never]: TRoute
}

type IndexObj<T extends Record<string, any>, TKey extends keyof T> = {
  [E in T as E[TKey]]: E
}

type ParseRouteDef<
  TRootRouteDef extends AnyRouteDef = AnyRouteDef,
  TRouteDef = AnyRouteDef,
> = TRouteDef extends AnyRouteDef
  ?
      | RouteDefRoute<TRootRouteDef, TRouteDef>
      | ParseRouteChildren<TRootRouteDef, TRouteDef>
  : never

type ParseRouteChildren<
  TRootRouteDef extends AnyRouteDef,
  TRouteDef,
> = TRouteDef extends AnyRouteDefWithChildren<infer TChildren>
  ? unknown extends TChildren
    ? never
    : TChildren extends AnyRouteDef[]
    ? Values<{
        [TId in TChildren[number]['id']]: ParseRouteChild<
          TRootRouteDef,
          TChildren[number],
          TId
        >
      }>
    : never // Children are not routes
  : never // No children

type ParseRouteChild<
  TRootRouteDef extends AnyRouteDef,
  TRouteDef,
  TId,
> = TRouteDef & {
  id: TId
} extends AnyRouteDef
  ? ParseRouteDef<TRootRouteDef, TRouteDef>
  : never

export type Values<O> = O[ValueKeys<O>]
export type ValueKeys<O> = Extract<keyof O, PropertyKey>

export type RouteDefRoute<
  TRootRoute extends AnyRouteDef,
  TRouteDef,
> = TRouteDef extends RouteDef<
  infer TId,
  infer TPath,
  infer TLoaderData,
  infer TAllLoaderData,
  infer TActionPayload,
  infer TActionResponse,
  infer TSearchZod,
  infer TSearchSchema,
  infer TParentParams,
  infer TParams,
  infer TAllParams,
  any
>
  ? string extends TId
    ? never
    : Route<
        TRootRoute,
        TId,
        TPath,
        TLoaderData,
        TAllLoaderData,
        TActionPayload,
        TActionResponse,
        TSearchZod,
        TSearchSchema,
        TParentParams,
        TParams,
        TAllParams
      >
  : never

type DeepAwaited<T> = T extends Promise<infer A>
  ? DeepAwaited<A>
  : T extends Record<infer A, Promise<infer B>>
  ? { [K in A]: DeepAwaited<B> }
  : T

const rootRouteId = '__root__' as const
export type RootRouteId = typeof rootRouteId

type RouteId<
  TPrefix extends string,
  TPath extends string,
> = string extends TPath
  ? RootRouteId
  : `${TPrefix}/${TPath}` extends '/'
  ? '/'
  : `/${TrimPathLeft<`${TrimPathRight<TPrefix>}/${TrimPath<TPath>}`>}`

type CleanPath<T extends string> = T extends `${infer L}//${infer R}`
  ? CleanPath<`${CleanPath<L>}/${CleanPath<R>}`>
  : T extends `${infer L}//`
  ? `${CleanPath<L>}/`
  : T extends `//${infer L}`
  ? `/${CleanPath<L>}`
  : T

type TrimPath<T extends string> = '' extends T
  ? ''
  : TrimPathRight<TrimPathLeft<T>>

type TrimPathLeft<T extends string> = T extends `${RootRouteId}/${infer U}`
  ? TrimPathLeft<U>
  : T extends `/${infer U}`
  ? TrimPathLeft<U>
  : T
type TrimPathRight<T extends string> = T extends '/'
  ? '/'
  : T extends `${infer U}/`
  ? TrimPathRight<U>
  : T

export type ParsePathParams<T extends string> = Split<
  T,
  '/'
>[number] extends infer U
  ? U extends `:${infer V}`
    ? V
    : never
  : never

export type PathParamsFromPath<TPath extends string = string> = Expand<
  Record<ParsePathParams<TPath>, string>
>

export type PathParamMask<TRoutePath extends string> =
  TRoutePath extends `${infer L}/:${infer C}/${infer R}`
    ? PathParamMask<`${L}/${string}/${R}`>
    : TRoutePath extends `${infer L}/:${infer C}`
    ? PathParamMask<`${L}/${string}`>
    : TRoutePath

type PartialPath<TRoutePath extends string> = Expand<
  Values<{
    [T in TRoutePath]: `/${TrimPathLeft<_PartialPath<T>>}`
  }>
>

type _PartialPath<TRoutePath extends string> =
  TrimPath<TRoutePath> extends TrimPath<`${infer L}/${infer R}`>
    ?
        | (string extends L ? `${L}/` : L | `${L}/`)
        | `${L}/${_PartialPath<`${R}`>}`
    : TRoutePath

type RelativePathTo<
  TFrom extends string,
  TValidPaths extends string = string,
> = PartialPath<PathParamMask<TFrom>>

type Split<S extends string, D extends string = '/'> = string extends S
  ? string[]
  : CleanPath<S> extends ''
  ? []
  : CleanPath<S> extends `${infer T}${D}${infer U}`
  ? [T, ...Split<U, D>]
  : [S]

type Join<T, D extends string = '/'> = T extends []
  ? ''
  : T extends [infer L extends string]
  ? L
  : T extends [infer L extends string, ...infer Tail extends [...string[]]]
  ? `${L}/${Join<Tail, D>}`
  : never

export type ResolvePath<
  TBase extends string,
  TTo extends string,
> = Split<TTo> extends ['.', ...infer R]
  ? ResolvePath<TBase, Join<R>>
  : Split<TTo> extends ['..', ...infer R]
  ? Split<TBase, '/'> extends [...infer L, any]
    ? ResolvePath<Join<L>, Join<R>>
    : never
  : `${TBase}/${TTo}`

// let testResolveRoute: ResolvePath<'/a/b/c', '../../../d'> = '/d'
//  ^?
// type ValidRoutes = '/a/b/c' | 'a/b/cc' | '/d/e'
// let test6: VerifyLink<ValidRoutes, ResolvePath<'/a/b/c', '../cc'>>
// let test4: VerifyLink<ValidRoutes, ResolvePath<'/a/b/c', '../'>>
// let test5: VerifyLink<ValidRoutes, ResolvePath<'/a/b/c', '../cc'>>

type Expand<T> = T extends object
  ? T extends infer O
    ? { [K in keyof O]: O[K] }
    : never
  : T

type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (
  k: infer I,
) => any
  ? I
  : never

export type AnySearchSchema = any
export interface SearchSchema {}
export interface PathParams {}
export interface LoaderData {}
export interface RouteMeta {}
export interface LocationState {}

type Timeout = ReturnType<typeof setTimeout>

export type SearchSerializer = (searchObj: Record<string, any>) => string
export type SearchParser = (searchStr: string) => Record<string, any>

export type Updater<TPrevious, TResult = TPrevious> =
  | TResult
  | ((prev?: TPrevious) => TResult)

export type Location<
  TSearchObj extends AnySearchSchema = {},
  TState extends LocationState = LocationState,
> = {
  href: string
  pathname: string
  search: TSearchObj
  searchStr: string
  state: TState
  hash: string
  key?: string
}

export type FromLocation = {
  pathname: string
  search?: SearchSchema
  key?: string
  hash?: string
}

export type PickExtract<T, U> = {
  [K in keyof T as T[K] extends U ? K : never]: T[K]
}

export type PickExclude<T, U> = {
  [K in keyof T as T[K] extends U ? never : K]: T[K]
}

export type SearchZod = Record<string, any>

export type DefinedSearchParamWarning =
  'Top level search params cannot be redefined by child routes!'

export type ParentZod<TParentSearchZod = unknown> =
  unknown extends TParentSearchZod
    ? {}
    : SearchZod & {
        [Key in keyof TParentSearchZod]?: DefinedSearchParamWarning
      }

export type DefinedPathParamWarning =
  'Path params cannot be redefined by child routes!'

export type ParentParams<TParentParams> = PathParams extends TParentParams
  ? {}
  : SearchZod & {
      [Key in keyof TParentParams]?: DefinedPathParamWarning
    }

export type InferZod<T extends SearchZod> = Expand<{
  [Key in keyof T]: z.infer<T[Key]>
}>

export type RouteOptions<
  TPath extends string = string,
  TLoaderData extends LoaderData = {},
  TAllLoaderData extends LoaderData = {},
  TActionPayload = unknown,
  TActionResponse = unknown,
  TSearchZod extends SearchZod = {},
  TSearchSchema extends AnySearchSchema = {},
  TParentParams extends PathParams = PathParams,
  TParams extends Record<ParsePathParams<TPath>, any> = Record<
    ParsePathParams<TPath>,
    any
  >,
  TAllParams extends PathParams = PathParams,
> = {
  // The path to match (relative to the nearest parent `Route` component or root basepath)
  path: TPath
  // If true, this route will be matched as case-sensitive
  caseSensitive?: boolean
  searchZod?: TSearchZod
  searchSchema?: TSearchSchema
  // // Either (1) an object that will be used to shallowly match the current location's search or (2) A function that receives the current search params and can return truthy if they are matched.
  // search?: SearchPredicate<TSearchSchema>
  // Filter functions that can manipulate search params *before* they are passed to links and navigate
  // calls that match this route.
  preSearchFilters?: SearchFilter<TSearchSchema>[]
  // Filter functions that can manipulate search params *after* they are passed to links and navigate
  // calls that match this route.
  postSearchFilters?: SearchFilter<TSearchSchema>[]
  // The duration to wait during `loader` execution before showing the `pendingElement`
  pendingMs?: number
  // _If the `pendingElement` is shown_, the minimum duration for which it will be visible.
  pendingMinMs?: number
  // // An array of child routes
  // children?: Route<any, any, any, any>[]
} & (IsAnyBoolean<TPath> extends true
  ? {}
  :
      | {
          parseParams?: never
          stringifyParams?: never
        }
      | {
          // Parse params optionally receives path params as strings and returns them in a parsed format (like a number or boolean)
          parseParams: (rawParams: PathParamsFromPath<TPath>) => TParams
          stringifyParams: (
            params: NoInfer<TParams>,
          ) => PathParamsFromPath<TPath>
        }) &
  RouteLoaders<
    // Route Loaders (see below) can be inline on the route, or resolved async
    any,
    TPath,
    TLoaderData,
    TAllLoaderData,
    TActionPayload,
    TActionResponse,
    TSearchZod,
    TSearchSchema,
    TAllParams
  > & {
    // If `import` is defined, this route can resolve its elements and loaders in a single asynchronous call
    // This is particularly useful for code-splitting or module federation
    import?: (opts: {
      params: PathParams
    }) => Promise<
      RouteLoaders<
        any,
        TPath,
        TLoaderData,
        TAllLoaderData,
        TActionPayload,
        TActionResponse,
        TSearchZod,
        TSearchSchema,
        TAllParams
      >
    >
  } & (Record<keyof PathParamsFromPath<TPath>, any> extends NoInfer<TParams> // Detect if parseRoutes is returning extra properties
    ? {}
    : {
        error: 'parseParams must only return path params defined in the path'
        param: Expand<Omit<NoInfer<TParams>, keyof PathParamsFromPath<TPath>>>
      }) &
  (PickUnsafe<TParentParams, keyof PathParamsFromPath<TPath>> extends never // Detect if an existing path param is being redefined
    ? {}
    : 'Cannot redefined path params in child routes!')

export interface RouteLoaders<
  TRootRouteDef extends AnyRouteDef = AnyRouteDef,
  TPath extends string = string,
  TLoaderData extends LoaderData = {},
  TAllLoaderData extends LoaderData = {},
  TActionPayload = unknown,
  TActionData = unknown,
  TSearchZod extends SearchZod = SearchZod,
  TSearchSchema extends AnySearchSchema = {},
  TAllParams extends PathParams = PathParams,
> {
  // The content to be rendered when the route is matched. If no element is provided, defaults to `<Outlet />`
  element?: GetFrameworkGeneric<'SyncOrAsyncElement', NoInfer<TAllLoaderData>>
  // The content to be rendered when `loader` encounters an error
  errorElement?: GetFrameworkGeneric<
    'SyncOrAsyncElement',
    NoInfer<TAllLoaderData>
  >
  // The content to be rendered when rendering encounters an error
  catchElement?: GetFrameworkGeneric<
    'SyncOrAsyncElement',
    NoInfer<TAllLoaderData>
  >
  // The content to be rendered when the duration of `loader` execution surpasses the `pendingMs` duration
  pendingElement?: GetFrameworkGeneric<
    'SyncOrAsyncElement',
    NoInfer<TAllLoaderData>
  >
  // An asynchronous function responsible for preparing or fetching data for the route before it is rendered
  loader?: LoaderFn<TPath, TLoaderData, TSearchZod, TSearchSchema, TAllParams>
  // An asynchronous function made available to the route for performing asynchronous or mutative actions that
  // might invalidate the route's data.
  action?: ActionFn<TPath, TActionPayload, TActionData>
  // This function is called
  // when moving from an inactive state to an active one. Likewise, when moving from
  // an active to an inactive state, the return function (if provided) is called.
  onMatch?: (
    match: RouteMatch<
      TRootRouteDef,
      TPath,
      TPath,
      TLoaderData,
      TAllLoaderData,
      TActionPayload,
      TActionData,
      TSearchZod,
      TSearchSchema,
      TAllParams
    >,
  ) =>
    | void
    | undefined
    | ((
        match: RouteMatch<
          TRootRouteDef,
          TPath,
          TPath,
          TLoaderData,
          TAllLoaderData,
          TActionPayload,
          TActionData,
          TSearchZod,
          TSearchSchema,
          TAllParams
        >,
      ) => void)
  // This function is called when the route remains active from one transition to the next.
  onTransition?: (
    match: RouteMatch<
      TRootRouteDef,
      TPath,
      TPath,
      TLoaderData,
      TAllLoaderData,
      TActionPayload,
      TActionData,
      TSearchZod,
      TSearchSchema,
      TAllParams
    >,
  ) => void
  // An object of whatever you want! This object is accessible anywhere matches are.
  meta?: RouteMeta
}

export type SearchFilter<T = SearchSchema, U = T> = (prev: T) => U

export type MatchLocation = {
  to?: string | number | null
  fuzzy?: boolean
  caseSensitive?: boolean
  from?: string
  fromCurrent?: boolean
}

export type SearchPredicate<TSearch extends AnySearchSchema = {}> = (
  search: TSearch,
) => any

export type UnloadedMatch<
  TPath extends string = string,
  TLoaderData extends LoaderData = {},
  TActionPayload = unknown,
  TActionResponse = unknown,
> = {
  id: string
  route: Route
  pathname: string
  params: PathParams
}

export type LoaderFn<
  TPath extends string,
  TLoaderData extends LoaderData,
  TSearchZod extends SearchZod = SearchZod,
  TSearchSchema extends AnySearchSchema = {},
  TAllParams extends PathParams = PathParams,
> = (
  match: RouteMatch<
    any,
    TPath,
    TPath,
    {},
    {},
    unknown,
    unknown,
    TSearchZod,
    TSearchSchema,
    TAllParams
  >,
  ctx: RouteMatchContext<TPath>,
) => Promise<TLoaderData>

export type ActionFn<
  TPath extends string = string,
  TActionPayload = unknown,
  TActionResponse = unknown,
> = (
  submission: TActionPayload,
  ctx: ActionContext<TPath, TActionPayload>,
) => Promise<TActionResponse>

export type UnloaderFn<TPath extends string> = (
  routeMatch: RouteMatch<any, TPath>,
) => void

export type RouteMatchContext<
  TPath extends string,
  TLoaderData extends LoaderData = {},
  TActionPayload = unknown,
  TActionResponse = unknown,
> = {
  match: UnloadedMatch<TPath, TLoaderData, TActionPayload, TActionResponse>
  signal?: AbortSignal
  // router: Router
}

export type ActionContext<
  TPath extends string = string,
  TActionPayload = unknown,
> = {
  // router: Router
  match: UnloadedMatch<TPath, LoaderData, TActionPayload, unknown>
}

export type RouterState = {
  status: 'idle' | 'loading'
  location: Location
  matches: RouteMatch[]
  lastUpdated: number
  loaderData: unknown
  action?: ActionState
  actions: Record<string, Action>
  pending?: PendingState
}

export type PendingState = {
  location: Location
  matches: RouteMatch[]
}

export type ListenerFn = () => void

export type Segment = {
  type: 'pathname' | 'param' | 'wildcard'
  value: string
}

type GetFrameworkGeneric<U, TData = unknown> = U extends keyof FrameworkGenerics
  ? FrameworkGenerics[U]
  : any

export type __Experimental__RouterSnapshot = {
  location: Location
  matches: SnapshotRouteMatch<unknown>[]
}

export type SnapshotRouteMatch<TData> = {
  id: string
  loaderData: TData
}

export type BuildNextOptions = {
  to?: string | number | null
  search?: true | Updater<SearchSchema>
  hash?: true | Updater<string>
  key?: string
  from?: string
  fromCurrent?: boolean
  __preSearchFilters?: SearchFilter[]
  __postSearchFilters?: SearchFilter[]
}

export type NavigateOptions = BuildNextOptions & {
  replace?: boolean
}

export type LinkOptions<
  TRoutesInfo extends RoutesInfo,
  TRoute extends TRoutesInfo['route'],
  // TId extends string = string,
  // TPath extends string = string,
  // TLoaderData extends LoaderData = {},
  // TAllLoaderData extends LoaderData = {},
  // TActionPayload extends any = any,
  // TActionResponse extends any = any,
  // TSearchZod extends SearchZod = {},
  // TSearchSchema extends AnySearchSchema = {},
  // TRouteDefs extends AnyRouteDef = AnyRouteDef,
  TTo extends keyof TRoutesInfo['routesByPath'],
  // TFromRoutePath extends string = '',
  // TFrom extends string = '/',
  // TParams extends StrictPathParamsFromPath<
  //   NoInfer<TTo>
  // > = StrictPathParamsFromPath<NoInfer<TTo>>,
  // TToResolved extends string = ResolvePath<TFrom, TTo>,
> = {
  fromRoute?: TRoute
  // The absolute or relative route path
  to?: TTo
  // The params to interpolate into the destination route
  // params?: TParams
  // The new search object or a function to update it
  search?: true | Updater<SearchSchema>
  // The new has string or a function to update it
  hash?: Updater<string>
  // Whether to replace the current history stack instead of pushing a new one
  replace?: boolean
  // The standard anchor tag target attribute
  target?: HTMLAnchorElement['target']
  // A function that is passed the [Location API](#location-api) and returns additional props for the `active` state of this link. These props override other props passed to the link (`style`'s are merged, `className`'s are concatenated)
  getActiveProps?: () => GetFrameworkGeneric<'LinkProps'>
  // A function that is passed the [Location API](#location-api) and returns additional props for the `inactive` state of this link. These props override other props passed to the link (`style`'s are merged, `className`'s are concatenated)
  getInactiveProps?: () => GetFrameworkGeneric<'LinkProps'>
  // Defaults to `{ exact: false, includeHash: false }`
  activeOptions?: ActiveOptions
  // If set, will preload the linked route on hover and cache it for this many milliseconds in hopes that the user will eventually navigate there.
  preload?: false | 'intent'
  // When preloaded and set, will cache the preloaded result for this duration in milliseconds
  preloadMaxAge?: number
  // Delay intent preloading by this many milliseconds. If the intent exits before this delay, the preload will be cancelled.
  preloadDelay?: number
  // If true, will render the link without the href attribute
  disabled?: boolean
  // The root (excluding the basepath) from which to resolve the route.
  // Defaults to the current location's pathname.
  // To navigate from the root, pass `/` as the from
  from?: string
  // from?: TFrom
}

export type FullLinkOptions = LinkOptions<any, any, any> & {
  // This ref is used internally by framework adapters to track mutable state for each link.
  // Passing it in userland is a no-op.
  ref: { preloadTimeout?: null | ReturnType<typeof setTimeout> }
}

type ActiveOptions = {
  exact?: boolean
  includeHash?: boolean
}

export type FilterRoutesFn = <TRoute extends Route>(
  routeDefs: TRoute[],
) => TRoute[]

type Listener = () => void

class Subscribable {
  listeners: Listener[]
  constructor() {
    this.listeners = []
  }
  subscribe(listener: Listener): () => void {
    this.listeners.push(listener as Listener)
    return () => {
      this.listeners = this.listeners.filter((x) => x !== listener)
    }
  }
  notify(): void {
    this.listeners.forEach((listener) => listener())
  }
}

// Source

// Detect if we're in the DOM
const isDOM = Boolean(
  typeof window !== 'undefined' &&
    window.document &&
    window.document.createElement,
)
// This is the default history object if none is defined
const createDefaultHistory = () =>
  isDOM ? createBrowserHistory() : createMemoryHistory()

export type MatchRouteOptions = { pending: boolean; caseSensitive?: boolean }

export type LinkInfo = {
  next: Location
  handleFocus: (e: any) => void
  handleClick: (e: any) => void
  handleEnter: (e: any) => void
  handleLeave: (e: any) => void
  activeProps: GetFrameworkGeneric<'LinkProps'>
  inactiveProps: GetFrameworkGeneric<'LinkProps'>
  isActive: boolean
}

export type PreloadCacheEntry = {
  expiresAt: number
  match: RouteMatch
}

export type RouterOptions<TRouteDefs extends RouteDef> = {
  routes?: TRouteDefs
  basepath?: string
} & Partial<Pick<Router, 'history' | 'stringifySearch' | 'parseSearch'>> &
  Pick<
    Router,
    | 'filterRoutes'
    | 'defaultLinkPreload'
    | 'defaultLinkPreloadMaxAge'
    | 'defaultLinkPreloadDelay'
    | 'useErrorBoundary'
    | 'defaultElement'
    | 'defaultErrorElement'
    | 'defaultCatchElement'
    | 'defaultPendingElement'
    | 'defaultPendingMs'
    | 'defaultPendingMinMs'
    | 'caseSensitive'
    | '__experimental__snapshot'
  >

export type Action<
  TPayload = unknown,
  TResponse = unknown,
  // TError = unknown,
> = {
  submit: (submission?: TPayload) => Promise<TResponse>
  latest?: ActionState
  pending: ActionState<TPayload, TResponse>[]
}

export type ActionState<
  TPayload = unknown,
  TResponse = unknown,
  // TError = unknown,
> = {
  submittedAt: number
  status: 'idle' | 'pending' | 'success' | 'error'
  submission: TPayload
  data?: TResponse
  error?: unknown
}

export class Router<
  TRouteDefs extends RouteDef = RouteDef,
  TRoutesInfo extends RoutesInfo<TRouteDefs> = RoutesInfo<TRouteDefs>,
> extends Subscribable {
  routeInfo!: TRoutesInfo
  history: BrowserHistory | MemoryHistory | HashHistory
  stringifySearch: SearchSerializer
  parseSearch: SearchParser
  filterRoutes?: FilterRoutesFn
  defaultLinkPreload?: false | 'intent'
  defaultLinkPreloadMaxAge?: number
  defaultLinkPreloadDelay?: number
  useErrorBoundary?: boolean
  defaultElement?: GetFrameworkGeneric<'Element'>
  defaultErrorElement?: GetFrameworkGeneric<'Element'>
  defaultCatchElement?: GetFrameworkGeneric<'Element'>
  defaultPendingElement?: GetFrameworkGeneric<'Element'>
  defaultPendingMs?: number
  defaultPendingMinMs?: number
  caseSensitive?: boolean
  __experimental__snapshot?: __Experimental__RouterSnapshot

  // Computed in this.update()
  basepath!: string
  rootMatch!: Pick<
    RouteMatch,
    'id' | 'params' | 'search' | 'pathname' | 'loaderData' | 'status'
  >

  // Internal:
  location: Location
  navigateTimeout?: Timeout
  nextAction?: 'push' | 'replace'
  destroy: () => void
  state: RouterState
  isTransitioning: boolean = false
  routes: Route[] = [] as any
  routesById: TRoutesInfo['routesById'] = {} as any
  _unsafe_routesById: Record<string, Route> = {} as any
  navigationPromise = Promise.resolve()
  resolveNavigation = () => {}
  startedLoadingAt = Date.now()

  constructor(options?: RouterOptions<TRouteDefs>) {
    super()

    this.history = options?.history || createDefaultHistory()
    this.stringifySearch = options?.stringifySearch ?? defaultStringifySearch
    this.parseSearch = options?.parseSearch ?? defaultParseSearch
    this.location = this.parseLocation(this.history.location)
    this.destroy = this.history.listen((event) => {
      this.loadLocation(this.parseLocation(event.location, this.location))
    })

    this.update(options)

    let matches: RouteMatch[] = []

    const __experimental__snapshot = options?.__experimental__snapshot

    if (__experimental__snapshot) {
      // const matches = this.matchRoutes(this.location)
      // matchLoader.matches.forEach((match, index) => {
      //   if (match.id !== __experimental__snapshot.matches[index]?.id) {
      //     throw new Error(
      //       `Router hydration mismatch: ${match.id} !== ${__experimental__snapshot.matches[index]?.id}`,
      //     )
      //   }
      //   match.data = __experimental__snapshot.matches[index]?.data ?? {}
      // })
      // cascadeMatchData(matchLoader.matches)
      // matches = matchLoader.matches
    }

    this.state = {
      status: 'idle',
      location: __experimental__snapshot?.location ?? this.location,
      matches: matches,
      actions: {},
      loaderData: {} as any,
      lastUpdated: Date.now(),
    }
  }

  mount = () => {
    const next = this.buildLocation(this.basepath, {
      to: '.',
      search: true,
      hash: true,
    })

    // If the current location isn't updated, trigger a navigation
    // to the current location. Otherwise, load the current location.
    if (next.href !== this.location.href) {
      return this.commitLocation(next, true)
    } else {
      return this.loadLocation()
    }
  }

  update = <TRouteDefs extends RouteDef = RouteDef>(
    opts?: RouterOptions<TRouteDefs>,
  ): Router<TRouteDefs> => {
    const { basepath, routes, ...rest } = opts ?? {}
    Object.assign(this, rest)

    this.basepath = cleanPath(`/${basepath ?? ''}`)

    // this.rootMatch = {
    //   id: rootRouteId,
    //   params: {} as any,
    //   search: {} as any,
    //   pathname: this.basepath,
    //   loaderData: {},
    //   status: 'success',
    // }

    if (routes) {
      this.routesById = {} as any
      this.routes = this.buildRoutes(routes)
    }

    return this as unknown as Router<TRouteDefs>
  }

  buildRoutes = (rootRouteDef: RouteDef) => {
    const recurseRoutes = (routeDefs: RouteDef[], parent?: Route): Route[] => {
      return routeDefs.map((routeDef) => {
        const routeOptions = routeDef.options
        const route = new Route(routeOptions, parent, this)

        // {
        //   pendingMs: routeOptions.pendingMs ?? this.defaultPendingMs,
        //   pendingMinMs: routeOptions.pendingMinMs ?? this.defaultPendingMinMs,
        // }

        const existingRoute = this._unsafe_routesById[route.id]

        if (existingRoute) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn(
              `Duplicate routes found with id: ${route.id}`,
              this.routesById,
              route,
            )
          }
          throw new Error()
        }

        this._unsafe_routesById[route.id] = route

        const children = routeDef.children as RouteDef[]

        route.children = children?.length
          ? recurseRoutes(children, route)
          : undefined

        return route
      })
    }

    const routes = recurseRoutes([rootRouteDef])

    this.routesById = this._unsafe_routesById as TRoutesInfo['routesById']

    return routes
  }

  getRoute = <TRouteId extends keyof typeof this.routesById>(
    routeId: TRouteId,
  ) => {
    const route = this.routesById[routeId]

    if (!route) {
      throw new Error('Route not found!')
    }

    return route
  }

  preNotify = () => {
    const match = last(this.state.matches)

    let loaderData = {}

    if (match) {
      const recurse = (m: RouteMatch) => {
        if (m.parentMatch) {
          recurse(m.parentMatch)
        }
        loaderData = { ...loaderData, ...(m.loaderData as any) }
      }

      recurse(match)
    }

    const isPending =
      !!this.state.pending ||
      this.state.matches.find((d) => d.status === 'loading')

    const isLoading =
      isPending ||
      Object.keys(this.state.actions).some(
        (key) => this.state.actions[key]?.pending.length,
      )

    this.state = {
      ...this.state,
      status: isLoading ? 'loading' : 'idle',
      loaderData: replaceEqualDeep(this.state.loaderData, loaderData),
      lastUpdated: Date.now(),
    }
  }

  parseLocation = (
    location: History['location'],
    previousLocation?: Location,
  ): Location => {
    const parsedSearch = this.parseSearch(location.search)

    return {
      pathname: location.pathname,
      searchStr: location.search,
      search: replaceEqualDeep(previousLocation?.search, parsedSearch),
      hash: location.hash.split('#').reverse()[0] ?? '',
      href: `${location.pathname}${location.search}${location.hash}`,
      state: location.state as LocationState,
      key: location.key,
    }
  }

  buildLocation = (
    basepath: string = '/',
    dest: BuildNextOptions = {},
  ): Location => {
    const resolvedFrom: Location = {
      ...this.location,
      pathname: dest.fromCurrent
        ? this.location.pathname
        : dest.from ?? this.location.pathname,
    }

    const pathname = resolvePath(
      basepath,
      resolvedFrom.pathname,
      `${dest.to ?? '.'}`,
    )

    // Pre filters first
    const preFilteredSearch = dest.__preSearchFilters?.length
      ? dest.__preSearchFilters.reduce(
          (prev, next) => next(prev),
          resolvedFrom.search,
        )
      : resolvedFrom.search

    // Then the link/navigate function
    const destSearch =
      dest.search === true
        ? preFilteredSearch // Preserve resolvedFrom true
        : dest.search
        ? functionalUpdate(dest.search, preFilteredSearch) ?? {} // Updater
        : dest.__preSearchFilters?.length
        ? preFilteredSearch // Preserve resolvedFrom filters
        : {}

    // Then post filters
    const postFilteredSearch = dest.__postSearchFilters?.length
      ? dest.__postSearchFilters.reduce((prev, next) => next(prev), destSearch)
      : destSearch

    const search = replaceEqualDeep(resolvedFrom.search, postFilteredSearch)

    const searchStr = this.stringifySearch(search)
    let hash =
      dest.hash === true
        ? resolvedFrom.hash
        : functionalUpdate(dest.hash, resolvedFrom.hash)
    hash = hash ? `#${hash}` : ''

    return {
      pathname,
      search,
      searchStr,
      state: resolvedFrom.state,
      hash,
      href: `${pathname}${searchStr}${hash}`,
      key: dest.key,
    }
  }

  commitLocation = (next: Location, replace?: boolean): Promise<void> => {
    const id = '' + Date.now() + Math.random()

    if (this.navigateTimeout) clearTimeout(this.navigateTimeout)

    let nextAction: 'push' | 'replace' = 'replace'

    if (!replace) {
      nextAction = 'push'
    }

    const isSameUrl =
      this.parseLocation(this.history.location).href === next.href

    if (isSameUrl && !next.key) {
      nextAction = 'replace'
    }

    if (nextAction === 'replace') {
      this.history.replace(
        {
          pathname: next.pathname,
          hash: next.hash,
          search: next.searchStr,
        },
        {
          id,
        },
      )
    } else {
      this.history.push(
        {
          pathname: next.pathname,
          hash: next.hash,
          search: next.searchStr,
        },
        {
          id,
        },
      )
    }

    this.navigationPromise = new Promise((resolve) => {
      const previousNavigationResolve = this.resolveNavigation

      this.resolveNavigation = () => {
        previousNavigationResolve()
        resolve()
      }
    })

    return this.navigationPromise
  }

  buildNext = (opts: BuildNextOptions) => {
    const next = this.buildLocation(this.basepath, opts)

    const matches = this.matchRoutes(next.pathname)

    const __preSearchFilters = matches
      .map((match) => match.route.options.preSearchFilters ?? [])
      .flat()
      .filter(Boolean)

    const __postSearchFilters = matches
      .map((match) => match.route.options.postSearchFilters ?? [])
      .flat()
      .filter(Boolean)

    return this.buildLocation(this.basepath, {
      ...opts,
      __preSearchFilters,
      __postSearchFilters,
    })
  }

  navigate = (
    opts: NavigateOptions,
    // otherOpts?: { resolveEarly?: boolean },
  ) => {
    const next = this.buildNext(opts)
    return this.commitLocation(
      next,
      opts.replace,
      // otherOpts
    )
  }

  cancelMatches = () => {
    ;[...this.state.matches, ...(this.state.pending?.matches ?? [])].forEach(
      (match) => {
        match.cancel()
      },
    )
  }

  loadLocation = async (next?: Location) => {
    const id = Math.random()
    this.startedLoadingAt = id

    if (next) {
      // Ingest the new location
      this.location = next
    }

    // Cancel any pending  matches
    this.cancelMatches()

    // Match the routes
    const unloadedMatches = this.matchRoutes(this.location.pathname)
    const resolvedMatches = this.resolveMatches(unloadedMatches)

    this.state = {
      ...this.state,
      pending: {
        matches: resolvedMatches,
        location: this.location,
      },
    }
    this.notify()

    // Load the matches
    const matches = await this.loadMatches(resolvedMatches, {
      withPending: true,
    })

    if (this.startedLoadingAt !== id) {
      console.log('double')
      // Ignore side-effects of match loading
      return this.navigationPromise
    }

    const previousMatches = this.state.matches

    previousMatches
      .filter((d) => {
        return !matches.find((dd) => dd.id === d.id)
      })
      .forEach((d) => {
        d.onExit?.(d)
      })

    previousMatches
      .filter((d) => {
        return matches.find((dd) => dd.id === d.id)
      })
      .forEach((d) => {
        d.route.options.onTransition?.(d)
      })

    matches
      .filter((d) => {
        return !previousMatches.find((dd) => dd.id === d.id)
      })
      .forEach((d) => {
        d.onExit = d.route.options.onMatch?.(d)
      })

    this.state = {
      ...this.state,
      location: this.location,
      matches,
      pending: undefined,
    }

    if (matches.some((d) => d.status === 'loading')) {
      this.notify()
      await Promise.all(
        matches.map((d) => d.loaderPromise || Promise.resolve()),
      )
    }
    if (this.startedLoadingAt !== id) {
      // Ignore side-effects of match loading
      return
    }
    this.notify()
    this.resolveNavigation()
  }

  preloadCache: Record<string, PreloadCacheEntry> = {}

  cleanPreloadCache = () => {
    const activeMatchIds = [
      ...(this?.state.matches ?? []),
      ...(this?.state.pending?.matches ?? []),
    ].map((d) => d.id)

    const now = Date.now()

    Object.keys(this.preloadCache).forEach((matchId) => {
      const entry = this.preloadCache[matchId]!

      if (activeMatchIds.includes(matchId)) {
        return
      }

      if (entry.expiresAt < now) {
        delete this.preloadCache[matchId]
      }
    })
  }

  loadRoute = async (
    navigateOpts: NavigateOptions = this.location,
    loaderOpts: { maxAge: number },
  ) => {
    const next = this.buildNext(navigateOpts)
    const unloadedMatches = this.matchRoutes(next.pathname)
    const matches = this.resolveMatches(unloadedMatches)
    await this.loadMatches(matches, {
      preload: true,
      maxAge: loaderOpts.maxAge,
    })
    return matches
  }

  matchRoutes = <TPath extends string>(pathname: TPath): UnloadedMatch[] => {
    this.cleanPreloadCache()

    const matches: UnloadedMatch[] = []

    if (!this.routes?.length) {
      return matches
    }

    const recurse = async (
      routes: Route[],
      parentMatch: UnloadedMatch,
    ): Promise<void> => {
      let { params } = parentMatch

      const filteredRoutes = this?.filterRoutes
        ? this?.filterRoutes(routes)
        : routes

      const route = filteredRoutes?.find((route) => {
        const fullRoutePathName = joinPaths([
          parentMatch.pathname,
          route.options.path,
        ])

        const fuzzy = !!(route.options.path !== '/' || route.children?.length)

        const matchParams = matchPathname(pathname, {
          to: fullRoutePathName,
          fuzzy,
          caseSensitive: route.options.caseSensitive ?? this.caseSensitive,
        })

        if (matchParams) {
          params = {
            ...params,
            ...matchParams,
          }
        }

        return !!matchParams
      })

      if (!route) {
        return
      }

      const interpolatedPath = interpolatePath(route.options.path, params)

      const interpolatedId = interpolatePath(route.id, params, true)

      const match: UnloadedMatch = {
        id: interpolatedId,
        route,
        params,
        pathname: joinPaths([pathname, interpolatedPath]),
      }

      matches.push(match)

      if (route.children?.length) {
        recurse(route.children, match)
      }
    }

    recurse(this.routes, this.rootMatch as unknown as UnloadedMatch)

    return matches
  }

  resolveMatches = (unloadedMatches: UnloadedMatch[]): RouteMatch[] => {
    if (!unloadedMatches?.length) {
      return []
    }

    const existingMatches = [
      ...this.state.matches,
      ...(this.state.pending?.matches ?? []),
    ]

    const matches = unloadedMatches.map((unloadedMatch, i) => {
      return (
        existingMatches.find((d) => d.id === unloadedMatch.id) ||
        this.preloadCache[unloadedMatch.id]?.match ||
        new RouteMatch(this, unloadedMatch)
      )
    })

    matches.forEach((match, index) => {
      match.setParentMatch(matches[index - 1])
    })

    return matches
  }

  loadMatches = async (
    resolvedMatches: RouteMatch[],
    loaderOpts?: { withPending?: boolean } & (
      | { preload: true; maxAge: number }
      | { preload?: false; maxAge?: never }
    ),
  ): Promise<RouteMatch[]> => {
    const matchPromises = resolvedMatches.map(async (match) => {
      if (
        (match.status === 'success' && match.isInvalid) ||
        match.status === 'error' ||
        match.status === 'idle'
      ) {
        const promise = match.load()
        if (loaderOpts?.withPending) match.startPending()
        if (loaderOpts?.preload) {
          this.preloadCache[match.id] = {
            expiresAt: Date.now() + loaderOpts?.maxAge!,
            match,
          }
        }
        return promise
      }
    })

    await Promise.all(matchPromises)

    return resolvedMatches
  }

  invalidateRoute = (opts: MatchLocation) => {
    const next = this.buildNext(opts)
    const unloadedMatchIds = this.matchRoutes(next.pathname).map((d) => d.id)
    ;[...this.state.matches, ...(this.state.pending?.matches ?? [])].forEach(
      (match) => {
        if (unloadedMatchIds.includes(match.id)) {
          match.isInvalid = true
        }
      },
    )

    if (process.env.NODE_ENV !== 'production') {
      this.notify()
    }
  }

  reload = () =>
    this.navigate({
      to: '',
      fromCurrent: true,
      replace: true,
    })

  getLoaderData = () => {
    return this.state.loaderData
  }

  getAction = <TActionPayload = any, TActionResponse = unknown>(
    matchOpts: Pick<MatchLocation, 'to' | 'from'>,
    opts?: { isActive?: boolean },
  ): Action<TActionPayload, TActionResponse> => {
    const next = this.buildNext(matchOpts)
    const matches = this.matchRoutes(next.pathname)
    const match = matches.find(
      (d) => d.pathname === next.pathname,
    )! as UnloadedMatch<string, LoaderData, TActionPayload, TActionResponse>
    const route = match.route

    return null as any

    // if (!route) {
    //   return {
    //     submit: (() => {}) as any,
    //     pending: [],
    //   }
    // }

    // let action = (this.state.actions[route.id] ||
    //   (() => {
    //     this.state.actions[route.id] = {
    //       submit: null!,
    //       pending: [],
    //     }
    //     return this.state.actions[route.id]!
    //   })()) as Action<TActionPayload, TActionResponse, TActionError>

    // if (!route.action) {
    //   throw new Error(
    //     `Warning: No action was found for "${cleanPath(
    //       matches.map((d) => d.route.path).join('/'),
    //     )}". Please add an 'action' option to this route.`,
    //   )
    // }

    // Object.assign(action, {
    //   route,
    //   submit: async (
    //     submission: TActionPayload,
    //     actionOpts?: { invalidate?: boolean },
    //   ) => {
    //     if (!route) {
    //       return
    //     }
    //     const invalidate = actionOpts?.invalidate ?? true

    //     const actionState: ActionState<
    //       TActionPayload,
    //       TActionResponse,
    //       TActionError
    //     > = {
    //       submittedAt: Date.now(),
    //       status: 'pending',
    //       submission: submission as TActionPayload,
    //     }

    //     action.latest = actionState
    //     action.pending.push(actionState)

    //     if (opts?.isActive) {
    //       this.state.action = actionState as ActionState<
    //         unknown,
    //         unknown,
    //         unknown
    //       >
    //     }

    //     this.notify()

    //     try {
    //       const res = await route.action?.(submission, {
    //         // router: this,
    //         match,
    //       })
    //       actionState.data = res
    //       if (invalidate) {
    //         this.invalidateRoute({ to: '.', fromCurrent: true })
    //         await this.reload()
    //       }
    //       console.log('gone')
    //       actionState.status = 'success'
    //       return res
    //     } catch (err) {
    //       console.error(err)
    //       actionState.error = err as TActionError
    //       actionState.status = 'error'
    //     } finally {
    //       action.pending = action.pending.filter((d) => d !== actionState)
    //       if (actionState === this.state.action) {
    //         this.state.action = undefined
    //       }
    //       this.notify()
    //     }
    //   },
    // })

    // return action
  }

  getOutletElement = (matches: RouteMatch[]): JSX.Element => {
    const match = matches[0]

    const element = ((): React.ReactNode => {
      if (!match) {
        return null
      }

      const errorElement = match.errorElement ?? this.defaultErrorElement

      if (match.status === 'error') {
        if (errorElement) {
          return errorElement as any
        }

        if (!this.useErrorBoundary) {
          return 'An unknown/unhandled error occurred!'
        }

        throw match.error
      }

      if (match.status === 'loading' || match.status === 'idle') {
        if (match.isPending) {
          const pendingElement =
            match.pendingElement ?? this.defaultPendingElement

          if (match.route.options.pendingMs || pendingElement) {
            return (pendingElement as any) ?? null
          }
        }

        return null
      }

      return (match.element as any) ?? this.defaultElement
    })() as JSX.Element

    return element
  }

  resolvePath = (from: string, path: string) => {
    return resolvePath(this.basepath!, from, cleanPath(path))
  }

  matchRoute = (matchLocation: MatchLocation, opts?: MatchRouteOptions) => {
    matchLocation = {
      ...matchLocation,
      to: matchLocation.to
        ? this.resolvePath(
            matchLocation.from || this.rootMatch!.pathname,
            `${matchLocation.to}`,
          )
        : undefined,
    }

    if (opts?.pending) {
      if (!this.state.pending?.location) {
        return undefined
      }
      return matchPathname(this.state.pending.location.pathname, matchLocation)
    }

    return matchPathname(this.state.location.pathname, matchLocation)
  }

  buildLinkInfo = ({
    to = '.' as unknown as never,
    search,
    hash,
    target,
    replace,
    getActiveProps = () => ({ className: 'active' }),
    getInactiveProps = () => ({}),
    activeOptions,
    preload,
    preloadMaxAge: userPreloadMaxAge,
    preloadDelay: userPreloadDelay,
    disabled,
    from,
    ref,
  }: FullLinkOptions): LinkInfo | null => {
    // If this link simply reloads the current route,
    // make sure it has a new key so it will trigger a data refresh

    // If this `to` is a valid external URL, return
    // null for LinkUtils
    try {
      new URL(`${to}`)
      return null
    } catch (e) {}

    const next = this.buildNext({
      to,
      search,
      hash,
      from,
    })

    preload = preload ?? this.defaultLinkPreload
    const preloadMaxAge =
      userPreloadMaxAge ?? this.defaultLinkPreloadMaxAge ?? 2000
    const preloadDelay = userPreloadDelay ?? this.defaultLinkPreloadDelay ?? 50

    // Compare path/hash for matches
    const pathIsEqual = this.state.location.pathname === next.pathname
    const currentPathSplit = this.state.location.pathname.split('/')
    const nextPathSplit = next.pathname.split('/')
    const pathIsFuzzyEqual = nextPathSplit.every(
      (d, i) => d === currentPathSplit[i],
    )
    const hashIsEqual = this.state.location.hash === next.hash
    // Combine the matches based on user options
    const pathTest = activeOptions?.exact ? pathIsEqual : pathIsFuzzyEqual
    const hashTest = activeOptions?.includeHash ? hashIsEqual : true

    // The final "active" test
    const isActive = pathTest && hashTest

    // Get the active props
    const activeProps = isActive ? getActiveProps() : {}

    // Get the inactive props
    const inactiveProps = isActive ? {} : getInactiveProps()

    // The click handler
    const handleClick = (e: MouseEvent) => {
      if (
        !disabled &&
        !isCtrlEvent(e) &&
        !e.defaultPrevented &&
        (!target || target === '_self') &&
        e.button === 0
      ) {
        e.preventDefault()
        if (pathIsEqual && !search && !hash) {
          this.invalidateRoute({
            to,
            from,
          })
        }

        // All is well? Navigate!)
        this.navigate({
          to,
          search,
          hash,
          replace,
          from,
        })
      }
    }

    // The click handler
    const handleFocus = (e: MouseEvent) => {
      if (preload && preloadMaxAge > 0) {
        this.loadRoute(
          {
            to,
            search,
            hash,
            from,
          },
          { maxAge: preloadMaxAge },
        )
      }
    }

    const handleEnter = (e: MouseEvent) => {
      if (preload && preloadMaxAge > 0) {
        if (ref.preloadTimeout) {
          return
        }

        ref.preloadTimeout = setTimeout(() => {
          ref.preloadTimeout = null
          this.loadRoute(
            {
              to,
              search,
              hash,
              from,
            },
            { maxAge: preloadMaxAge },
          )
        }, preloadDelay)
      }
    }

    const handleLeave = (e: MouseEvent) => {
      if (ref.preloadTimeout) {
        clearTimeout(ref.preloadTimeout)
        ref.preloadTimeout = null
      }
    }

    return {
      next,
      handleFocus,
      handleClick,
      handleEnter,
      handleLeave,
      activeProps,
      inactiveProps,
      isActive,
    }
  }

  __experimental__createSnapshot = (): __Experimental__RouterSnapshot => {
    return {
      ...this.state,
      matches: this.state.matches.map(({ loaderData, id }) => {
        return {
          id,
          loaderData,
        }
      }),
    }
  }
}

export class Route<
  TRootRoute extends AnyRouteDef = AnyRouteDef,
  TId extends string = string,
  TPath extends string = string,
  TLoaderData extends LoaderData = {},
  TAllLoaderData extends LoaderData = {},
  TActionPayload = unknown,
  TActionResponse = unknown,
  TSearchZod extends SearchZod = {},
  TSearchSchema extends AnySearchSchema = {},
  TParentParams extends PathParams = PathParams,
  TParams extends PathParams = PathParams,
  TAllParams extends PathParams = TParams,
> {
  types!: {
    RootRoute: TRootRoute
    Id: TId
    Path: TPath
    LoaderData: TLoaderData
    AllLoaderData: TAllLoaderData
    ActionPayload: TActionPayload
    ActionResponse: TActionResponse
    SearchZod: TSearchZod
    SearchSchema: TSearchSchema
    ParentParams: TParentParams
    Params: TParams
    AllParams: TAllParams
  }
  id: TId
  parent?: Route
  children?: Route[]
  router: Router<any>
  options: RouteOptions<
    TPath,
    TLoaderData,
    TAllLoaderData,
    TActionPayload,
    TActionResponse,
    TSearchZod,
    TSearchSchema,
    TParentParams,
    TParams,
    TAllParams
  >

  constructor(
    options: RouteOptions<
      TPath,
      TLoaderData,
      TAllLoaderData,
      TActionPayload,
      TActionResponse,
      TSearchZod,
      TSearchSchema,
      TParentParams,
      TParams,
      TAllParams
    >,
    parent: undefined | Route,
    router: Router<TRootRoute>,
  ) {
    if (!options.path) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Routes must have a path property.')
      }
      throw new Error()
    }

    this.id = (
      options.path === rootRouteId
        ? rootRouteId
        : joinPaths([
            parent!.id,
            `${options.path?.replace(/(.)\/$/, '$1')}`,
          ]).replace(new RegExp(`^${rootRouteId}`), '')
    ) as TId

    this.options = options
    this.parent = parent
    this.router = router! as any
  }

  getLoaderData = (): TAllLoaderData => {
    return null as any
  }

  getAction = (): Action<TActionPayload, TActionResponse> => {
    return null as any
  }

  linkProps = <
    TRoutesInfo extends RoutesInfo<TRootRoute>,
    // TId extends string = string,
    // TPath extends string = string,
    // TLoaderData extends LoaderData = {},
    // TAllLoaderData extends LoaderData = {},
    // TActionPayload extends any = any,
    // TActionResponse extends any = any,
    // TSearchZod extends SearchZod = {},
    // TSearchSchema extends AnySearchSchema = {},
    // TRouteDefs extends AnyRouteDef = AnyRouteDef,
    TTo extends keyof TRoutesInfo['routesByPath'],
    // TFromRoutePath extends string = '',
    // TFrom extends string = '/',
    // TToResolved extends string = ResolvePath<TFrom, TTo>,
  >(
    options: {
      // fromRoute?: TRoute
      // The absolute or relative route path
      to?: TTo
      // The new search object or a function to update it
      // search?: true | Updater<SearchSchema, TRoutesInfo['routesById'][TTo]>
      // The new has string or a function to update it
      hash?: Updater<string>
      // Whether to replace the current history stack instead of pushing a new one
      replace?: boolean
      // The standard anchor tag target attribute
      target?: HTMLAnchorElement['target']
      // A function that is passed the [Location API](#location-api) and returns additional props for the `active` state of this link. These props override other props passed to the link (`style`'s are merged, `className`'s are concatenated)
      getActiveProps?: () => GetFrameworkGeneric<'LinkProps'>
      // A function that is passed the [Location API](#location-api) and returns additional props for the `inactive` state of this link. These props override other props passed to the link (`style`'s are merged, `className`'s are concatenated)
      getInactiveProps?: () => GetFrameworkGeneric<'LinkProps'>
      // Defaults to `{ exact: false, includeHash: false }`
      activeOptions?: ActiveOptions
      // If set, will preload the linked route on hover and cache it for this many milliseconds in hopes that the user will eventually navigate there.
      preload?: false | 'intent'
      // When preloaded and set, will cache the preloaded result for this duration in milliseconds
      preloadMaxAge?: number
      // Delay intent preloading by this many milliseconds. If the intent exits before this delay, the preload will be cancelled.
      preloadDelay?: number
      // If true, will render the link without the href attribute
      disabled?: boolean
      // The root (excluding the basepath) from which to resolve the route.
      // Defaults to the current location's pathname.
      // To navigate from the root, pass `/` as the from
      from?: (arg: TRoutesInfo['routesByPath'][TTo]) => void
      // from?: TFrom
    } & PathParamOptions<
      TParams,
      TRoutesInfo['routesByPath'][TTo]['types']['AllParams']
    >,
  ) => {}
}

type RouteById<TRoutesById, TRouteId> = Record<
  string,
  AnyRoute
> extends TRoutesById
  ? Route
  : TRoutesById extends Record<string, AnyRoute>
  ? TRouteId extends keyof TRoutesById
    ? TRoutesById[TRouteId]
    : never
  : never

type PathParamOptions<TPrevParams, TNextParams> = PathParams extends TNextParams
  ? {
      params?: {
        [x: string]: never
      }
    }
  : {
      // The params to interpolate into the destination route
      params: TNextParams | ((current: TPrevParams) => TNextParams)
    }

export class RouteMatch<
  TRootRoute extends AnyRouteDef = AnyRouteDef,
  TId extends string = string,
  TPath extends string = string,
  TLoaderData extends LoaderData = {},
  TAllLoaderData extends LoaderData = {},
  TActionPayload = unknown,
  TActionResponse = unknown,
  TSearchZod extends SearchZod = {},
  TSearchSchema extends AnySearchSchema = {},
  TParams extends PathParams = PathParams,
> {
  id!: string
  router: unknown
  parentMatch?: RouteMatch
  route!: Route<
    TRootRoute,
    TId,
    TPath,
    TLoaderData,
    TAllLoaderData,
    TActionPayload,
    TActionResponse,
    TSearchZod,
    TSearchSchema,
    TParams
  >
  pathname!: string
  params!: TParams
  search!: TSearchSchema
  updatedAt?: number
  element?: GetFrameworkGeneric<'Element', TLoaderData>
  errorElement?: GetFrameworkGeneric<'Element', TLoaderData>
  catchElement?: GetFrameworkGeneric<'Element', TLoaderData>
  pendingElement?: GetFrameworkGeneric<'Element', TLoaderData>
  error?: unknown
  loaderPromise?: Promise<void>
  importPromise?: Promise<void>
  elementsPromise?: Promise<void>
  dataPromise?: Promise<void>
  pendingTimeout?: Timeout
  pendingMinPromise?: Promise<void>
  onExit?:
    | void
    | ((
        match: RouteMatch<
          TRootRoute,
          TId,
          TPath,
          TLoaderData,
          TAllLoaderData,
          TActionPayload,
          TActionResponse,
          TSearchZod,
          TSearchSchema,
          TParams
        >,
      ) => void)
  isInvalid = false

  constructor(
    router: Router<any, any>,
    unloadedMatch: UnloadedMatch<
      TPath,
      TLoaderData,
      TActionPayload,
      TActionResponse
    >,
  ) {
    this.router = router
    Object.assign(this, unloadedMatch)
  }

  status: 'idle' | 'loading' | 'success' | 'error' = 'idle'
  loaderData: TLoaderData = {} as TLoaderData
  isPending: boolean = false
  isFetching: boolean = false
  abortController = new AbortController()
  resolve = () => {}

  notify = () => {
    this.resolve()
    ;(this.router as Router).notify()
  }

  cancel = () => {
    this.abortController?.abort()
    this.cancelPending()
  }

  startPending = () => {
    if (
      this.pendingTimeout ||
      this.status !== 'loading' ||
      typeof this.route.options.pendingMs === 'undefined'
    ) {
      return
    }

    this.pendingTimeout = setTimeout(() => {
      this.isPending = true
      this.resolve()
      if (typeof this.route.options.pendingMinMs !== 'undefined') {
        this.pendingMinPromise = new Promise((r) =>
          setTimeout(r, this.route.options.pendingMinMs),
        )
      }
    }, this.route.options.pendingMs)
  }

  cancelPending = () => {
    this.isPending = false
    clearTimeout(this.pendingTimeout)
  }

  setParentMatch = (parentMatch?: RouteMatch) => {
    this.parentMatch = parentMatch
  }

  latestId = ''

  load = () => {
    const id = '' + Date.now() + Math.random()
    this.latestId = id
    // If the match was in an error state, set it
    // to a loading state again. Otherwise, keep it
    // as loading or resolved
    if (this.status === 'error' || this.status === 'idle') {
      this.status = 'loading'
    }

    // We are now fetching, even if it's in the background of a
    // resolved state
    this.isFetching = true

    // We started loading the route, so it's no longer invalid
    this.isInvalid = false

    return new Promise(async (resolve) => {
      this.resolve = resolve as () => void

      const loaderPromise = (async () => {
        const importer = this.route.options.import

        // First, run any importers
        if (importer) {
          this.importPromise = importer({
            params: this.params,
            // search: this.search,
          }).then((imported) => {
            this.route = {
              ...this.route,
              ...imported,
            }
          })
        }

        // Wait for the importer to finish before
        // attempting to load elements and data
        await this.importPromise

        // Next, load the elements and data in parallel

        this.elementsPromise = (async () => {
          // then run all element and data loaders in parallel
          // For each element type, potentially load it asynchronously
          const elementTypes = [
            'element',
            'errorElement',
            'catchElement',
            'pendingElement',
          ] as const

          await Promise.all(
            elementTypes.map(async (type) => {
              const routeElement = this.route.options[type]

              if (this[type]) {
                return
              }

              if (typeof routeElement === 'function') {
                const res = await (routeElement as any)(this)

                this[type] = res
              } else {
                this[type] = this.route.options[type] as any
              }
            }),
          )
        })()

        this.dataPromise = Promise.resolve().then(async () => {
          try {
            const data = await this.route.options.loader?.(this as any, {
              match: this as any,
              signal: this.abortController.signal,
              // router: this.router,
            })
            if (id !== this.latestId) {
              return this.loaderPromise
            }

            this.loaderData = replaceEqualDeep(
              this.loaderData,
              data || ({} as TLoaderData),
            )
            this.error = undefined
            this.status = 'success'
            this.updatedAt = Date.now()
          } catch (err) {
            if (id !== this.latestId) {
              return this.loaderPromise
            }

            if (process.env.NODE_ENV !== 'production') {
              console.error(err)
            }
            this.error = err
            this.status = 'error'
            this.updatedAt = Date.now()
          }
        })

        try {
          await Promise.all([this.elementsPromise, this.dataPromise])
          if (id !== this.latestId) {
            return this.loaderPromise
          }

          if (this.pendingMinPromise) {
            await this.pendingMinPromise
            delete this.pendingMinPromise
          }
        } finally {
          if (id !== this.latestId) {
            return this.loaderPromise
          }
          this.cancelPending()
          this.isPending = false
          this.isFetching = false
          this.notify()
        }
      })()

      this.loaderPromise = loaderPromise
      await loaderPromise

      if (id !== this.latestId) {
        return this.loaderPromise
      }
      delete this.loaderPromise
    })
  }
}

export function matchPathname(
  currentPathname: string,
  matchLocation: Pick<MatchLocation, 'to' | 'fuzzy' | 'caseSensitive'>,
): PathParams | undefined {
  const pathParams = matchByPath(currentPathname, matchLocation)
  // const searchMatched = matchBySearch(currentLocation.search, matchLocation)

  if (matchLocation.to && !pathParams) {
    return
  }

  // if (matchLocation.search && !searchMatched) {
  //   return
  // }

  return pathParams ?? {}
}

function interpolatePath(
  path: string | undefined,
  params: any,
  leaveWildcard?: boolean,
) {
  const interpolatedPathSegments = parsePathname(path)

  return joinPaths(
    interpolatedPathSegments.map((segment) => {
      if (segment.value === '*' && !leaveWildcard) {
        return ''
      }

      if (segment.type === 'param') {
        return params![segment.value.substring(1)] ?? ''
      }

      return segment.value
    }),
  )
}

export function warning(cond: any, message: string): cond is true {
  if (!cond) {
    if (typeof console !== 'undefined') console.warn(message)

    try {
      throw new Error(message)
    } catch {}
  }

  return true
}

function isFunction(d: any): d is Function {
  return typeof d === 'function'
}

export function functionalUpdate<TResult>(
  updater?: Updater<TResult>,
  previous?: TResult,
) {
  if (isFunction(updater)) {
    return updater(previous as TResult)
  }

  return updater
}

function joinPaths(paths: (string | undefined)[]) {
  return cleanPath(paths.filter(Boolean).join('/'))
}

export function cleanPath(path: string) {
  // remove double slashes
  return `${path}`.replace(/\/{2,}/g, '/')
}

export function matchByPath(
  from: string,
  matchLocation: Pick<MatchLocation, 'to' | 'caseSensitive' | 'fuzzy'>,
): Record<string, string> | undefined {
  const baseSegments = parsePathname(from)
  const routeSegments = parsePathname(`${matchLocation.to ?? '*'}`)

  const params: Record<string, string> = {}

  let isMatch = (() => {
    for (
      let i = 0;
      i < Math.max(baseSegments.length, routeSegments.length);
      i++
    ) {
      const baseSegment = baseSegments[i]
      const routeSegment = routeSegments[i]

      const isLastRouteSegment = i === routeSegments.length - 1
      const isLastBaseSegment = i === baseSegments.length - 1

      if (routeSegment) {
        if (routeSegment.type === 'wildcard') {
          if (baseSegment?.value) {
            params['*'] = joinPaths(baseSegments.slice(i).map((d) => d.value))
            return true
          }
          return false
        }

        if (routeSegment.type === 'pathname') {
          if (routeSegment.value === '/' && !baseSegment?.value) {
            return true
          }

          if (baseSegment) {
            if (matchLocation.caseSensitive) {
              if (routeSegment.value !== baseSegment.value) {
                return false
              }
            } else if (
              routeSegment.value.toLowerCase() !==
              baseSegment.value.toLowerCase()
            ) {
              return false
            }
          }
        }

        if (!baseSegment) {
          return false
        }

        if (routeSegment.type === 'param') {
          params[routeSegment.value.substring(1)] = baseSegment.value
        }
      }

      if (isLastRouteSegment && !isLastBaseSegment) {
        return !!matchLocation.fuzzy
      }
    }
    return true
  })()

  return isMatch ? (params as Record<string, string>) : undefined
}

// function matchBySearch(
//   search: SearchSchemazzzzz,
//   matchLocation: MatchLocation,
// ) {
//   return !!(matchLocation.search && matchLocation.search(search))
// }

export function parsePathname(pathname?: string): Segment[] {
  if (!pathname) {
    return []
  }

  pathname = cleanPath(pathname)

  const segments: Segment[] = []

  if (pathname.slice(0, 1) === '/') {
    pathname = pathname.substring(1)
    segments.push({
      type: 'pathname',
      value: '/',
    })
  }

  if (!pathname) {
    return segments
  }

  // Remove empty segments and '.' segments
  const split = pathname.split('/').filter(Boolean)

  segments.push(
    ...split.map((part): Segment => {
      if (part.startsWith('*')) {
        return {
          type: 'wildcard',
          value: part,
        }
      }

      if (part.charAt(0) === ':') {
        return {
          type: 'param',
          value: part,
        }
      }

      return {
        type: 'pathname',
        value: part,
      }
    }),
  )

  if (pathname.slice(-1) === '/') {
    pathname = pathname.substring(1)
    segments.push({
      type: 'pathname',
      value: '/',
    })
  }

  return segments
}

export function resolvePath(basepath: string, base: string, to: string) {
  base = base.replace(new RegExp(`^${basepath}`), '/')
  to = to.replace(new RegExp(`^${basepath}`), '/')

  let baseSegments = parsePathname(base)
  const toSegments = parsePathname(to)

  toSegments.forEach((toSegment, index) => {
    if (toSegment.value === '/') {
      if (!index) {
        // Leading slash
        baseSegments = [toSegment]
      } else if (index === toSegments.length - 1) {
        // Trailing Slash
        baseSegments.push(toSegment)
      } else {
        // ignore inter-slashes
      }
    } else if (toSegment.value === '..') {
      // Extra trailing slash? pop it off
      if (baseSegments.length > 1 && last(baseSegments)?.value === '/') {
        baseSegments.pop()
      }
      baseSegments.pop()
    } else if (toSegment.value === '.') {
      return
    } else {
      baseSegments.push(toSegment)
    }
  })

  const joined = joinPaths([basepath, ...baseSegments.map((d) => d.value)])

  return cleanPath(joined)
}

/**
 * This function returns `a` if `b` is deeply equal.
 * If not, it will replace any deeply equal children of `b` with those of `a`.
 * This can be used for structural sharing between JSON values for example.
 */
export function replaceEqualDeep(prev: any, next: any) {
  if (prev === next) {
    return prev
  }

  const array = Array.isArray(prev) && Array.isArray(next)

  if (array || (isPlainObject(prev) && isPlainObject(next))) {
    const aSize = array ? prev.length : Object.keys(prev).length
    const bItems = array ? next : Object.keys(next)
    const bSize = bItems.length
    const copy: any = array ? [] : {}

    let equalItems = 0

    for (let i = 0; i < bSize; i++) {
      const key = array ? i : bItems[i]
      copy[key] = replaceEqualDeep(prev[key], next[key])
      if (copy[key] === prev[key]) {
        equalItems++
      }
    }

    return aSize === bSize && equalItems === aSize ? prev : copy
  }

  return next
}

// Copied from: https://github.com/jonschlinkert/is-plain-object
function isPlainObject(o: any) {
  if (!hasObjectPrototype(o)) {
    return false
  }

  // If has modified constructor
  const ctor = o.constructor
  if (typeof ctor === 'undefined') {
    return true
  }

  // If has modified prototype
  const prot = ctor.prototype
  if (!hasObjectPrototype(prot)) {
    return false
  }

  // If constructor does not have an Object-specific method
  if (!prot.hasOwnProperty('isPrototypeOf')) {
    return false
  }

  // Most likely a plain Object
  return true
}

function hasObjectPrototype(o: any) {
  return Object.prototype.toString.call(o) === '[object Object]'
}

export const defaultParseSearch = parseSearchWith(JSON.parse)
export const defaultStringifySearch = stringifySearchWith(JSON.stringify)

export function parseSearchWith(parser: (str: string) => any) {
  return (searchStr: string): Record<string, any> => {
    if (searchStr.substring(0, 1) === '?') {
      searchStr = searchStr.substring(1)
    }

    let query: Record<string, unknown> = decode(searchStr)

    // Try to parse any query params that might be json
    for (let key in query) {
      const value = query[key]
      if (typeof value === 'string') {
        try {
          query[key] = parser(value)
        } catch (err) {
          //
        }
      }
    }

    return query
  }
}

export function stringifySearchWith(stringify: (search: any) => string) {
  return (search: Record<string, any>) => {
    search = { ...search }

    if (search) {
      Object.keys(search).forEach((key) => {
        const val = search[key]
        if (typeof val === 'undefined' || val === undefined) {
          delete search[key]
        } else if (val && typeof val === 'object' && val !== null) {
          try {
            search[key] = stringify(val)
          } catch (err) {
            // silent
          }
        }
      })
    }

    const searchStr = encode(search as Record<string, string>).toString()

    return searchStr ? `?${searchStr}` : ''
  }
}

function isCtrlEvent(e: MouseEvent) {
  return !!(e.metaKey || e.altKey || e.ctrlKey || e.shiftKey)
}

function last<T>(arr: T[]) {
  return arr[arr.length - 1]
}
