import {
  createHashHistory,
  createBrowserHistory,
  createMemoryHistory,
  BrowserHistory,
  MemoryHistory,
  History,
  HashHistory,
} from 'history'
import invariant from 'tiny-invariant'

export { createHashHistory, createBrowserHistory, createMemoryHistory }
export { invariant }

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
  TRouteId extends string = string,
  TPath extends string = string,
  TFullPath extends string = string,
  TRouteLoaderData extends AnyLoaderData = AnyLoaderData,
  TLoaderData extends AnyLoaderData = AnyLoaderData,
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
  routeId: TRouteId
  path: NoInfer<TPath>
  fullPath: TFullPath
  options: RouteOptions<
    TRouteId,
    TPath,
    TRouteLoaderData,
    TLoaderData,
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
          TFullPath,
          TLoaderData,
          TFullSearchSchema,
          TAllParams
        >,
      ) => TNewChildren extends AnyRouteConfig[]
        ? TNewChildren
        : { error: 'Invalid route detected'; route: TNewChildren },
    ) => RouteConfig<
      TId,
      TRouteId,
      TPath,
      TFullPath,
      TRouteLoaderData,
      TLoaderData,
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
  TParentPath extends string = string,
  TParentAllLoaderData extends AnyLoaderData = {},
  TParentSearchSchema extends AnySearchSchema = {},
  TParentParams extends AnyPathParams = {},
> = <
  TRouteId extends string,
  TPath extends string,
  TRouteLoaderData extends AnyLoaderData,
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
  TResolvedId extends string = string extends TRouteId
    ? string extends TPath
      ? string
      : TPath
    : TRouteId,
>(
  options?: TIsRoot extends true
    ? Omit<
        RouteOptions<
          TRouteId,
          TPath,
          TRouteLoaderData,
          Expand<TParentAllLoaderData & DeepAwaited<NoInfer<TRouteLoaderData>>>,
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
        TRouteId,
        TPath,
        TRouteLoaderData,
        Expand<TParentAllLoaderData & DeepAwaited<NoInfer<TRouteLoaderData>>>,
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
  parentPath?: string,
) => RouteConfig<
  RoutePrefix<TParentId, TResolvedId>,
  TResolvedId,
  TPath,
  string extends TPath ? '' : RoutePath<RoutePrefix<TParentPath, TPath>>,
  TRouteLoaderData,
  Expand<TParentAllLoaderData & DeepAwaited<NoInfer<TRouteLoaderData>>>,
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
  parentPath,
) => {
  if (isRoot) {
    ;(options as any).path = rootRouteId
  }

  // Strip the root from parentIds
  if (parentId === rootRouteId) {
    parentId = ''
  }

  let path: undefined | string = isRoot ? rootRouteId : options.path

  // If the path is anything other than an index path, trim it up
  if (path && path !== '/') {
    path = trimPath(path)
  }

  const routeId = path || (options as { id?: string }).id

  let id = joinPaths([parentId, routeId])

  if (path === rootRouteId) {
    path = '/'
  }

  if (id !== rootRouteId) {
    id = joinPaths(['/', id])
  }

  const fullPath =
    id === rootRouteId ? '/' : trimPathRight(joinPaths([parentPath, path]))

  return {
    id: id as any,
    routeId: routeId as any,
    path: path as any,
    fullPath: fullPath as any,
    options: options as any,
    children,
    addChildren: (cb: any) =>
      createRouteConfig(
        options,
        cb((childOptions: any) =>
          createRouteConfig(childOptions, undefined, false, id, fullPath),
        ),
        false,
        parentId,
        parentPath,
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
    any,
    TChildren
  > {}

export interface AnyAllRouteInfo {
  routeConfig: AnyRouteConfig
  routeInfo: AnyRouteInfo
  routeInfoById: Record<string, AnyRouteInfo>
  routeInfoByFullPath: Record<string, AnyRouteInfo>
  routeIds: any
  routePaths: any
}

export interface DefaultAllRouteInfo {
  routeConfig: RouteConfig
  routeInfo: RouteInfo
  routeInfoById: Record<string, RouteInfo>
  routeInfoByFullPath: Record<string, RouteInfo>
  routeIds: string
  routePaths: string
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
    any,
    any,
    any
  > = RouteInfo,
  TRouteInfoById = {
    [TInfo in TRouteInfo as TInfo['id']]: TInfo
  },
  TRouteInfoByFullPath = {
    [TInfo in TRouteInfo as TInfo['fullPath'] extends RootRouteId
      ? never
      : string extends TInfo['fullPath']
      ? never
      : TInfo['fullPath']]: TInfo
  },
> {
  routeConfig: TRouteConfig
  routeInfo: TRouteInfo
  routeInfoById: TRouteInfoById
  routeInfoByFullPath: TRouteInfoByFullPath
  routeIds: keyof TRouteInfoById
  routePaths: keyof TRouteInfoByFullPath
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
    any,
    any
  > {}

// type IndexObj<T extends Record<string, any>, TKey extends keyof T> = {
//   [E in T as E[TKey]]: E
// }

type RoutePath<T extends string> = T extends RootRouteId
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
  infer TRouteId,
  infer TPath,
  infer TFullPath,
  infer TRouteLoaderData,
  infer TLoaderData,
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
  ? string extends TRouteId
    ? never
    : RouteInfo<
        TId,
        TRouteId,
        TPath,
        TFullPath,
        TRouteLoaderData,
        TLoaderData,
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
  TRouteId extends string = string,
  TPath extends string = string,
  TFullPath extends string = string,
  TRouteLoaderData extends AnyLoaderData = {},
  TLoaderData extends AnyLoaderData = {},
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
  routeId: TRouteId
  path: TPath
  fullPath: TFullPath
  routeLoaderData: TRouteLoaderData
  loaderData: TLoaderData
  actionPayload: TActionPayload
  actionResponse: TActionResponse
  searchSchema: TSearchSchema
  fullSearchSchema: TFullSearchSchema
  parentParams: TParentParams
  params: TParams
  allParams: TAllParams
  options: RouteOptions<
    TRouteId,
    TPath,
    TRouteLoaderData,
    TLoaderData,
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

export const rootRouteId = '__root__' as const
export type RootRouteId = typeof rootRouteId

type RoutePrefix<
  TPrefix extends string,
  TId extends string,
> = string extends TId
  ? RootRouteId
  : TId extends string
  ? `${TPrefix}/${TId}` extends '/'
    ? '/'
    : `/${TrimPathLeft<`${TrimPathRight<TPrefix>}/${TrimPath<TId>}`>}`
  : never

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

export type ParsePathParams<T extends string> = Split<T>[number] extends infer U
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

type Split<S, TTrailing = true> = S extends unknown
  ? string extends S
    ? string[]
    : S extends string
    ? CleanPath<S> extends ''
      ? []
      : TTrailing extends true
      ? CleanPath<S> extends `${infer T}/`
        ? [T, '/']
        : CleanPath<S> extends `/${infer U}`
        ? ['/', U]
        : CleanPath<S> extends `${infer T}/${infer U}`
        ? [T, ...Split<U>]
        : [S]
      : CleanPath<S> extends `${infer T}/${infer U}`
      ? [T, ...Split<U>]
      : [S]
    : never
  : never

type Join<T> = T extends []
  ? ''
  : T extends [infer L extends string]
  ? L
  : T extends [infer L extends string, ...infer Tail extends [...string[]]]
  ? CleanPath<`${L}/${Join<Tail>}`>
  : never

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
  TRouteId extends string = string,
  TPath extends string = string,
  TRouteLoaderData extends AnyLoaderData = {},
  TLoaderData extends AnyLoaderData = {},
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
> = (
  | {
      // The path to match (relative to the nearest parent `Route` component or root basepath)
      path: TPath
    }
  | {
      id: TRouteId
    }
) & {
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
    TRouteLoaderData,
    TLoaderData,
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
        TRouteLoaderData,
        TLoaderData,
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
  TRouteLoaderData extends AnyLoaderData = {},
  TLoaderData extends AnyLoaderData = {},
  TActionPayload = unknown,
  TActionResponse = unknown,
  TFullSearchSchema extends AnySearchSchema = {},
  TAllParams extends AnyPathParams = {},
> {
  // The content to be rendered when the route is matched. If no element is provided, defaults to `<Outlet />`
  element?: GetFrameworkGeneric<'SyncOrAsyncElement', NoInfer<TLoaderData>>
  // The content to be rendered when `loader` encounters an error
  errorElement?: GetFrameworkGeneric<'SyncOrAsyncElement', NoInfer<TLoaderData>>
  // The content to be rendered when rendering encounters an error
  catchElement?: GetFrameworkGeneric<'SyncOrAsyncElement', NoInfer<TLoaderData>>
  // The content to be rendered when the duration of `loader` execution surpasses the `pendingMs` duration
  pendingElement?: GetFrameworkGeneric<
    'SyncOrAsyncElement',
    NoInfer<TLoaderData>
  >
  // An asynchronous function responsible for preparing or fetching data for the route before it is rendered
  loader?: LoaderFn<TRouteLoaderData, TFullSearchSchema, TAllParams>
  // An asynchronous function made available to the route for performing asynchronous or mutative actions that
  // might invalidate the route's data.
  action?: ActionFn<TActionPayload, TActionResponse>
  // Set this to true to rethrow errors up the component tree to either the nearest error boundary or
  // route with error element, whichever comes first.
  useErrorBoundary?: boolean
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
  meta?: RouteMeta // TODO: Make this nested and mergeable
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

export type LoaderFn<
  TRouteLoaderData extends AnyLoaderData,
  TFullSearchSchema extends AnySearchSchema = {},
  TAllParams extends AnyPathParams = {},
> = (loaderContext: {
  params: TAllParams
  search: TFullSearchSchema
  signal?: AbortSignal
}) => Promise<TRouteLoaderData>

export type ActionFn<TActionPayload = unknown, TActionResponse = unknown> = (
  submission: TActionPayload,
) => TActionResponse | Promise<TActionResponse>

export type UnloaderFn<TPath extends string> = (
  routeMatch: RouteMatch<any, RouteInfo<string, TPath>>,
) => void

export interface RouterState {
  status: 'idle' | 'loading'
  location: Location
  matches: RouteMatch[]
  lastUpdated: number
  loaderData: unknown
  currentAction?: ActionState
  latestAction?: ActionState
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
  matchId: string
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

export interface MatchRouteOptions {
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
  maxAge: number
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
  createRouter?: (router: Router<any, any>) => void
  createRoute?: (opts: { route: AnyRoute; router: Router<any, any> }) => void
}

export interface Action<
  TPayload = unknown,
  TResponse = unknown,
  // TError = unknown,
> {
  submit: (submission?: TPayload) => Promise<TResponse>
  current?: ActionState<TPayload, TResponse>
  latest?: ActionState<TPayload, TResponse>
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
//   [K in TAllRouteInfo['routePaths']]: Route<
//     TAllRouteInfo,
//     TAllRouteInfo['routeInfoByFullPath'][K]
//   >
// }

export type ValidFromPath<
  TAllRouteInfo extends AnyAllRouteInfo = DefaultAllRouteInfo,
> =
  | undefined
  | (string extends TAllRouteInfo['routePaths']
      ? string
      : TAllRouteInfo['routePaths'])

// type ValidToPath<
//   TAllRouteInfo extends AnyAllRouteInfo = DefaultAllRouteInfo,
//   TFrom = undefined,
// > = TFrom extends undefined
//   ? TAllRouteInfo['routePaths'] | `...unsafe-relative-path (cast "as any")`
//   : LooseAutocomplete<'.' | TAllRouteInfo['routePaths']>

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
  removeActionQueue: { action: Action; actionState: ActionState }[]
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
  getRoute: <TId extends keyof TAllRouteInfo['routeInfoById']>(
    id: TId,
  ) => Route<TAllRouteInfo, TAllRouteInfo['routeInfoById'][TId]>
  loadRoute: (
    navigateOpts: BuildNextOptions,
    loaderOpts: { maxAge: number },
  ) => Promise<RouteMatch[]>
  matchRoutes: (
    pathname: string,
    opts?: { strictParseParams?: boolean },
  ) => RouteMatch[]
  loadMatches: (
    resolvedMatches: RouteMatch[],
    loaderOpts?: { withPending?: boolean } & (
      | { preload: true; maxAge: number }
      | { preload?: false; maxAge?: never }
    ),
  ) => Promise<RouteMatch[]>
  invalidateRoute: (opts: MatchLocation) => void
  reload: () => Promise<void>
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
    matchLocation: ToOptions<TAllRouteInfo, TFrom, TTo>,
    opts?: MatchRouteOptions,
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
    removeActionQueue: [],
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
    getRoute: (id) => {
      return router.routesById[id]
    },
    notify: (): void => {
      router.state = {
        ...router.state,
      }
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
      Object.assign(router.options, opts)

      const { basepath, routeConfig } = router.options

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

          const existingRoute = (router.routesById as any)[route.routeId]

          if (existingRoute) {
            if (process.env.NODE_ENV !== 'production') {
              console.warn(
                `Duplicate routes found with id: ${String(route.routeId)}`,
                router.routesById,
                route,
              )
            }
            throw new Error()
          }

          ;(router.routesById as any)[route.routeId] = route

          const children = routeConfig.children as RouteConfig[]

          route.childRoutes = children?.length
            ? recurseRoutes(children, route)
            : undefined

          return route
        })
      }

      const routes = recurseRoutes([rootRouteConfig])

      return routes[0]!
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

      const prevParams = { ...last(fromMatches)?.params }

      let nextParams =
        (dest.params ?? true) === true
          ? prevParams
          : functionalUpdate(dest.params, prevParams)

      if (nextParams) {
        toMatches
          .map((d) => d.options.stringifyParams)
          .filter(Boolean)
          .forEach((fn) => {
            Object.assign({}, nextParams!, fn!(nextParams!))
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
        .map((match) => match.options.preSearchFilters ?? [])
        .flat()
        .filter(Boolean)

      const __postSearchFilters = matches
        .map((match) => match.options.postSearchFilters ?? [])
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

      // Clear out old actions
      router.removeActionQueue.forEach(({ action, actionState }) => {
        if (router.state.currentAction === actionState) {
          router.state.currentAction = undefined
        }
        if (action.current === actionState) {
          action.current = undefined
        }
      })
      router.removeActionQueue = []

      // Cancel any pending matches
      router.cancelMatches()

      // Match the routes
      const unloadedMatches = router.matchRoutes(location.pathname, {
        strictParseParams: true,
      })

      router.state = {
        ...router.state,
        pending: {
          matches: unloadedMatches,
          location: router.location,
        },
      }
      router.notify()

      // Load the matches
      const matches = await router.loadMatches(unloadedMatches, {
        withPending: true,
      })

      if (router.startedLoadingAt !== id) {
        // Ignore side-effects of match loading
        return router.navigationPromise
      }

      const previousMatches = router.state.matches

      previousMatches
        .filter((d) => {
          return !matches.find((dd) => dd.matchId === d.matchId)
        })
        .forEach((d) => {
          d.__.onExit?.({
            params: d.params,
            search: d.routeSearch,
          })
        })

      previousMatches
        .filter((d) => {
          return matches.find((dd) => dd.matchId === d.matchId)
        })
        .forEach((d) => {
          d.options.onTransition?.({
            params: d.params,
            search: d.routeSearch,
          })
        })

      matches
        .filter((d) => {
          return !previousMatches.find((dd) => dd.matchId === d.matchId)
        })
        .forEach((d) => {
          d.__.onExit = d.options.onMatch?.({
            params: d.params,
            search: d.search,
          })
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
          matches.map((d) => d.__.loaderPromise || Promise.resolve()),
        )
      }
      if (router.startedLoadingAt !== id) {
        // Ignore side-effects of match loading
        return
      }
      router.notify()
      router.resolveNavigation()
    },

    cleanPreloadCache: () => {
      const now = Date.now()

      Object.keys(router.preloadCache).forEach((matchId) => {
        const entry = router.preloadCache[matchId]!

        // Don't remove loading matches
        if (entry.match.status === 'loading') {
          return
        }

        // Do not remove successful matches that are still valid
        if (
          entry.match.updatedAt &&
          entry.match.updatedAt + entry.maxAge > now
        ) {
          return
        }

        // Everything else gets removed
        delete router.preloadCache[matchId]
      })
    },

    loadRoute: async (
      navigateOpts: BuildNextOptions = router.location,
      loaderOpts: { maxAge: number },
    ) => {
      const next = router.buildNext(navigateOpts)
      const matches = router.matchRoutes(next.pathname, {
        strictParseParams: true,
      })
      await router.loadMatches(matches, {
        preload: true,
        maxAge: loaderOpts.maxAge,
      })
      return matches
    },

    matchRoutes: (pathname, opts) => {
      router.cleanPreloadCache()

      const matches: RouteMatch[] = []

      if (!router.routeTree) {
        return matches
      }

      const existingMatches = [
        ...router.state.matches,
        ...(router.state.pending?.matches ?? []),
      ]

      const recurse = async (routes: Route<any, any>[]): Promise<void> => {
        const parentMatch = last(matches)
        let params = parentMatch?.params ?? {}

        const filteredRoutes = router.options.filterRoutes?.(routes) ?? routes

        let foundRoutes: Route[] = []

        const findMatchInRoutes = (parentRoutes: Route[], routes: Route[]) => {
          routes.some((route) => {
            if (!route.routePath && route.childRoutes?.length) {
              return findMatchInRoutes(
                [...foundRoutes, route],
                route.childRoutes,
              )
            }

            const fuzzy = !!(
              route.routePath !== '/' || route.childRoutes?.length
            )

            const matchParams = matchPathname(pathname, {
              to: route.fullPath,
              fuzzy,
              caseSensitive:
                route.options.caseSensitive ?? router.options.caseSensitive,
            })

            if (matchParams) {
              let parsedParams

              try {
                parsedParams =
                  route.options.parseParams?.(matchParams!) ?? matchParams
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

            if (!!matchParams) {
              foundRoutes = [...parentRoutes, route]
            }

            return !!foundRoutes.length
          })

          return !!foundRoutes.length
        }

        findMatchInRoutes([], filteredRoutes)

        if (!foundRoutes.length) {
          return
        }

        foundRoutes.forEach((foundRoute) => {
          const interpolatedPath = interpolatePath(foundRoute.routePath, params)
          const matchId = interpolatePath(foundRoute.routeId, params, true)

          const match =
            existingMatches.find((d) => d.matchId === matchId) ||
            router.preloadCache[matchId]?.match ||
            createRouteMatch(router, foundRoute, {
              matchId,
              params,
              pathname: joinPaths([pathname, interpolatedPath]),
            })

          matches.push(match)
        })

        const foundRoute = last(foundRoutes)!

        if (foundRoute.childRoutes?.length) {
          recurse(foundRoute.childRoutes)
        }
      }

      recurse([router.routeTree])

      cascadeLoaderData(matches)

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
        // Validate the match (loads search params etc)
        match.__.validate()

        // If this is a preload, add it to the preload cache
        if (loaderOpts?.preload) {
          router.preloadCache[match.matchId] = {
            maxAge: loaderOpts?.maxAge,
            match,
          }
        }

        // If the match is invalid, errored or idle, trigger it to load
        if (
          (match.status === 'success' && match.isInvalid) ||
          match.status === 'error' ||
          match.status === 'idle'
        ) {
          match.load()
        }

        // If requested, start the pending timers
        if (loaderOpts?.withPending) match.__.startPending()

        // Wait for the first sign of activity from the match
        // This might be completion, error, or a pending state
        await match.__.loadPromise
      })

      router.notify()

      await Promise.all(matchPromises)

      return resolvedMatches
    },

    invalidateRoute: (opts: MatchLocation) => {
      const next = router.buildNext(opts)
      const unloadedMatchIds = router
        .matchRoutes(next.pathname)
        .map((d) => d.matchId)
      ;[
        ...router.state.matches,
        ...(router.state.pending?.matches ?? []),
      ].forEach((match) => {
        if (unloadedMatchIds.includes(match.matchId)) {
          match.invalidate()
        }
      })
    },

    reload: () =>
      router._navigate({
        fromCurrent: true,
        replace: true,
        search: true,
      }),

    resolvePath: (from: string, path: string) => {
      return resolvePath(router.basepath!, from, cleanPath(path))
    },

    matchRoute: (location, opts) => {
      // const location = router.buildNext(opts)

      location = {
        ...location,
        to: location.to
          ? router.resolvePath(location.from ?? '', location.to)
          : undefined,
      }

      const next = router.buildNext(location)

      if (opts?.pending) {
        if (!router.state.pending?.location) {
          return false
        }
        return !!matchPathname(router.state.pending.location.pathname, {
          ...opts,
          to: next.pathname,
        })
      }

      return !!matchPathname(router.state.location.pathname, {
        ...opts,
        to: next.pathname,
      })
    },

    _navigate: (location: BuildNextOptions & { replace?: boolean }) => {
      const next = router.buildNext(location)
      return router.commitLocation(next, location.replace)
    },

    navigate: async ({ from, to = '.', search, hash, replace, params }) => {
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

      invariant(
        !isExternal,
        'Attempting to navigate to external url with router.navigate!',
      )

      return router._navigate({
        from: fromString,
        to: toString,
        search,
        hash,
        replace,
        params,
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
        matches: router.state.matches.map(
          ({ routeLoaderData: loaderData, matchId }) => {
            return {
              matchId,
              loaderData,
            }
          },
        ),
      }
    },
  }

  router.location = router.parseLocation(history.location)
  // router.state.location = __experimental__snapshot?.location ?? router.location
  router.state.location = router.location

  router.update(userOptions)

  // Allow frameworks to hook into the router creation
  router.options.createRouter?.(router)

  // router.mount()

  return router
}

type LinkCurrentTargetElement = {
  preloadTimeout?: null | ReturnType<typeof setTimeout>
}

export interface Route<
  TAllRouteInfo extends AnyAllRouteInfo = DefaultAllRouteInfo,
  TRouteInfo extends AnyRouteInfo = RouteInfo,
> {
  routeId: TRouteInfo['id']
  routeRouteId: TRouteInfo['routeId']
  routePath: TRouteInfo['path']
  fullPath: TRouteInfo['fullPath']
  parentRoute?: AnyRoute
  childRoutes?: AnyRoute[]
  options: RouteOptions
  router: Router<TAllRouteInfo['routeConfig'], TAllRouteInfo>
  buildLink: <TTo extends string = '.'>(
    options: Omit<
      LinkOptions<TAllRouteInfo, TRouteInfo['fullPath'], TTo>,
      'from'
    >,
  ) => LinkInfo
  matchRoute: <
    TTo extends string = '.',
    TResolved extends string = ResolveRelativePath<TRouteInfo['id'], TTo>,
  >(
    matchLocation: CheckRelativePath<
      TAllRouteInfo,
      TRouteInfo['fullPath'],
      NoInfer<TTo>
    > &
      Omit<ToOptions<TAllRouteInfo, TRouteInfo['fullPath'], TTo>, 'from'>,
    opts?: MatchRouteOptions,
  ) => RouteInfoByPath<TAllRouteInfo, TResolved>['allParams']
  navigate: <TTo extends string = '.'>(
    options: Omit<LinkOptions<TAllRouteInfo, TRouteInfo['id'], TTo>, 'from'>,
  ) => Promise<void>
  action: unknown extends TRouteInfo['actionResponse']
    ?
        | Action<TRouteInfo['actionPayload'], TRouteInfo['actionResponse']>
        | undefined
    : Action<TRouteInfo['actionPayload'], TRouteInfo['actionResponse']>
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

  const { id, routeId, path: routePath, fullPath } = routeConfig

  const action =
    router.state.actions[id] ||
    (() => {
      router.state.actions[id] = {
        pending: [],
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

          action.current = actionState
          action.latest = actionState
          action.pending.push(actionState)

          router.state = {
            ...router.state,
            currentAction: actionState,
            latestAction: actionState,
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
            router.removeActionQueue.push({ action, actionState })
            router.notify()
          }
        },
      }
      return router.state.actions[id]!
    })()

  let route: Route<TAllRouteInfo, TRouteInfo> = {
    routeId: id,
    routeRouteId: routeId,
    routePath,
    fullPath,
    options,
    router,
    childRoutes: undefined!,
    parentRoute: parent,
    action,

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

    matchRoute: (matchLocation, opts) => {
      return router.matchRoute(
        {
          ...matchLocation,
          from: fullPath,
        } as any,
        opts,
      )
    },
  }

  router.options.createRoute?.({ router, route })

  return route
}

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
> = {
  to?: ToPathOption<TAllRouteInfo, TFrom, TTo>
  // The new has string or a function to update it
  hash?: Updater<string>
  // The source route path. This is automatically set when using route-level APIs, but for type-safe relative routing on the router itself, this is required
  from?: TFrom
  // // When using relative route paths, this option forces resolution from the current path, instead of the route API's path or `from` path
  // fromCurrent?: boolean
} & CheckPath<TAllRouteInfo, NoInfer<TResolvedTo>> &
  SearchParamOptions<TAllRouteInfo, TFrom, TResolvedTo> &
  PathParamOptions<TAllRouteInfo, TFrom, TResolvedTo>

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

export type CheckPath<TAllRouteInfo extends AnyAllRouteInfo, TPath> = Exclude<
  TPath,
  TAllRouteInfo['routePaths']
> extends never
  ? {}
  : CheckPathError<TAllRouteInfo, Exclude<TPath, TAllRouteInfo['routePaths']>>

export type CheckPathError<TAllRouteInfo extends AnyAllRouteInfo, TInvalids> = {
  Error: `${TInvalids extends string
    ? TInvalids
    : never} is not a valid route path.`
  'Valid Route Paths': TAllRouteInfo['routePaths']
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
        ? ResolveRelativePath<Join<FromRest>, Join<ToRest>>
        : never
      : Split<TTo> extends ['.', ...infer ToRest]
      ? ResolveRelativePath<TFrom, Join<ToRest>>
      : CleanPath<Join<['/', ...Split<TFrom>, ...Split<TTo>]>>
    : never
  : never

export type RouteInfoById<
  TAllRouteInfo extends AnyAllRouteInfo,
  TId,
> = TId extends keyof TAllRouteInfo['routeInfoById']
  ? IsAny<
      TAllRouteInfo['routeInfoById'][TId]['id'],
      RouteInfo,
      TAllRouteInfo['routeInfoById'][TId]
    >
  : never

export type RouteInfoByPath<
  TAllRouteInfo extends AnyAllRouteInfo,
  TPath,
> = TPath extends keyof TAllRouteInfo['routeInfoByFullPath']
  ? IsAny<
      TAllRouteInfo['routeInfoByFullPath'][TPath]['id'],
      RouteInfo,
      TAllRouteInfo['routeInfoByFullPath'][TPath]
    >
  : never

type SearchParamOptions<
  TAllRouteInfo extends AnyAllRouteInfo,
  TFrom,
  TTo,
  TFromSchema = RouteInfoByPath<TAllRouteInfo, TFrom>['fullSearchSchema'],
  TToSchema = RouteInfoByPath<TAllRouteInfo, TTo>['fullSearchSchema'],
> = StartsWith<TFrom, TTo> extends true // If the next route search extend or cover the from route, params will be optional
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

export interface RouteMatch<
  TAllRouteInfo extends AnyAllRouteInfo = DefaultAllRouteInfo,
  TRouteInfo extends AnyRouteInfo = RouteInfo,
> extends Route<TAllRouteInfo, TRouteInfo> {
  matchId: string
  pathname: string
  params: AnyPathParams
  parentMatch?: RouteMatch
  childMatches: RouteMatch[]
  routeSearch: TRouteInfo['searchSchema']
  search: TRouteInfo['fullSearchSchema']
  status: 'idle' | 'loading' | 'success' | 'error'
  updatedAt?: number
  error?: unknown
  isInvalid: boolean
  loaderData: TRouteInfo['loaderData']
  routeLoaderData: TRouteInfo['routeLoaderData']
  isFetching: boolean
  isPending: boolean
  __: {
    element?: GetFrameworkGeneric<'Element', TRouteInfo['loaderData']>
    errorElement?: GetFrameworkGeneric<'Element', TRouteInfo['loaderData']>
    catchElement?: GetFrameworkGeneric<'Element', TRouteInfo['loaderData']>
    pendingElement?: GetFrameworkGeneric<'Element', TRouteInfo['loaderData']>
    loadPromise?: Promise<void>
    loaderPromise?: Promise<void>
    importPromise?: Promise<void>
    elementsPromise?: Promise<void>
    dataPromise?: Promise<void>
    pendingTimeout?: Timeout
    pendingMinTimeout?: Timeout
    pendingMinPromise?: Promise<void>
    onExit?:
      | void
      | ((matchContext: {
          params: TRouteInfo['allParams']
          search: TRouteInfo['fullSearchSchema']
        }) => void)
    abortController: AbortController
    latestId: string
    // setParentMatch: (parentMatch: RouteMatch) => void
    // addChildMatch: (childMatch: RouteMatch) => void
    validate: () => void
    startPending: () => void
    cancelPending: () => void
    notify: () => void
    resolve: () => void
  }
  cancel: () => void
  load: () => Promise<void>
  invalidate: () => void
}

export function createRouteMatch<
  TAllRouteInfo extends AnyAllRouteInfo = DefaultAllRouteInfo,
  TRouteInfo extends AnyRouteInfo = RouteInfo,
>(
  router: Router<any, any>,
  route: Route<TAllRouteInfo, TRouteInfo>,
  opts: {
    matchId: string
    params: TRouteInfo['allParams']
    pathname: string
  },
): RouteMatch<TAllRouteInfo, TRouteInfo> {
  const routeMatch: RouteMatch<TAllRouteInfo, TRouteInfo> = {
    ...route,
    ...opts,
    router,
    routeSearch: {},
    search: {},
    childMatches: [],
    status: 'idle',
    routeLoaderData: {} as TRouteInfo['routeLoaderData'],
    loaderData: {} as TRouteInfo['loaderData'],
    isPending: false,
    isFetching: false,
    isInvalid: false,
    __: {
      abortController: new AbortController(),
      latestId: '',
      resolve: () => {},
      notify: () => {
        routeMatch.__.resolve()
        routeMatch.router.notify()
      },
      startPending: () => {
        const pendingMs =
          routeMatch.options.pendingMs ?? router.options.defaultPendingMs
        const pendingMinMs =
          routeMatch.options.pendingMinMs ?? router.options.defaultPendingMinMs

        if (
          routeMatch.__.pendingTimeout ||
          routeMatch.status !== 'loading' ||
          typeof pendingMs === 'undefined'
        ) {
          return
        }

        routeMatch.__.pendingTimeout = setTimeout(() => {
          routeMatch.isPending = true
          routeMatch.__.resolve()
          if (typeof pendingMinMs !== 'undefined') {
            routeMatch.__.pendingMinPromise = new Promise(
              (r) =>
                (routeMatch.__.pendingMinTimeout = setTimeout(r, pendingMinMs)),
            )
          }
        }, pendingMs)
      },
      cancelPending: () => {
        routeMatch.isPending = false
        clearTimeout(routeMatch.__.pendingTimeout)
        clearTimeout(routeMatch.__.pendingMinTimeout)
        delete routeMatch.__.pendingMinPromise
      },
      // setParentMatch: (parentMatch?: RouteMatch) => {
      //   routeMatch.parentMatch = parentMatch
      // },
      // addChildMatch: (childMatch: RouteMatch) => {
      //   if (
      //     routeMatch.childMatches.find((d) => d.matchId === childMatch.matchId)
      //   ) {
      //     return
      //   }

      //   routeMatch.childMatches.push(childMatch)
      // },
      validate: () => {
        // Validate the search params and stabilize them
        const parentSearch =
          routeMatch.parentMatch?.search ?? router.location.search

        try {
          const prevSearch = routeMatch.routeSearch

          let nextSearch = replaceEqualDeep(
            prevSearch,
            routeMatch.options.validateSearch?.(parentSearch),
          )

          // Invalidate route matches when search param stability changes
          if (prevSearch !== nextSearch) {
            routeMatch.isInvalid = true
          }

          routeMatch.routeSearch = nextSearch

          routeMatch.search = replaceEqualDeep(parentSearch, {
            ...parentSearch,
            ...nextSearch,
          })
        } catch (err: any) {
          console.error(err)
          const error = new (Error as any)('Invalid search params found', {
            cause: err,
          })
          error.code = 'INVALID_SEARCH_PARAMS'
          routeMatch.status = 'error'
          routeMatch.error = error
          // Do not proceed with loading the route
          return
        }
      },
    },
    cancel: () => {
      routeMatch.__.abortController?.abort()
      routeMatch.__.cancelPending()
    },
    invalidate: () => {
      routeMatch.isInvalid = true
    },
    load: async () => {
      const id = '' + Date.now() + Math.random()
      routeMatch.__.latestId = id

      // If the match was in an error state, set it
      // to a loading state again. Otherwise, keep it
      // as loading or resolved
      if (routeMatch.status === 'error' || routeMatch.status === 'idle') {
        routeMatch.status = 'loading'
      }

      // We started loading the route, so it's no longer invalid
      routeMatch.isInvalid = false

      routeMatch.__.loadPromise = new Promise(async (resolve) => {
        // We are now fetching, even if it's in the background of a
        // resolved state
        routeMatch.isFetching = true
        routeMatch.__.resolve = resolve as () => void

        const loaderPromise = (async () => {
          const importer = routeMatch.options.import

          // First, run any importers
          if (importer) {
            routeMatch.__.importPromise = importer({
              params: routeMatch.params,
              // search: routeMatch.search,
            }).then((imported) => {
              routeMatch.__ = {
                ...routeMatch.__,
                ...imported,
              }
            })
          }

          // Wait for the importer to finish before
          // attempting to load elements and data
          await routeMatch.__.importPromise

          // Next, load the elements and data in parallel

          routeMatch.__.elementsPromise = (async () => {
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
                const routeElement = routeMatch.options[type]

                if (routeMatch.__[type]) {
                  return
                }

                if (typeof routeElement === 'function') {
                  const res = await (routeElement as any)(routeMatch)

                  routeMatch.__[type] = res
                } else {
                  routeMatch.__[type] = routeMatch.options[type] as any
                }
              }),
            )
          })()

          routeMatch.__.dataPromise = Promise.resolve().then(async () => {
            try {
              const data = await routeMatch.options.loader?.({
                params: routeMatch.params,
                search: routeMatch.routeSearch,
                signal: routeMatch.__.abortController.signal,
              })
              if (id !== routeMatch.__.latestId) {
                return routeMatch.__.loaderPromise
              }

              routeMatch.routeLoaderData = replaceEqualDeep(
                routeMatch.routeLoaderData,
                data,
              )

              routeMatch.error = undefined
              routeMatch.status = 'success'
              routeMatch.updatedAt = Date.now()
            } catch (err) {
              if (id !== routeMatch.__.latestId) {
                return routeMatch.__.loaderPromise
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
              routeMatch.__.elementsPromise,
              routeMatch.__.dataPromise,
            ])
            if (id !== routeMatch.__.latestId) {
              return routeMatch.__.loaderPromise
            }

            if (routeMatch.__.pendingMinPromise) {
              await routeMatch.__.pendingMinPromise
              delete routeMatch.__.pendingMinPromise
            }
          } finally {
            if (id !== routeMatch.__.latestId) {
              return routeMatch.__.loaderPromise
            }
            routeMatch.__.cancelPending()
            routeMatch.isPending = false
            routeMatch.isFetching = false
            routeMatch.__.notify()
          }
        })()

        routeMatch.__.loaderPromise = loaderPromise
        await loaderPromise

        if (id !== routeMatch.__.latestId) {
          return routeMatch.__.loaderPromise
        }
        delete routeMatch.__.loaderPromise
      })

      return await routeMatch.__.loadPromise
    },
  }

  return routeMatch
}

function cascadeLoaderData(matches: RouteMatch<any, any>[]) {
  matches.forEach((match, index) => {
    const parent = matches[index - 1]

    if (parent) {
      match.loaderData = replaceEqualDeep(match.loaderData, {
        ...parent.loaderData,
        ...match.routeLoaderData,
      })
    }
  })
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

export function last<T>(arr: T[]) {
  return arr[arr.length - 1]
}
