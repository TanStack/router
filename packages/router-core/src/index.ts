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

export { createHashHistory, createBrowserHistory, createMemoryHistory }

import { decode, encode } from './qss'

// Types

export type NoInfer<T> = [T][T extends any ? 0 : never]
export type IsAny<T, Y, N> = 1 extends 0 & T ? Y : N
export type IsAnyBoolean<T> = 1 extends 0 & T ? true : false
export type IsKnown<T, Y, N> = unknown extends T ? N : Y
export type PickAsRequired<T, K extends keyof T> = Omit<T, K> &
  Required<Pick<T, K>>
export type PickAsPartial<T, K extends keyof T> = Omit<T, K> &
  Partial<Pick<T, K>>
export type PickUnsafe<T, K> = K extends keyof T ? Pick<T, K> : never
export type PickExtra<T, K> = Expand<{
  [TKey in keyof K as string extends TKey
    ? never
    : TKey extends keyof T
    ? never
    : TKey]: K[TKey]
}>
type PickRequired<T> = {
  [K in keyof T as undefined extends T[K] ? never : K]: T[K]
}
// type LooseAutocomplete<T> = T extends string ? T | Omit<string, T> : never
type StartsWith<A, B> = A extends `${B extends string ? B : never}${infer _}`
  ? true
  : false
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

export interface FrameworkGenerics {
  // The following properties are used internally
  // and are extended by framework adapters, but cannot be
  // pre-defined as constraints:
  //
  // Element: any
  // AsyncElement: any
  // SyncOrAsyncElement?: any
}

export interface RouteConfig<
  TId extends string = string,
  TPath extends string = string,
  TFullPath extends string = string,
  TLoaderData extends AnyLoaderData = AnyLoaderData,
  TAllLoaderData extends AnyLoaderData = AnyLoaderData,
  TActionPayload = unknown,
  TActionResponse = unknown,
  TParentSearchSchema extends {} = {},
  TSearchSchema extends AnySearchSchema = {},
  TFullSearchSchema extends AnySearchSchema = {},
  TParentParams extends AnyPathParams = {},
  TParams extends Record<ParsePathParams<TPath>, unknown> = Record<
    ParsePathParams<TPath>,
    string
  >,
  TAllParams extends AnyPathParams = {},
  TKnownChildren = unknown,
> {
  id: TId
  path: NoInfer<TPath>
  fullPath: TFullPath
  options: RouteOptions<
    TPath,
    TLoaderData,
    TAllLoaderData,
    TActionPayload,
    TActionResponse,
    TParentSearchSchema,
    TSearchSchema,
    TFullSearchSchema,
    TParentParams,
    TParams,
    TAllParams
  >
  children?: TKnownChildren
  addChildren: IsAny<
    TId,
    any,
    <TNewChildren extends any>(
      cb: (
        createChildRoute: CreateRouteConfigFn<
          false,
          TId,
          TAllLoaderData,
          TFullSearchSchema,
          TAllParams
        >,
      ) => TNewChildren extends AnyRouteConfig[]
        ? TNewChildren
        : { error: 'Invalid route detected'; route: TNewChildren },
    ) => RouteConfig<
      TId,
      TPath,
      TFullPath,
      TLoaderData,
      TAllLoaderData,
      TActionPayload,
      TActionResponse,
      TParentSearchSchema,
      TSearchSchema,
      TFullSearchSchema,
      TParentParams,
      TParams,
      TAllParams,
      TNewChildren
    >
  >
}

type CreateRouteConfigFn<
  TIsRoot extends boolean = false,
  TParentId extends string = string,
  TParentAllLoaderData extends AnyLoaderData = {},
  TParentSearchSchema extends AnySearchSchema = {},
  TParentParams extends AnyPathParams = {},
> = <
  TPath extends string,
  TLoaderData extends AnyLoaderData,
  TActionPayload,
  TActionResponse,
  TSearchSchema extends AnySearchSchema = AnySearchSchema,
  TParams extends Record<ParsePathParams<TPath>, unknown> = Record<
    ParsePathParams<TPath>,
    string
  >,
  TAllParams extends AnyPathParams extends TParams
    ? Record<ParsePathParams<TPath>, string>
    : NoInfer<TParams> = AnyPathParams extends TParams
    ? Record<ParsePathParams<TPath>, string>
    : NoInfer<TParams>,
  TKnownChildren extends RouteConfig[] = RouteConfig[],
>(
  options?: TIsRoot extends true
    ? Omit<
        RouteOptions<
          TPath,
          TLoaderData,
          Expand<TParentAllLoaderData & DeepAwaited<NoInfer<TLoaderData>>>,
          TActionPayload,
          TActionResponse,
          TParentSearchSchema,
          TSearchSchema,
          Expand<TParentSearchSchema & TSearchSchema>,
          TParentParams,
          TParams,
          Expand<TParentParams & TAllParams>
        >,
        'path'
      > & { path?: never }
    : RouteOptions<
        TPath,
        TLoaderData,
        Expand<TParentAllLoaderData & DeepAwaited<NoInfer<TLoaderData>>>,
        TActionPayload,
        TActionResponse,
        TParentSearchSchema,
        TSearchSchema,
        Expand<TParentSearchSchema & TSearchSchema>,
        TParentParams,
        TParams,
        Expand<TParentParams & TAllParams>
      >,
  children?: TKnownChildren,
  isRoot?: boolean,
  parentId?: string,
) => RouteConfig<
  RouteId<TParentId, TPath>,
  TPath,
  RouteIdToPath<RouteId<TParentId, TPath>>,
  TLoaderData,
  Expand<TParentAllLoaderData & DeepAwaited<NoInfer<TLoaderData>>>,
  TActionPayload,
  TActionResponse,
  TParentSearchSchema,
  TSearchSchema,
  Expand<TParentSearchSchema & TSearchSchema>,
  TParentParams,
  TParams,
  Expand<TParentParams & TAllParams>,
  TKnownChildren
>

export const createRouteConfig: CreateRouteConfigFn<true> = (
  options = {} as any,
  children,
  isRoot = true,
  parentId,
) => {
  if (isRoot) {
    ;(options as any).path = rootRouteId
  } else {
    warning(!options.path, 'Routes must have a path property.')
  }

  // Strip the root from parentIds
  if (parentId === rootRouteId) {
    parentId = ''
  }

  let path = String(isRoot ? rootRouteId : options.path)

  // If the path is anything other than an index path, trim it up
  if (path !== '/') {
    path = trimPath(path)
  }

  let id = joinPaths([parentId, path])

  if (path === rootRouteId) {
    path = '/'
  }

  if (id !== rootRouteId) {
    id = joinPaths(['/', id])
  }

  const fullPath = id === rootRouteId ? '/' : trimPathRight(id)

  return {
    id: id as any,
    path: path as any,
    fullPath: fullPath as any,
    options: options as any,
    children,
    addChildren: (cb: any) =>
      createRouteConfig(
        options,
        cb((childOptions: any) =>
          createRouteConfig(childOptions, undefined, false, id),
        ),
        false,
        parentId,
      ),
  }
}

export interface AnyRouteConfig
  extends RouteConfig<
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
    any,
    any
  > {}

export interface AnyRouteConfigWithChildren<TChildren>
  extends RouteConfig<
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
    any,
    any,
    TChildren
  > {}

export interface AnyAllRouteInfo {
  routeConfig: AnyRouteConfig
  routeInfo: AnyRouteInfo
  routeInfoById: Record<string, AnyRouteInfo>
  routeInfoByFullPath: Record<string, AnyRouteInfo>
  fullPath: string
}

export interface DefaultAllRouteInfo {
  routeConfig: RouteConfig
  routeInfo: RouteInfo
  routeInfoById: Record<string, RouteInfo>
  routeInfoByFullPath: Record<string, RouteInfo>
  fullPath: string
}

export interface AllRouteInfo<TRouteConfig extends AnyRouteConfig = RouteConfig>
  extends RoutesInfoInner<TRouteConfig, ParseRouteConfig<TRouteConfig>> {}

export interface RoutesInfoInner<
  TRouteConfig extends AnyRouteConfig,
  TRouteInfo extends RouteInfo<
    string,
    string,
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
  > = RouteInfo,
> {
  routeConfig: TRouteConfig
  routeInfo: TRouteInfo
  routeInfoById: {
    [TInfo in TRouteInfo as TInfo['id']]: TInfo
  }
  routeInfoByFullPath: {
    [TInfo in TRouteInfo as TInfo['id'] extends RootRouteId
      ? never
      : RouteIdToPath<TInfo['id']>]: TInfo
  }
  fullPath: RouteIdToPath<TRouteInfo['id']>
}

export interface AnyRoute extends Route<any, any> {}
export interface AnyRouteInfo
  extends RouteInfo<
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
    any,
    any
  > {}

// type IndexObj<T extends Record<string, any>, TKey extends keyof T> = {
//   [E in T as E[TKey]]: E
// }

type RouteIdToPath<T extends string> = T extends RootRouteId
  ? '/'
  : TrimPathRight<`${T}`>

type ParseRouteConfig<TRouteConfig = AnyRouteConfig> =
  TRouteConfig extends AnyRouteConfig
    ? RouteConfigRoute<TRouteConfig> | ParseRouteChildren<TRouteConfig>
    : never

type ParseRouteChildren<TRouteConfig> =
  TRouteConfig extends AnyRouteConfigWithChildren<infer TChildren>
    ? unknown extends TChildren
      ? never
      : TChildren extends AnyRouteConfig[]
      ? Values<{
          [TId in TChildren[number]['id']]: ParseRouteChild<
            TChildren[number],
            TId
          >
        }>
      : never // Children are not routes
    : never // No children

type ParseRouteChild<TRouteConfig, TId> = TRouteConfig & {
  id: TId
} extends AnyRouteConfig
  ? ParseRouteConfig<TRouteConfig>
  : never

export type Values<O> = O[ValueKeys<O>]
export type ValueKeys<O> = Extract<keyof O, PropertyKey>

export type RouteConfigRoute<TRouteConfig> = TRouteConfig extends RouteConfig<
  infer TId,
  infer TPath,
  infer TFullPath,
  infer TLoaderData,
  infer TAllLoaderData,
  infer TActionPayload,
  infer TActionResponse,
  infer TParentSearchSchema,
  infer TSearchSchema,
  infer TFullSearchSchema,
  infer TParentParams,
  infer TParams,
  infer TAllParams,
  any
>
  ? string extends TId
    ? never
    : RouteInfo<
        TId,
        TPath,
        TFullPath,
        TLoaderData,
        TAllLoaderData,
        TActionPayload,
        TActionResponse,
        TParentSearchSchema,
        TSearchSchema,
        TFullSearchSchema,
        TParentParams,
        TParams,
        TAllParams
      >
  : never

export interface RouteInfo<
  TId extends string = string,
  TPath extends string = string,
  TFullPath extends {} = string,
  TLoaderData extends AnyLoaderData = {},
  TAllLoaderData extends AnyLoaderData = {},
  TActionPayload = unknown,
  TActionResponse = unknown,
  TParentSearchSchema extends {} = {},
  TSearchSchema extends AnySearchSchema = {},
  TFullSearchSchema extends AnySearchSchema = {},
  TParentParams extends AnyPathParams = {},
  TParams extends Record<ParsePathParams<TPath>, unknown> = Record<
    ParsePathParams<TPath>,
    string
  >,
  TAllParams extends AnyPathParams = {},
> {
  id: TId
  path: TPath
  fullPath: TFullPath
  loaderData: TLoaderData
  allLoaderData: TAllLoaderData
  actionPayload: TActionPayload
  actionResponse: TActionResponse
  searchSchema: TSearchSchema
  fullSearchSchema: TFullSearchSchema
  parentParams: TParentParams
  params: TParams
  allParams: TAllParams
  options: RouteOptions<
    TPath,
    TLoaderData,
    TAllLoaderData,
    TActionPayload,
    TActionResponse,
    TParentSearchSchema,
    TSearchSchema,
    TFullSearchSchema,
    TParentParams,
    TParams,
    TAllParams
  >
}

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

export type PathParamMask<TRoutePath extends string> =
  TRoutePath extends `${infer L}/:${infer C}/${infer R}`
    ? PathParamMask<`${L}/${string}/${R}`>
    : TRoutePath extends `${infer L}/:${infer C}`
    ? PathParamMask<`${L}/${string}`>
    : TRoutePath

type Split<S, D extends string = '/'> = S extends unknown
  ? string extends S
    ? string[]
    : S extends string
    ? CleanPath<S> extends ''
      ? []
      : CleanPath<S> extends `${infer T}${D}${infer U}`
      ? [T, ...Split<U, D>]
      : [S]
    : never
  : never

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

export type AnySearchSchema = {}
export type AnyLoaderData = {}
export type AnyPathParams = {}
export interface RouteMeta {}
export interface LocationState {}

type Timeout = ReturnType<typeof setTimeout>

export type SearchSerializer = (searchObj: Record<string, any>) => string
export type SearchParser = (searchStr: string) => Record<string, any>

export type Updater<TPrevious, TResult = TPrevious> =
  | TResult
  | ((prev?: TPrevious) => TResult)

export interface Location<
  TSearchObj extends AnySearchSchema = {},
  TState extends LocationState = LocationState,
> {
  href: string
  pathname: string
  search: TSearchObj
  searchStr: string
  state: TState
  hash: string
  key?: string
}

export interface FromLocation {
  pathname: string
  search?: unknown
  key?: string
  hash?: string
}

export type PickExtract<T, U> = {
  [K in keyof T as T[K] extends U ? K : never]: T[K]
}

export type PickExclude<T, U> = {
  [K in keyof T as T[K] extends U ? never : K]: T[K]
}

export type SearchSchemaValidator<TReturn, TParentSchema> = (
  searchObj: Record<string, unknown>,
) => {} extends TParentSchema
  ? TReturn
  : keyof TReturn extends keyof TParentSchema
  ? {
      error: 'Top level search params cannot be redefined by child routes!'
      keys: keyof TReturn & keyof TParentSchema
    }
  : TReturn

export type DefinedPathParamWarning =
  'Path params cannot be redefined by child routes!'

export type ParentParams<TParentParams> = AnyPathParams extends TParentParams
  ? {}
  : {
      [Key in keyof TParentParams]?: DefinedPathParamWarning
    }

export type RouteOptions<
  TPath extends string = string,
  TLoaderData extends AnyLoaderData = {},
  TAllLoaderData extends AnyLoaderData = {},
  TActionPayload = unknown,
  TActionResponse = unknown,
  TParentSearchSchema extends {} = {},
  TSearchSchema extends AnySearchSchema = {},
  TFullSearchSchema extends AnySearchSchema = TSearchSchema,
  TParentParams extends AnyPathParams = {},
  TParams extends Record<ParsePathParams<TPath>, unknown> = Record<
    ParsePathParams<TPath>,
    string
  >,
  TAllParams extends AnyPathParams = {},
> = {
  // The path to match (relative to the nearest parent `Route` component or root basepath)
  path: TPath
  // If true, this route will be matched as case-sensitive
  caseSensitive?: boolean
  validateSearch?: SearchSchemaValidator<TSearchSchema, TParentSearchSchema>
  // Filter functions that can manipulate search params *before* they are passed to links and navigate
  // calls that match this route.
  preSearchFilters?: SearchFilter<TFullSearchSchema>[]
  // Filter functions that can manipulate search params *after* they are passed to links and navigate
  // calls that match this route.
  postSearchFilters?: SearchFilter<TFullSearchSchema>[]
  // The duration to wait during `loader` execution before showing the `pendingElement`
  pendingMs?: number
  // _If the `pendingElement` is shown_, the minimum duration for which it will be visible.
  pendingMinMs?: number
  // // An array of child routes
  // children?: Route<any, any, any, any>[]
} & (
  | {
      parseParams?: never
      stringifyParams?: never
    }
  | {
      // Parse params optionally receives path params as strings and returns them in a parsed format (like a number or boolean)
      parseParams: (
        rawParams: IsAny<TPath, any, Record<ParsePathParams<TPath>, string>>,
      ) => TParams
      stringifyParams: (
        params: TParams,
      ) => Record<ParsePathParams<TPath>, string>
    }
) &
  RouteLoaders<
    // Route Loaders (see below) can be inline on the route, or resolved async
    TLoaderData,
    TAllLoaderData,
    TActionPayload,
    TActionResponse,
    TFullSearchSchema,
    TAllParams
  > & {
    // If `import` is defined, this route can resolve its elements and loaders in a single asynchronous call
    // This is particularly useful for code-splitting or module federation
    import?: (opts: {
      params: AnyPathParams
    }) => Promise<
      RouteLoaders<
        TLoaderData,
        TAllLoaderData,
        TActionPayload,
        TActionResponse,
        TFullSearchSchema,
        TAllParams
      >
    >
  } & (PickUnsafe<TParentParams, ParsePathParams<TPath>> extends never // Detect if an existing path param is being redefined
    ? {}
    : 'Cannot redefined path params in child routes!')

export interface RouteLoaders<
  TLoaderData extends AnyLoaderData = {},
  TAllLoaderData extends AnyLoaderData = {},
  TActionPayload = unknown,
  TActionData = unknown,
  TFullSearchSchema extends AnySearchSchema = {},
  TAllParams extends AnyPathParams = {},
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
  loader?: LoaderFn<TLoaderData, TFullSearchSchema, TAllParams>
  // An asynchronous function made available to the route for performing asynchronous or mutative actions that
  // might invalidate the route's data.
  action?: ActionFn<TActionPayload, TActionData>
  // This function is called
  // when moving from an inactive state to an active one. Likewise, when moving from
  // an active to an inactive state, the return function (if provided) is called.
  onMatch?: (matchContext: {
    params: TAllParams
    search: TFullSearchSchema
  }) =>
    | void
    | undefined
    | ((match: { params: TAllParams; search: TFullSearchSchema }) => void)
  // This function is called when the route remains active from one transition to the next.
  onTransition?: (match: {
    params: TAllParams
    search: TFullSearchSchema
  }) => void
  // An object of whatever you want! This object is accessible anywhere matches are.
  meta?: RouteMeta
}

export type SearchFilter<T, U = T> = (prev: T) => U

export interface MatchLocation {
  to?: string | number | null
  fuzzy?: boolean
  caseSensitive?: boolean
  from?: string
  fromCurrent?: boolean
}

export type SearchPredicate<TSearch extends AnySearchSchema = {}> = (
  search: TSearch,
) => any

export interface UnloadedMatch<
  TPath extends string = string,
  TLoaderData extends AnyLoaderData = {},
  TActionPayload = unknown,
  TActionResponse = unknown,
> {
  id: string
  route: AnyRoute
  pathname: string
  params: AnyPathParams
}

export type LoaderFn<
  TLoaderData extends AnyLoaderData,
  TFullSearchSchema extends AnySearchSchema = {},
  TAllParams extends AnyPathParams = {},
> = (loaderContext: {
  params: TAllParams
  search: TFullSearchSchema
  signal?: AbortSignal
}) => Promise<TLoaderData>

export type ActionFn<TActionPayload = unknown, TActionResponse = unknown> = (
  submission: TActionPayload,
) => TActionResponse | Promise<TActionResponse>

export type UnloaderFn<TPath extends string> = (
  routeMatch: RouteMatch<any, RouteInfo<string, TPath>>,
) => void

export interface RouteMatchContext<
  TPath extends string,
  TLoaderData extends AnyLoaderData = {},
  TActionPayload = unknown,
  TActionResponse = unknown,
> {
  match: UnloadedMatch<TPath, TLoaderData, TActionPayload, TActionResponse>
  signal?: AbortSignal
  // router: Router
}

export interface RouterState {
  status: 'idle' | 'loading'
  location: Location
  matches: RouteMatch[]
  lastUpdated: number
  loaderData: unknown
  action?: ActionState
  actions: Record<string, Action>
  pending?: PendingState
}

export interface PendingState {
  location: Location
  matches: RouteMatch[]
}

export type ListenerFn = () => void

export interface Segment {
  type: 'pathname' | 'param' | 'wildcard'
  value: string
}

type GetFrameworkGeneric<U, TData = unknown> = U extends keyof FrameworkGenerics
  ? FrameworkGenerics[U]
  : any

export interface __Experimental__RouterSnapshot {
  location: Location
  matches: SnapshotRouteMatch<unknown>[]
}

export interface SnapshotRouteMatch<TData> {
  id: string
  loaderData: TData
}

export interface BuildNextOptions {
  to?: string | number | null
  params?: true | Updater<Record<string, any>>
  search?: true | Updater<unknown>
  hash?: true | Updater<string>
  key?: string
  from?: string
  fromCurrent?: boolean
  __preSearchFilters?: SearchFilter<any>[]
  __postSearchFilters?: SearchFilter<any>[]
}

interface ActiveOptions {
  exact?: boolean
  includeHash?: boolean
}

export type FilterRoutesFn = <TRoute extends Route<any, RouteInfo>>(
  routeConfigs: TRoute[],
) => TRoute[]

type Listener = () => void

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

export type MatchRouteOptions<
  TAllRouteInfo extends AnyAllRouteInfo = DefaultAllRouteInfo,
  TFrom extends ValidFromPath<TAllRouteInfo> = '/',
  TTo extends string = '.',
> = ToOptions<TAllRouteInfo, TFrom, TTo> & {
  pending: boolean
  caseSensitive?: boolean
}

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

export type PreloadCacheEntry = {
  expiresAt: number
  match: RouteMatch
}

export interface RouterOptions<TRouteConfig extends AnyRouteConfig> {
  history?: BrowserHistory | MemoryHistory | HashHistory
  stringifySearch?: SearchSerializer
  parseSearch?: SearchParser
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
  routeConfig?: TRouteConfig
  basepath?: string
  createRouter?: (router: Router<any, any>) => Router<any, any>
  createRoute?: <T extends AnyRoute>(opts: {
    route: T
    router: Router<any, any>
  }) => T
}

export interface Action<
  TPayload = unknown,
  TResponse = unknown,
  // TError = unknown,
> {
  submit: (submission?: TPayload) => Promise<TResponse>
  latest?: ActionState
  pending: ActionState<TPayload, TResponse>[]
}

export interface ActionState<
  TPayload = unknown,
  TResponse = unknown,
  // TError = unknown,
> {
  submittedAt: number
  status: 'idle' | 'pending' | 'success' | 'error'
  submission: TPayload
  data?: TResponse
  error?: unknown
}

type RoutesById<TAllRouteInfo extends AnyAllRouteInfo> = {
  [K in keyof TAllRouteInfo['routeInfoById']]: Route<
    TAllRouteInfo,
    TAllRouteInfo['routeInfoById'][K]
  >
}

// type RoutesByPath<TAllRouteInfo extends AnyAllRouteInfo> = {
//   [K in TAllRouteInfo['fullPath']]: Route<
//     TAllRouteInfo,
//     TAllRouteInfo['routeInfoByFullPath'][K]
//   >
// }

export type ValidFromPath<
  TAllRouteInfo extends AnyAllRouteInfo = DefaultAllRouteInfo,
> =
  | undefined
  | (string extends TAllRouteInfo['fullPath']
      ? string
      : TAllRouteInfo['fullPath'])

// type ValidToPath<
//   TAllRouteInfo extends AnyAllRouteInfo = DefaultAllRouteInfo,
//   TFrom = undefined,
// > = TFrom extends undefined
//   ? TAllRouteInfo['fullPath'] | `...unsafe-relative-path (cast "as any")`
//   : LooseAutocomplete<'.' | TAllRouteInfo['fullPath']>

export interface Router<
  TRouteConfig extends AnyRouteConfig = RouteConfig,
  TAllRouteInfo extends AnyAllRouteInfo = AllRouteInfo<TRouteConfig>,
> {
  options: PickAsRequired<
    RouterOptions<TRouteConfig>,
    'stringifySearch' | 'parseSearch'
  >
  // Computed in this.update()
  basepath: string
  // Internal:
  allRouteInfo: TAllRouteInfo
  listeners: Listener[]
  location: Location
  navigateTimeout?: Timeout
  nextAction?: 'push' | 'replace'
  state: RouterState
  routeTree: Route<TAllRouteInfo, RouteInfo>
  routesById: RoutesById<TAllRouteInfo>
  navigationPromise: Promise<void>
  startedLoadingAt: number
  destroy: () => void
  resolveNavigation: () => void
  subscribe: (listener: Listener) => () => void
  notify: () => void
  mount: () => Promise<void>
  update: <TRouteConfig extends RouteConfig = RouteConfig>(
    opts?: RouterOptions<TRouteConfig>,
  ) => Router<TRouteConfig>
  buildRouteTree: (
    routeConfig: RouteConfig,
  ) => Route<TAllRouteInfo, AnyRouteInfo>
  useRoute: <TId extends keyof TAllRouteInfo['routeInfoById']>(
    routeId: TId,
  ) => Route<TAllRouteInfo, TAllRouteInfo['routeInfoById'][TId]>
  parseLocation: (
    location: History['location'],
    previousLocation?: Location,
  ) => Location
  buildLocation: (dest: BuildNextOptions) => Location
  commitLocation: (next: Location, replace?: boolean) => Promise<void>
  buildNext: (opts: BuildNextOptions) => Location
  cancelMatches: () => void
  loadLocation: (next?: Location) => Promise<void>
  preloadCache: Record<string, PreloadCacheEntry>
  cleanPreloadCache: () => void
  loadRoute: (
    navigateOpts: BuildNextOptions,
    loaderOpts: { maxAge: number },
  ) => Promise<RouteMatch[]>
  matchRoutes: (
    pathname: string,
    opts?: { strictParseParams?: boolean },
  ) => UnloadedMatch[]
  resolveMatches: (unloadedMatches: UnloadedMatch[]) => RouteMatch[]
  loadMatches: (
    resolvedMatches: RouteMatch[],
    loaderOpts?: { withPending?: boolean } & (
      | { preload: true; maxAge: number }
      | { preload?: false; maxAge?: never }
    ),
  ) => Promise<RouteMatch[]>
  invalidateRoute: (opts: MatchLocation) => void
  reload: () => Promise<void>
  // getLoaderData: () => LoaderData
  useAction: <TId extends keyof TAllRouteInfo['routeInfoById']>(
    routeId: TId,
    opts?: { isActive?: boolean },
  ) => Action<
    TAllRouteInfo['routeInfoById'][TId]['actionPayload'],
    TAllRouteInfo['routeInfoById'][TId]['actionResponse']
  >
  getOutletElement: (match: RouteMatch) => JSX.Element
  resolvePath: (from: string, path: string) => string
  _navigate: (
    location: BuildNextOptions & { replace?: boolean },
  ) => Promise<void>
  navigate: <
    TFrom extends ValidFromPath<TAllRouteInfo> = '/',
    TTo extends string = '.',
  >(
    opts: NavigateOptionsAbsolute<TAllRouteInfo, TFrom, TTo>,
  ) => Promise<void>
  matchRoute: <
    TFrom extends ValidFromPath<TAllRouteInfo> = '/',
    TTo extends string = '.',
  >(
    opts: MatchRouteOptions<TAllRouteInfo, TFrom, TTo>,
  ) => boolean
  buildLink: <
    TFrom extends ValidFromPath<TAllRouteInfo> = '/',
    TTo extends string = '.',
  >(
    opts: LinkOptions<TAllRouteInfo, TFrom, TTo>,
  ) => LinkInfo
  __experimental__createSnapshot: () => __Experimental__RouterSnapshot
}

export function createRouter<
  TRouteConfig extends AnyRouteConfig = RouteConfig,
  TAllRouteInfo extends AnyAllRouteInfo = AllRouteInfo<TRouteConfig>,
>(
  userOptions?: RouterOptions<TRouteConfig>,
): Router<TRouteConfig, TAllRouteInfo> {
  const history = userOptions?.history || createDefaultHistory()

  const originalOptions = {
    ...userOptions,
    stringifySearch: userOptions?.stringifySearch ?? defaultStringifySearch,
    parseSearch: userOptions?.parseSearch ?? defaultParseSearch,
  }

  let router: Router<TRouteConfig, TAllRouteInfo> = {
    options: originalOptions,
    listeners: [],
    // Resolved after construction
    basepath: '',
    routeTree: undefined!,
    routesById: {} as any,
    location: undefined!,
    allRouteInfo: undefined!,
    //
    navigationPromise: Promise.resolve(),
    resolveNavigation: () => {},
    preloadCache: {},
    state: {
      status: 'idle',
      location: null!,
      matches: [],
      actions: {},
      loaderData: {} as any,
      lastUpdated: Date.now(),
    },
    startedLoadingAt: Date.now(),
    subscribe: (listener: Listener): (() => void) => {
      router.listeners.push(listener as Listener)
      return () => {
        router.listeners = router.listeners.filter((x) => x !== listener)
      }
    },

    notify: (): void => {
      router.listeners.forEach((listener) => listener())
    },

    mount: () => {
      const next = router.buildLocation({
        to: '.',
        search: true,
        hash: true,
      })

      // If the current location isn't updated, trigger a navigation
      // to the current location. Otherwise, load the current location.
      if (next.href !== router.location.href) {
        return router.commitLocation(next, true)
      } else {
        return router.loadLocation()
      }
    },

    update: (opts) => {
      const { basepath, routeConfig, ...rest } = opts ?? {}
      Object.assign(router, rest)

      router.basepath = cleanPath(`/${basepath ?? ''}`)

      if (routeConfig) {
        router.routesById = {} as any
        router.routeTree = router.buildRouteTree(routeConfig)
      }

      return router as any
    },

    destroy: history.listen((event) => {
      router.loadLocation(router.parseLocation(event.location, router.location))
    }),

    buildRouteTree: (rootRouteConfig: RouteConfig) => {
      const recurseRoutes = (
        routeConfigs: RouteConfig[],
        parent?: Route<TAllRouteInfo, any>,
      ): Route<TAllRouteInfo, any>[] => {
        return routeConfigs.map((routeConfig) => {
          const routeOptions = routeConfig.options
          const route = createRoute(routeConfig, routeOptions, parent, router)

          // {
          //   pendingMs: routeOptions.pendingMs ?? router.defaultPendingMs,
          //   pendingMinMs: routeOptions.pendingMinMs ?? router.defaultPendingMinMs,
          // }

          const existingRoute = (router.routesById as any)[route.id]

          if (existingRoute) {
            if (process.env.NODE_ENV !== 'production') {
              console.warn(
                `Duplicate routes found with id: ${String(route.id)}`,
                router.routesById,
                route,
              )
            }
            throw new Error()
          }

          ;(router.routesById as any)[route.id] = route

          const children = routeConfig.children as RouteConfig[]

          route.children = children?.length
            ? recurseRoutes(children, route)
            : undefined

          return route
        })
      }

      const routes = recurseRoutes([rootRouteConfig])

      return routes[0]!
    },

    useRoute: (routeId) => {
      const route = router.routesById[routeId]

      if (!route) {
        throw new Error('Route not found!')
      }

      return route as any
    },

    parseLocation: (
      location: History['location'],
      previousLocation?: Location,
    ): Location => {
      const parsedSearch = router.options.parseSearch(location.search)

      return {
        pathname: location.pathname,
        searchStr: location.search,
        search: replaceEqualDeep(previousLocation?.search, parsedSearch),
        hash: location.hash.split('#').reverse()[0] ?? '',
        href: `${location.pathname}${location.search}${location.hash}`,
        state: location.state as LocationState,
        key: location.key,
      }
    },

    buildLocation: (dest: BuildNextOptions = {}): Location => {
      // const resolvedFrom: Location = {
      //   ...router.location,
      const fromPathname = dest.fromCurrent
        ? router.location.pathname
        : dest.from ?? router.location.pathname

      let pathname = resolvePath(
        router.basepath ?? '/',
        fromPathname,
        `${dest.to ?? '.'}`,
      )

      const fromMatches = router.matchRoutes(router.location.pathname, {
        strictParseParams: true,
      })

      const toMatches = router.matchRoutes(pathname)

      const prevParams = last(fromMatches)?.params

      let nextParams =
        dest.params === true
          ? prevParams
          : functionalUpdate(dest.params, prevParams)

      if (nextParams) {
        toMatches
          .map((d) => d.route.options.stringifyParams)
          .filter(Boolean)
          .forEach((fn) => {
            Object.assign(nextParams!, fn!(nextParams!))
          })
      }

      pathname = interpolatePath(pathname, nextParams ?? {})

      // Pre filters first
      const preFilteredSearch = dest.__preSearchFilters?.length
        ? dest.__preSearchFilters.reduce(
            (prev, next) => next(prev),
            router.location.search,
          )
        : router.location.search

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
        ? dest.__postSearchFilters.reduce(
            (prev, next) => next(prev),
            destSearch,
          )
        : destSearch

      const search = replaceEqualDeep(
        router.location.search,
        postFilteredSearch,
      )

      const searchStr = router.options.stringifySearch(search)
      let hash =
        dest.hash === true
          ? router.location.hash
          : functionalUpdate(dest.hash, router.location.hash)
      hash = hash ? `#${hash}` : ''

      return {
        pathname,
        search,
        searchStr,
        state: router.location.state,
        hash,
        href: `${pathname}${searchStr}${hash}`,
        key: dest.key,
      }
    },

    commitLocation: (next: Location, replace?: boolean): Promise<void> => {
      const id = '' + Date.now() + Math.random()

      if (router.navigateTimeout) clearTimeout(router.navigateTimeout)

      let nextAction: 'push' | 'replace' = 'replace'

      if (!replace) {
        nextAction = 'push'
      }

      const isSameUrl =
        router.parseLocation(history.location).href === next.href

      if (isSameUrl && !next.key) {
        nextAction = 'replace'
      }

      if (nextAction === 'replace') {
        history.replace(
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
        history.push(
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

      router.navigationPromise = new Promise((resolve) => {
        const previousNavigationResolve = router.resolveNavigation

        router.resolveNavigation = () => {
          previousNavigationResolve()
          resolve()
        }
      })

      return router.navigationPromise
    },

    buildNext: (opts: BuildNextOptions) => {
      const next = router.buildLocation(opts)

      const matches = router.matchRoutes(next.pathname)

      const __preSearchFilters = matches
        .map((match) => match.route.options.preSearchFilters ?? [])
        .flat()
        .filter(Boolean)

      const __postSearchFilters = matches
        .map((match) => match.route.options.postSearchFilters ?? [])
        .flat()
        .filter(Boolean)

      return router.buildLocation({
        ...opts,
        __preSearchFilters,
        __postSearchFilters,
      })
    },

    cancelMatches: () => {
      ;[
        ...router.state.matches,
        ...(router.state.pending?.matches ?? []),
      ].forEach((match) => {
        match.cancel()
      })
    },

    loadLocation: async (next?: Location) => {
      const id = Math.random()
      router.startedLoadingAt = id

      if (next) {
        // Ingest the new location
        router.location = next
      }

      // Cancel any pending matches
      router.cancelMatches()

      // Match the routes
      const unloadedMatches = router.matchRoutes(location.pathname, {
        strictParseParams: true,
      })
      const resolvedMatches = router.resolveMatches(unloadedMatches)

      router.state = {
        ...router.state,
        pending: {
          matches: resolvedMatches,
          location: router.location,
        },
      }
      router.notify()

      console.log(unloadedMatches)

      // Load the matches
      const matches = await router.loadMatches(resolvedMatches, {
        withPending: true,
      })

      if (router.startedLoadingAt !== id) {
        // Ignore side-effects of match loading
        return router.navigationPromise
      }

      const previousMatches = router.state.matches

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

      router.state = {
        ...router.state,
        location: router.location,
        matches,
        pending: undefined,
      }

      if (matches.some((d) => d.status === 'loading')) {
        router.notify()
        await Promise.all(
          matches.map((d) => d.loaderPromise || Promise.resolve()),
        )
      }
      if (router.startedLoadingAt !== id) {
        // Ignore side-effects of match loading
        return
      }
      router.notify()
      router.resolveNavigation()
    },

    // preloadCache: Record<string, PreloadCacheEntry> = {},

    cleanPreloadCache: () => {
      const activeMatchIds = [
        ...(router.state.matches ?? []),
        ...(router.state.pending?.matches ?? []),
      ].map((d) => d.id)

      const now = Date.now()

      Object.keys(router.preloadCache).forEach((matchId) => {
        const entry = router.preloadCache[matchId]!

        if (activeMatchIds.includes(matchId)) {
          return
        }

        if (entry.expiresAt < now) {
          delete router.preloadCache[matchId]
        }
      })
    },

    loadRoute: async (
      navigateOpts: BuildNextOptions = router.location,
      loaderOpts: { maxAge: number },
    ) => {
      const next = router.buildNext(navigateOpts)
      const unloadedMatches = router.matchRoutes(next.pathname, {
        strictParseParams: true,
      })
      const matches = router.resolveMatches(unloadedMatches)
      await router.loadMatches(matches, {
        preload: true,
        maxAge: loaderOpts.maxAge,
      })
      return matches
    },

    matchRoutes: (pathname, opts) => {
      router.cleanPreloadCache()

      const matches: UnloadedMatch[] = []

      if (!router.routeTree) {
        return matches
      }

      const recurse = async (
        routes: Route<any, any>[],
        parentMatch: { params: Record<string, string>; pathname: string },
      ): Promise<void> => {
        let { params } = parentMatch

        const filteredRoutes = router.options.filterRoutes?.(routes) ?? routes

        const route = filteredRoutes?.find((route) => {
          const fuzzy = !!(route.path !== '/' || route.children?.length)
          const matchParams = matchPathname(pathname, {
            to: route.fullPath,
            fuzzy,
            caseSensitive:
              route.options.caseSensitive ?? router.options.caseSensitive,
          })

          if (matchParams) {
            let parsedParams

            try {
              parsedParams = route.options.parseParams?.(matchParams!)
            } catch (err) {
              if (opts?.strictParseParams) {
                throw err
              }
            }

            params = {
              ...params,
              ...parsedParams,
            }
          }

          return !!matchParams
        })

        if (!route) {
          return
        }

        const interpolatedPath = interpolatePath(route.path, params)
        const interpolatedId = interpolatePath(route.id, params, true)

        const match: UnloadedMatch = {
          id: interpolatedId,
          route,
          params,
          pathname: joinPaths([pathname, interpolatedPath]),
        }

        matches.push(match)

        if (route.children?.length) {
          recurse(route.children, {
            params: match.params,
            pathname: match.pathname,
          })
        }
      }

      recurse([router.routeTree], {
        params: {},
        pathname: router.basepath,
      })

      return matches
    },

    resolveMatches: (unloadedMatches: UnloadedMatch[]): RouteMatch[] => {
      if (!unloadedMatches?.length) {
        return []
      }

      const existingMatches = [
        ...router.state.matches,
        ...(router.state.pending?.matches ?? []),
      ]

      const matches = unloadedMatches.map((unloadedMatch, i) => {
        return (
          existingMatches.find((d) => d.id === unloadedMatch.id) ||
          router.preloadCache[unloadedMatch.id]?.match ||
          createRouteMatch(router, unloadedMatch)
        )
      })

      matches.forEach((match, index) => {
        match.setParentMatch(matches[index - 1])
        match.setChildMatch(matches[index + 1])
      })

      return matches
    },

    loadMatches: async (
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
            router.preloadCache[match.id] = {
              expiresAt: Date.now() + loaderOpts?.maxAge!,
              match,
            }
          }
          return promise
        }
      })

      await Promise.all(matchPromises)

      return resolvedMatches
    },

    invalidateRoute: (opts: MatchLocation) => {
      const next = router.buildNext(opts)
      const unloadedMatchIds = router
        .matchRoutes(next.pathname)
        .map((d) => d.id)
      ;[
        ...router.state.matches,
        ...(router.state.pending?.matches ?? []),
      ].forEach((match) => {
        if (unloadedMatchIds.includes(match.id)) {
          match.isInvalid = true
        }
      })

      if (process.env.NODE_ENV !== 'production') {
        router.notify()
      }
    },

    reload: () =>
      router._navigate({
        fromCurrent: true,
        replace: true,
        search: true,
      }),

    // getLoaderData: () => {
    //   return router.state.loaderData
    // },

    useAction: (routeId, opts) => {
      const route = router.routesById[routeId]

      if (!route) {
        throw new Error('Route not found!')
      }

      let action =
        router.state.actions[route.id] ||
        (() => {
          router.state.actions[route.id] = {
            submit: null!,
            pending: [],
          }
          return router.state.actions[route.id]!
        })()

      // if (!route.options.action) {
      //   throw new Error(
      //     `Warning: No action was found for "${cleanPath(
      //       matches.map((d) => d.route.path).join('/'),
      //     )}". Please add an 'action' option to this route.`,
      //   )
      // }

      Object.assign(action, {
        route,
        submit: async <T, U>(
          submission: T,
          actionOpts?: { invalidate?: boolean },
        ) => {
          if (!route) {
            return
          }

          const invalidate = actionOpts?.invalidate ?? true

          const actionState: ActionState<T, U> = {
            submittedAt: Date.now(),
            status: 'pending',
            submission,
          }

          action.latest = actionState
          action.pending.push(actionState)

          if (opts?.isActive) {
            router.state.action = actionState
          }

          router.notify()

          try {
            const res = await route.options.action?.(submission)
            actionState.data = res as U
            if (invalidate) {
              router.invalidateRoute({ to: '.', fromCurrent: true })
              await router.reload()
            }
            actionState.status = 'success'
            return res
          } catch (err) {
            console.error(err)
            actionState.error = err
            actionState.status = 'error'
          } finally {
            action.pending = action.pending.filter((d) => d !== actionState)
            if (actionState === router.state.action) {
              router.state.action = undefined
            }
            router.notify()
          }
        },
      })

      return action
    },

    getOutletElement: (match: RouteMatch): JSX.Element => {
      const element = ((): React.ReactNode => {
        if (!match) {
          return null
        }

        const errorElement =
          match.errorElement ?? router.options.defaultErrorElement

        if (match.status === 'error') {
          if (errorElement) {
            return errorElement as any
          }

          if (!router.options.useErrorBoundary) {
            return match.error
              ? `${match.error}`
              : 'An unknown/unhandled error occurred!'
          }

          throw match.error
        }

        if (match.status === 'loading' || match.status === 'idle') {
          if (match.isPending) {
            const pendingElement =
              match.pendingElement ?? router.options.defaultPendingElement

            if (match.route.options.pendingMs || pendingElement) {
              return (pendingElement as any) ?? null
            }
          }

          return null
        }

        return (match.element as any) ?? router.options.defaultElement
      })() as JSX.Element

      return element
    },

    resolvePath: (from: string, path: string) => {
      return resolvePath(router.basepath!, from, cleanPath(path))
    },

    matchRoute: (opts) => {
      // const matchLocation = router.buildNext(opts)

      const toOptions = {
        ...opts,
        to: opts.to
          ? router.resolvePath(opts.from || router.basepath, `${opts.to}`)
          : undefined,
      }

      if (opts?.pending) {
        if (!router.state.pending?.location) {
          return false
        }
        return !!matchPathname(
          router.state.pending.location.pathname,
          toOptions,
        )
      }

      return !!matchPathname(router.state.location.pathname, toOptions)
    },

    _navigate: (location: BuildNextOptions & { replace?: boolean }) => {
      const next = router.buildNext(location)
      return router.commitLocation(next, location.replace)
    },

    navigate: async ({ from, to = '.', search, hash, replace }) => {
      // If this link simply reloads the current route,
      // make sure it has a new key so it will trigger a data refresh

      // If this `to` is a valid external URL, return
      // null for LinkUtils
      const toString = String(to)
      const fromString = String(from)

      let isExternal

      try {
        new URL(`${toString}`)
        isExternal = true
      } catch (e) {}

      if (isExternal) {
        if (process.env.NODE_ENV !== 'production') {
          throw new Error(
            'Attempting to navigate to external url with router.navigate!',
          )
        }
        return
      }

      return router._navigate({
        from: fromString,
        to: toString,
        search,
        hash,
      })
    },

    buildLink: ({
      from,
      to = '.',
      search,
      params,
      hash,
      target,
      replace,
      activeOptions,
      preload,
      preloadMaxAge: userPreloadMaxAge,
      preloadDelay: userPreloadDelay,
      disabled,
    }) => {
      // If this link simply reloads the current route,
      // make sure it has a new key so it will trigger a data refresh

      // If this `to` is a valid external URL, return
      // null for LinkUtils

      try {
        new URL(`${to}`)
        return {
          type: 'external',
          href: to,
        }
      } catch (e) {}

      const nextOpts = {
        from,
        to,
        search,
        params,
        hash,
        replace,
      }

      const next = router.buildNext(nextOpts)

      preload = preload ?? router.options.defaultLinkPreload
      const preloadMaxAge =
        userPreloadMaxAge ?? router.options.defaultLinkPreloadMaxAge ?? 2000
      const preloadDelay =
        userPreloadDelay ?? router.options.defaultLinkPreloadDelay ?? 50

      // Compare path/hash for matches
      const pathIsEqual = router.state.location.pathname === next.pathname
      const currentPathSplit = router.state.location.pathname.split('/')
      const nextPathSplit = next.pathname.split('/')
      const pathIsFuzzyEqual = nextPathSplit.every(
        (d, i) => d === currentPathSplit[i],
      )
      const hashIsEqual = router.state.location.hash === next.hash
      // Combine the matches based on user options
      const pathTest = activeOptions?.exact ? pathIsEqual : pathIsFuzzyEqual
      const hashTest = activeOptions?.includeHash ? hashIsEqual : true

      // The final "active" test
      const isActive = pathTest && hashTest

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
            router.invalidateRoute(nextOpts)
          }

          // All is well? Navigate!)
          router._navigate(nextOpts)
        }
      }

      // The click handler
      const handleFocus = (e: MouseEvent) => {
        if (preload && preloadMaxAge > 0) {
          router.loadRoute(nextOpts, { maxAge: preloadMaxAge })
        }
      }

      const handleEnter = (e: MouseEvent) => {
        const target = (e.target || {}) as LinkCurrentTargetElement

        if (preload && preloadMaxAge > 0) {
          if (target.preloadTimeout) {
            return
          }

          target.preloadTimeout = setTimeout(() => {
            target.preloadTimeout = null
            router.loadRoute(nextOpts, { maxAge: preloadMaxAge })
          }, preloadDelay)
        }
      }

      const handleLeave = (e: MouseEvent) => {
        const target = (e.target || {}) as LinkCurrentTargetElement

        if (target.preloadTimeout) {
          clearTimeout(target.preloadTimeout)
          target.preloadTimeout = null
        }
      }

      return {
        type: 'internal',
        next,
        handleFocus,
        handleClick,
        handleEnter,
        handleLeave,
        isActive,
        disabled,
      }
    },

    __experimental__createSnapshot: (): __Experimental__RouterSnapshot => {
      return {
        ...router.state,
        matches: router.state.matches.map(({ loaderData, id }) => {
          return {
            id,
            loaderData,
          }
        }),
      }
    },
  }

  router.location = router.parseLocation(history.location)
  // router.state.location = __experimental__snapshot?.location ?? router.location
  router.state.location = router.location

  router.update(userOptions)

  // Allow frameworks to hook into the router creation
  router = router.options.createRouter?.(router as any) ?? router

  return router
}

type LinkCurrentTargetElement = {
  preloadTimeout?: null | ReturnType<typeof setTimeout>
}

export interface Route<
  TAllRouteInfo extends AnyAllRouteInfo = DefaultAllRouteInfo,
  TRouteInfo extends AnyRouteInfo = RouteInfo,
> {
  id: TRouteInfo['id']
  path: TRouteInfo['path']
  fullPath: TRouteInfo['fullPath']
  parent?: AnyRoute
  children?: AnyRoute[]
  options: RouteOptions
  router: Router<TAllRouteInfo['routeConfig'], TAllRouteInfo>
  getSearch: () => TRouteInfo['searchSchema']
  getAction: () => Action<
    TRouteInfo['actionPayload'],
    TRouteInfo['actionResponse']
  >
  buildLink: <TTo extends string = '.'>(
    options: // CheckRelativePath<
    //   TAllRouteInfo,
    //   TRouteInfo['fullPath'],
    //   NoInfer<TTo>
    // > &
    Omit<LinkOptions<TAllRouteInfo, TRouteInfo['fullPath'], TTo>, 'from'>,
  ) => LinkInfo
  matchRoute: <
    TTo extends string = '.',
    TResolved extends string = ResolveRelativePath<TRouteInfo['id'], TTo>,
  >(
    options: // CheckRelativePath<
    //   TAllRouteInfo,
    //   TRouteInfo['fullPath'],
    //   NoInfer<TTo>
    // > &
    Omit<MatchRouteOptions<TAllRouteInfo, TRouteInfo['fullPath'], TTo>, 'from'>,
  ) => RouteInfoByPath<TAllRouteInfo, TResolved>['allParams']
  navigate: <TTo extends string = '.'>(
    options: Omit<LinkOptions<TAllRouteInfo, TRouteInfo['id'], TTo>, 'from'>,
  ) => Promise<void>
  useAction: () => Action<
    TRouteInfo['actionPayload'],
    TRouteInfo['actionResponse']
  >
}

export function createRoute<
  TAllRouteInfo extends AnyAllRouteInfo = DefaultAllRouteInfo,
  TRouteInfo extends AnyRouteInfo = RouteInfo,
>(
  routeConfig: RouteConfig,
  options: TRouteInfo['options'],
  parent: undefined | Route<TAllRouteInfo, any>,
  router: Router<TAllRouteInfo['routeConfig'], TAllRouteInfo>,
): Route<TAllRouteInfo, TRouteInfo> {
  // const id = (
  //   options.path === rootRouteId
  //     ? rootRouteId
  //     : joinPaths([
  //         parent!.id,
  //         `${options.path?.replace(/(.)\/$/, '$1')}`,
  //       ]).replace(new RegExp(`^${rootRouteId}`), '')
  // ) as TRouteInfo['id']

  const { id, path, fullPath } = routeConfig

  let route: Route<TAllRouteInfo, TRouteInfo> = {
    id,
    path: path as any,
    fullPath,
    options,
    router,
    children: undefined!,
    parent,

    getSearch: (): TRouteInfo['searchSchema'] => {
      return {} as any
    },

    getAction: (): Action<
      TRouteInfo['actionPayload'],
      TRouteInfo['actionResponse']
    > => {
      return {} as any
    },

    buildLink: (options) => {
      return router.buildLink({
        ...options,
        from: fullPath,
      } as any) as any
    },

    navigate: (options) => {
      return router.navigate({
        ...options,
        from: fullPath,
      } as any) as any
    },

    useAction: () => {
      return router.useAction(id)
    },

    matchRoute: (options) => {
      return router.matchRoute({
        ...options,
        from: fullPath,
      } as any)
    },
  }

  route = router.options.createRoute?.({ router, route }) ?? route

  return route
}

type RelativeLinkAutoComplete<
  AllPaths extends string,
  TFrom extends string,
  TTo extends string,
  SplitPaths extends string[] = Split<AllPaths>,
> = TTo extends `..${infer _}`
  ? SplitPaths extends [
      ...Split<ResolveRelativePath<TFrom, TTo>>,
      ...infer TToRest,
    ]
    ? `${CleanPath<
        Join<
          [
            ...Split<TTo>,
            ...(
              | TToRest
              | (Split<ResolveRelativePath<TFrom, TTo>>['length'] extends 1
                  ? never
                  : ['../'])
            ),
          ]
        >
      >}`
    : never
  : TTo extends `./${infer RestTTo}`
  ? SplitPaths extends [...Split<TFrom>, ...Split<RestTTo>, ...infer RestPath]
    ? `${TTo}${Join<RestPath>}`
    : never
  : './' | '../' | AllPaths

type MapToUnknown<T extends object> = { [_ in keyof T]: unknown }

// type GetMatchingPath<
//   TFrom extends string,
//   TTo extends string,
//   SplitTTo = MapToUnknown<Split<TTo>>,
// > = Split<TFrom> extends [...infer Matching, ...Extract<SplitTTo, unknown[]>]
//   ? Matching['length'] extends 0
//     ? never
//     : Matching
//   : never

// type Test1 = Split<'a/b/c'>
// //   ^?
// type Test = Extract<MapToUnknown<Split<'../e'>>, unknown[]>
// //   ^?
// type Test3 = Test1 extends [...infer Matching, ...Test] ? Matching : never
// //   ^?
// type Test4 = ResolveRelativePath<'a/b/c', '../e'>
// //   ^?

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
> =
  //  CheckRelativePath<TAllRouteInfo, TFrom, NoInfer<TTo>> &
  {
    // The destination route path
    // (An absolute path is preferred for type-safety, but relative is also allowed)
    to?:
      | TTo
      | RelativeLinkAutoComplete<
          TAllRouteInfo['fullPath'],
          NoInfer<TFrom> extends string ? NoInfer<TFrom> : '',
          NoInfer<TTo> & string
        >
    // The new has string or a function to update it
    hash?: Updater<string>
    // The source route path. This is automatically set when using route-level APIs, but for type-safe relative routing on the router itself, this is required
    from?: TFrom
    // // When using relative route paths, this option forces resolution from the current path, instead of the route API's path or `from` path
    // fromCurrent?: boolean
  } & SearchParamOptions<TAllRouteInfo, TFrom, TResolvedTo> &
    PathParamOptions<TAllRouteInfo, TFrom, TResolvedTo>

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
  // When preloaded and set, will cache the preloaded result for this duration in milliseconds
  preloadMaxAge?: number
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
    ? ResolveRelativePath<TFrom, TTo> extends TAllRouteInfo['fullPath']
      ? {}
      : {
          Error: `${TFrom} + ${TTo} resolves to ${ResolveRelativePath<
            TFrom,
            TTo
          >}, which is not a valid route path.`
          'Valid Route Paths': TAllRouteInfo['fullPath']
        }
    : {}
  : {}

export type ResolveRelativePath<TFrom, TTo = '.'> = TFrom extends string
  ? TTo extends string
    ? TTo extends '.'
      ? TFrom
      : TTo extends `/${infer TRest}`
      ? TTo
      : Split<TTo> extends ['..', ...infer ToRest]
      ? Split<TFrom> extends [...infer FromRest, infer FromTail]
        ? ResolveRelativePath<Join<FromRest>, Join<ToRest>>
        : never
      : Split<TTo> extends ['.', ...infer ToRest]
      ? ResolveRelativePath<TFrom, Join<ToRest>>
      : CleanPath<Join<['/', ...Split<TFrom>, ...Split<TTo>]>>
    : never
  : never

export type RouteInfoByPath<
  TRouteInfoByPath extends AnyAllRouteInfo,
  TPath,
> = TPath extends keyof TRouteInfoByPath['routeInfoByFullPath']
  ? IsAny<
      TRouteInfoByPath['routeInfoByFullPath'][TPath]['id'],
      RouteInfo,
      TRouteInfoByPath['routeInfoByFullPath'][TPath]
    >
  : never

type SearchParamOptions<
  TAllRouteInfo extends AnyAllRouteInfo,
  TFrom,
  TTo,
  TFromSchema = RouteInfoByPath<TAllRouteInfo, TFrom>['fullSearchSchema'],
  TToSchema = RouteInfoByPath<TAllRouteInfo, TTo>['fullSearchSchema'],
> =
  // If the next route search extend or cover the from route, params will be optional
  StartsWith<TFrom, TTo> extends true
    ? {
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

type SearchReducer<TFrom, TTo> = TTo | ((current: TFrom) => TTo)

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

export interface RouteMatch<
  TAllRouteInfo extends AnyAllRouteInfo = DefaultAllRouteInfo,
  TRouteInfo extends AnyRouteInfo = RouteInfo,
> {
  id: string
  router: unknown
  parentMatch?: RouteMatch
  childMatch?: RouteMatch
  route: Route<TAllRouteInfo, TRouteInfo>
  pathname: string
  params: TRouteInfo['allParams']
  search: TRouteInfo['searchSchema']
  updatedAt?: number
  element?: GetFrameworkGeneric<'Element', TRouteInfo['allLoaderData']>
  errorElement?: GetFrameworkGeneric<'Element', TRouteInfo['allLoaderData']>
  catchElement?: GetFrameworkGeneric<'Element', TRouteInfo['allLoaderData']>
  pendingElement?: GetFrameworkGeneric<'Element', TRouteInfo['allLoaderData']>
  error?: unknown
  loaderPromise?: Promise<void>
  importPromise?: Promise<void>
  elementsPromise?: Promise<void>
  dataPromise?: Promise<void>
  pendingTimeout?: Timeout
  pendingMinPromise?: Promise<void>
  onExit?: void | ((match: RouteMatch<TAllRouteInfo, TRouteInfo>) => void)
  isInvalid: boolean
  status: 'idle' | 'loading' | 'success' | 'error'
  loaderData: TRouteInfo['allLoaderData']
  isFetching: boolean
  isPending: boolean
  abortController: AbortController
  latestId: string
  resolve: () => void
  notify: () => void
  cancel: () => void
  startPending: () => void
  cancelPending: () => void
  setParentMatch: (parentMatch?: RouteMatch) => void
  setChildMatch: (childMatch?: RouteMatch) => void
  load: () => Promise<void>
}

export function createRouteMatch<
  TAllRouteInfo extends AnyAllRouteInfo = DefaultAllRouteInfo,
  TRouteInfo extends AnyRouteInfo = RouteInfo,
>(
  router: Router<any, any>,
  unloadedMatch: UnloadedMatch<
    TRouteInfo['path'],
    TRouteInfo['allLoaderData'],
    TRouteInfo['actionPayload'],
    TRouteInfo['actionResponse']
  >,
): RouteMatch<TAllRouteInfo, TRouteInfo> {
  const routeMatch: RouteMatch<TAllRouteInfo, TRouteInfo> = {
    ...unloadedMatch,
    router,
    search: router.location.search, // TODO: EH?
    status: 'idle',
    loaderData: {} as TRouteInfo['allLoaderData'],
    isPending: false,
    isFetching: false,
    isInvalid: false,
    abortController: new AbortController(),
    latestId: '',
    resolve: () => {},
    notify: () => {
      routeMatch.resolve()
      ;(routeMatch.router as Router).notify()
    },
    cancel: () => {
      routeMatch.abortController?.abort()
      routeMatch.cancelPending()
    },
    startPending: () => {
      if (
        routeMatch.pendingTimeout ||
        routeMatch.status !== 'loading' ||
        typeof routeMatch.route.options.pendingMs === 'undefined'
      ) {
        return
      }

      routeMatch.pendingTimeout = setTimeout(() => {
        routeMatch.isPending = true
        routeMatch.resolve()
        if (typeof routeMatch.route.options.pendingMinMs !== 'undefined') {
          routeMatch.pendingMinPromise = new Promise((r) =>
            setTimeout(r, routeMatch.route.options.pendingMinMs),
          )
        }
      }, routeMatch.route.options.pendingMs)
    },
    cancelPending: () => {
      routeMatch.isPending = false
      clearTimeout(routeMatch.pendingTimeout)
    },
    setParentMatch: (parentMatch?: RouteMatch) => {
      routeMatch.parentMatch = parentMatch
    },
    setChildMatch: (childMatch?: RouteMatch) => {
      routeMatch.childMatch = childMatch
    },
    load: () => {
      const id = '' + Date.now() + Math.random()
      routeMatch.latestId = id
      // If the match was in an error state, set it
      // to a loading state again. Otherwise, keep it
      // as loading or resolved
      if (routeMatch.status === 'error' || routeMatch.status === 'idle') {
        routeMatch.status = 'loading'
      }

      // We are now fetching, even if it's in the background of a
      // resolved state
      routeMatch.isFetching = true

      // We started loading the route, so it's no longer invalid
      routeMatch.isInvalid = false

      return new Promise(async (resolve) => {
        routeMatch.resolve = resolve as () => void

        const loaderPromise = (async () => {
          const importer = routeMatch.route.options.import

          // First, run any importers
          if (importer) {
            routeMatch.importPromise = importer({
              params: routeMatch.params,
              // search: routeMatch.search,
            }).then((imported) => {
              routeMatch.route = {
                ...routeMatch.route,
                ...imported,
              }
            })
          }

          // Wait for the importer to finish before
          // attempting to load elements and data
          await routeMatch.importPromise

          // Next, load the elements and data in parallel

          routeMatch.elementsPromise = (async () => {
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
                const routeElement = routeMatch.route.options[type]

                if (routeMatch[type]) {
                  return
                }

                if (typeof routeElement === 'function') {
                  const res = await (routeElement as any)(routeMatch)

                  routeMatch[type] = res
                } else {
                  routeMatch[type] = routeMatch.route.options[type] as any
                }
              }),
            )
          })()

          routeMatch.dataPromise = Promise.resolve().then(async () => {
            try {
              const data = await routeMatch.route.options.loader?.({
                params: routeMatch.params,
                search: routeMatch.search,
                signal: routeMatch.abortController.signal,
              })
              if (id !== routeMatch.latestId) {
                return routeMatch.loaderPromise
              }

              routeMatch.loaderData = replaceEqualDeep(routeMatch.loaderData, {
                ...routeMatch.loaderData,
                ...data,
              })

              cascadeLoaderData(routeMatch)
              routeMatch.error = undefined
              routeMatch.status = 'success'
              routeMatch.updatedAt = Date.now()
            } catch (err) {
              if (id !== routeMatch.latestId) {
                return routeMatch.loaderPromise
              }

              if (process.env.NODE_ENV !== 'production') {
                console.error(err)
              }
              routeMatch.error = err
              routeMatch.status = 'error'
              routeMatch.updatedAt = Date.now()
            }
          })

          try {
            await Promise.all([
              routeMatch.elementsPromise,
              routeMatch.dataPromise,
            ])
            if (id !== routeMatch.latestId) {
              return routeMatch.loaderPromise
            }

            if (routeMatch.pendingMinPromise) {
              await routeMatch.pendingMinPromise
              delete routeMatch.pendingMinPromise
            }
          } finally {
            if (id !== routeMatch.latestId) {
              return routeMatch.loaderPromise
            }
            routeMatch.cancelPending()
            routeMatch.isPending = false
            routeMatch.isFetching = false
            routeMatch.notify()
          }
        })()

        routeMatch.loaderPromise = loaderPromise
        await loaderPromise

        if (id !== routeMatch.latestId) {
          return routeMatch.loaderPromise
        }
        delete routeMatch.loaderPromise
      })
    },
  }

  return routeMatch
}

function cascadeLoaderData(routeMatch: RouteMatch<any, any>) {
  if (routeMatch.parentMatch) {
    routeMatch.loaderData = replaceEqualDeep(routeMatch.loaderData, {
      ...routeMatch.parentMatch.loaderData,
      ...routeMatch.loaderData,
    })
  }
  if (routeMatch.childMatch) {
    cascadeLoaderData(routeMatch.childMatch)
  }
}

export function matchPathname(
  currentPathname: string,
  matchLocation: Pick<MatchLocation, 'to' | 'fuzzy' | 'caseSensitive'>,
): AnyPathParams | undefined {
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
  if (cond) {
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

function cleanPath(path: string) {
  // remove double slashes
  return path.replace(/\/{2,}/g, '/')
}

function trimPathLeft(path: string) {
  return path === '/' ? path : path.replace(/^\/{1,}/, '')
}

function trimPathRight(path: string) {
  return path === '/' ? path : path.replace(/\/{1,}$/, '')
}

function trimPath(path: string) {
  return trimPathRight(trimPathLeft(path))
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
          if (baseSegment?.value === '/') {
            return false
          }
          if (!baseSegment.value.startsWith(':')) {
            params[routeSegment.value.substring(1)] = baseSegment.value
          }
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
//   search: SearchSchema,
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
  return (searchStr: string): AnySearchSchema => {
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
