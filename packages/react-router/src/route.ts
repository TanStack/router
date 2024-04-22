import invariant from 'tiny-invariant'
import { useLoaderData, useLoaderDeps, useMatch } from './Matches'
import { joinPaths, trimPathLeft } from './path'
import { useParams } from './useParams'
import { useSearch } from './useSearch'
import { notFound } from './not-found'
import { useNavigate } from './useNavigate'
import type { UseNavigateResult } from './useNavigate'
import type * as React from 'react'
import type { MakeRouteMatch, RouteMatch } from './Matches'
import type { NavigateOptions, ParsePathParams, ToSubOptions } from './link'
import type { ParsedLocation } from './location'
import type { RouteById, RouteIds, RoutePaths } from './routeInfo'
import type { AnyRouter, RegisteredRouter, Router } from './router'
import type {
  Assign,
  Expand,
  IsAny,
  NoInfer,
  PickRequired,
  UnionToIntersection,
} from './utils'
import type { BuildLocationFn, NavigateFn } from './RouterProvider'
import type { NotFoundError } from './not-found'
import type { LazyRoute } from './fileRoute'

export const rootRouteId = '__root__' as const
export type RootRouteId = typeof rootRouteId
export type AnyPathParams = {}

export type SearchSchemaInput = {
  __TSearchSchemaInput__: 'TSearchSchemaInput'
}

export type AnySearchSchema = {}

export type AnyContext = {}

export interface RouteContext {}

export type PreloadableObj = { preload?: () => Promise<void> }

export type RoutePathOptions<TCustomId, TPath> =
  | {
      path: TPath
    }
  | {
      id: TCustomId
    }

export interface StaticDataRouteOption {}

export type RoutePathOptionsIntersection<TCustomId, TPath> =
  UnionToIntersection<RoutePathOptions<TCustomId, TPath>>

export type RouteOptions<
  TParentRoute extends AnyRoute = AnyRoute,
  TCustomId extends string = string,
  TPath extends string = string,
  TSearchSchemaInput extends Record<string, any> = {},
  TSearchSchema extends Record<string, any> = {},
  TSearchSchemaUsed = {},
  TFullSearchSchemaInput = TSearchSchemaUsed,
  TFullSearchSchema = TSearchSchema,
  TParams = AnyPathParams,
  TAllParams = TParams,
  TRouteContextReturn extends RouteContext = RouteContext,
  TRouteContext = RouteContext,
  TRouterContext extends RouteConstraints['TRouterContext'] = AnyContext,
  TAllContext = AnyContext,
  TLoaderDeps extends Record<string, any> = {},
  TLoaderDataReturn = unknown,
  TLoaderData = [TLoaderDataReturn] extends [never]
    ? undefined
    : TLoaderDataReturn,
> = BaseRouteOptions<
  TParentRoute,
  TCustomId,
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
  TLoaderDataReturn
> &
  UpdatableRouteOptions<
    NoInfer<TCustomId>,
    NoInfer<TAllParams>,
    NoInfer<TFullSearchSchema>,
    NoInfer<TLoaderData>,
    NoInfer<TAllContext>,
    NoInfer<TRouteContext>,
    NoInfer<TLoaderDeps>
  >

export type ParamsFallback<
  TPath extends string,
  TParams,
> = unknown extends TParams ? Record<ParsePathParams<TPath>, string> : TParams

export type FileBaseRouteOptions<
  TParentRoute extends AnyRoute = AnyRoute,
  TPath extends string = string,
  TSearchSchemaInput extends Record<string, any> = {},
  TSearchSchema extends Record<string, any> = {},
  TFullSearchSchema = TSearchSchema,
  TParams = {},
  TAllParams = ParamsFallback<TPath, TParams>,
  TRouteContextReturn extends RouteContext = RouteContext,
  TRouteContext = RouteContext,
  TRouterContext extends RouteConstraints['TRouterContext'] = AnyContext,
  TAllContext = AnyContext,
  TLoaderDeps extends Record<string, any> = {},
  TLoaderDataReturn = unknown,
> = {
  validateSearch?: SearchSchemaValidator<TSearchSchemaInput, TSearchSchema>
  shouldReload?:
    | boolean
    | ((
        match: LoaderFnContext<
          TAllParams,
          TFullSearchSchema,
          TAllContext,
          TRouteContext
        >,
      ) => any)
  // This async function is called before a route is loaded.
  // If an error is thrown here, the route's loader will not be called.
  // If thrown during a navigation, the navigation will be cancelled and the error will be passed to the `onError` function.
  // If thrown during a preload event, the error will be logged to the console.
  beforeLoad?: BeforeLoadFn<
    TFullSearchSchema,
    TParentRoute,
    TAllParams,
    TRouteContextReturn,
    TRouterContext
  >
  loaderDeps?: (opts: { search: TFullSearchSchema }) => TLoaderDeps
  loader?: RouteLoaderFn<
    TAllParams,
    NoInfer<TLoaderDeps>,
    NoInfer<TAllContext>,
    NoInfer<TRouteContext>,
    TLoaderDataReturn
  >
} & (
  | {
      // Both or none
      parseParams?: (
        rawParams: IsAny<TPath, any, Record<ParsePathParams<TPath>, string>>,
      ) => TParams extends Record<ParsePathParams<TPath>, any>
        ? TParams
        : 'parseParams must return an object'
      stringifyParams?: (
        params: NoInfer<ParamsFallback<TPath, TParams>>,
      ) => Record<ParsePathParams<TPath>, string>
    }
  | {
      stringifyParams?: never
      parseParams?: never
    }
)

export type BaseRouteOptions<
  TParentRoute extends AnyRoute = AnyRoute,
  TCustomId extends string = string,
  TPath extends string = string,
  TSearchSchemaInput extends Record<string, any> = {},
  TSearchSchema extends Record<string, any> = {},
  TSearchSchemaUsed = {},
  TFullSearchSchemaInput = TSearchSchemaUsed,
  TFullSearchSchema = TSearchSchema,
  TParams = {},
  TAllParams = ParamsFallback<TPath, TParams>,
  TRouteContextReturn extends RouteContext = RouteContext,
  TRouteContext = RouteContext,
  TRouterContext extends RouteConstraints['TRouterContext'] = AnyContext,
  TAllContext = AnyContext,
  TLoaderDeps extends Record<string, any> = {},
  TLoaderDataReturn = unknown,
> = RoutePathOptions<TCustomId, TPath> &
  FileBaseRouteOptions<
    TParentRoute,
    TPath,
    TSearchSchemaInput,
    TSearchSchema,
    TFullSearchSchema,
    TParams,
    TAllParams,
    TRouteContextReturn,
    TRouteContext,
    TRouterContext,
    TAllContext,
    TLoaderDeps,
    TLoaderDataReturn
  > & {
    getParentRoute: () => TParentRoute
  }

type BeforeLoadFn<
  in out TFullSearchSchema,
  in out TParentRoute extends AnyRoute,
  in out TAllParams,
  TRouteContextReturn extends RouteContext,
  in out TRouterContext extends RouteConstraints['TRouterContext'] = AnyContext,
  in out TContext = IsAny<TParentRoute['types']['allContext'], TRouterContext>,
> = (opts: {
  search: TFullSearchSchema
  abortController: AbortController
  preload: boolean
  params: TAllParams
  context: TContext
  location: ParsedLocation
  navigate: NavigateFn
  buildLocation: BuildLocationFn<TParentRoute>
  cause: 'preload' | 'enter' | 'stay'
}) => Promise<TRouteContextReturn> | TRouteContextReturn | void

export type UpdatableRouteOptions<
  TRouteId,
  TAllParams,
  TFullSearchSchema,
  TLoaderData,
  TAllContext,
  TRouteContext,
  TLoaderDeps,
  TRouteMatch = RouteMatch<
    TRouteId,
    TAllParams,
    TFullSearchSchema,
    TLoaderData,
    TAllContext,
    TRouteContext,
    TLoaderDeps
  >,
> = {
  // test?: (args: TAllContext) => void
  // If true, this route will be matched as case-sensitive
  caseSensitive?: boolean
  // If true, this route will be forcefully wrapped in a suspense boundary
  wrapInSuspense?: boolean
  // The content to be rendered when the route is matched. If no component is provided, defaults to `<Outlet />`
  component?: RouteComponent
  errorComponent?: false | null | ErrorRouteComponent
  notFoundComponent?: NotFoundRouteComponent
  pendingComponent?: RouteComponent
  pendingMs?: number
  pendingMinMs?: number
  staleTime?: number
  gcTime?: number
  preloadStaleTime?: number
  preloadGcTime?: number
  // Filter functions that can manipulate search params *before* they are passed to links and navigate
  // calls that match this route.
  preSearchFilters?: Array<SearchFilter<TFullSearchSchema>>
  // Filter functions that can manipulate search params *after* they are passed to links and navigate
  // calls that match this route.
  postSearchFilters?: Array<SearchFilter<TFullSearchSchema>>
  onError?: (err: any) => void
  // These functions are called as route matches are loaded, stick around and leave the active
  // matches
  onEnter?: (match: TRouteMatch) => void
  onStay?: (match: TRouteMatch) => void
  onLeave?: (match: TRouteMatch) => void
  meta?: (ctx: {
    params: TAllParams
    loaderData: TLoaderData
  }) => Array<JSX.IntrinsicElements['meta']>
  links?: () => Array<JSX.IntrinsicElements['link']>
  scripts?: () => Array<JSX.IntrinsicElements['script']>
  headers?: (ctx: { loaderData: TLoaderData }) => Record<string, string>
} & UpdatableStaticRouteOption

export type UpdatableStaticRouteOption =
  {} extends PickRequired<StaticDataRouteOption>
    ? {
        staticData?: StaticDataRouteOption
      }
    : {
        staticData: StaticDataRouteOption
      }

export type MetaDescriptor =
  | { charSet: 'utf-8' }
  | { title: string }
  | { name: string; content: string }
  | { property: string; content: string }
  | { httpEquiv: string; content: string }
  | { 'script:ld+json': LdJsonObject }
  | { tagName: 'meta' | 'link'; [name: string]: string }
  | Record<string, unknown>

type LdJsonObject = { [Key in string]: LdJsonValue } & {
  [Key in string]?: LdJsonValue | undefined
}
type LdJsonArray = Array<LdJsonValue> | ReadonlyArray<LdJsonValue>
type LdJsonPrimitive = string | number | boolean | null
type LdJsonValue = LdJsonPrimitive | LdJsonObject | LdJsonArray

export type RouteLinkEntry = {}

export type ParseParamsOption<TPath extends string, TParams> = ParseParamsFn<
  TPath,
  TParams
>

export type ParseParamsFn<TPath extends string, TParams> = (
  rawParams: IsAny<TPath, any, Record<ParsePathParams<TPath>, string>>,
) => TParams extends Record<ParsePathParams<TPath>, any>
  ? TParams
  : 'parseParams must return an object'

export type ParseParamsObj<TPath extends string, TParams> = {
  parse?: ParseParamsFn<TPath, TParams>
}

// The parse type here allows a zod schema to be passed directly to the validator
export type SearchSchemaValidator<TInput, TReturn> =
  | SearchSchemaValidatorObj<TInput, TReturn>
  | SearchSchemaValidatorFn<TInput, TReturn>

export type SearchSchemaValidatorObj<TInput, TReturn> = {
  parse?: SearchSchemaValidatorFn<TInput, TReturn>
}

export type SearchSchemaValidatorFn<TInput, TReturn> = (
  searchObj: TInput,
) => TReturn

export type RouteLoaderFn<
  in out TAllParams = {},
  in out TLoaderDeps extends Record<string, any> = {},
  in out TAllContext = AnyContext,
  in out TRouteContext = AnyContext,
  TLoaderData = unknown,
> = (
  match: LoaderFnContext<TAllParams, TLoaderDeps, TAllContext, TRouteContext>,
) => Promise<TLoaderData> | TLoaderData

export interface LoaderFnContext<
  in out TAllParams = {},
  in out TLoaderDeps = {},
  in out TAllContext = AnyContext,
  in out TRouteContext = AnyContext,
> {
  abortController: AbortController
  preload: boolean
  params: TAllParams
  deps: TLoaderDeps
  context: Assign<TAllContext, TRouteContext>
  location: ParsedLocation // Do not supply search schema here so as to demotivate people from trying to shortcut loaderDeps
  /**
   * @deprecated Use `throw redirect({ to: '/somewhere' })` instead
   **/
  navigate: (opts: NavigateOptions<AnyRouter>) => Promise<void>
  parentMatchPromise?: Promise<void>
  cause: 'preload' | 'enter' | 'stay'
  route: Route
}

export type SearchFilter<TInput, TResult = TInput> = (prev: TInput) => TResult

export type ResolveId<
  TParentRoute,
  TCustomId extends string,
  TPath extends string,
> = TParentRoute extends { id: infer TParentId extends string }
  ? RoutePrefix<TParentId, string extends TCustomId ? TPath : TCustomId>
  : RootRouteId

export type InferFullSearchSchema<TRoute> = TRoute extends {
  types: {
    fullSearchSchema: infer TFullSearchSchema
  }
}
  ? TFullSearchSchema
  : {}

export type InferFullSearchSchemaInput<TRoute> = TRoute extends {
  types: {
    fullSearchSchemaInput: infer TFullSearchSchemaInput
  }
}
  ? TFullSearchSchemaInput
  : {}

export type ResolveFullSearchSchema<
  TParentRoute extends AnyRoute,
  TSearchSchema,
> = Assign<
  TParentRoute['id'] extends RootRouteId
    ? Omit<TParentRoute['types']['searchSchema'], keyof RootSearchSchema>
    : TParentRoute['types']['fullSearchSchema'],
  TSearchSchema
>

export type ResolveFullSearchSchemaInput<
  TParentRoute extends AnyRoute,
  TSearchSchemaUsed,
> = Assign<
  TParentRoute['id'] extends RootRouteId
    ? Omit<TParentRoute['types']['searchSchemaInput'], keyof RootSearchSchema>
    : TParentRoute['types']['fullSearchSchemaInput'],
  TSearchSchemaUsed
>

export interface AnyRoute
  extends Route<
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
    any,
    any,
    any,
    any,
    any,
    any
  > {}

// eslint-disable-next-line @typescript-eslint/naming-convention
export type MergeFromFromParent<T, U> = IsAny<T, U, T & U>

export type ResolveAllParams<TParentRoute extends AnyRoute, TParams> =
  Record<never, string> extends TParentRoute['types']['allParams']
    ? TParams
    : UnionToIntersection<TParentRoute['types']['allParams'] & TParams> & {}

export type RouteConstraints = {
  TParentRoute: AnyRoute
  TPath: string
  TFullPath: string
  TCustomId: string
  TId: string
  TSearchSchema: AnySearchSchema
  TFullSearchSchema: AnySearchSchema
  TParams: Record<string, any>
  TAllParams: Record<string, any>
  TParentContext: AnyContext
  TRouteContext: RouteContext
  TAllContext: AnyContext
  TRouterContext: AnyContext
  TChildren: unknown
  TRouteTree: AnyRoute
}

export function getRouteApi<
  TId extends RouteIds<RegisteredRouter['routeTree']>,
  TRoute extends AnyRoute = RouteById<RegisteredRouter['routeTree'], TId>,
  TFullSearchSchema = TRoute['types']['fullSearchSchema'],
  TAllParams = TRoute['types']['allParams'],
  TAllContext = TRoute['types']['allContext'],
  TLoaderDeps = TRoute['types']['loaderDeps'],
  TLoaderData = TRoute['types']['loaderData'],
>(id: TId) {
  return new RouteApi<
    TId,
    TRoute,
    TFullSearchSchema,
    TAllParams,
    TAllContext,
    TLoaderDeps,
    TLoaderData
  >({ id })
}

export class RouteApi<
  TId extends RouteIds<RegisteredRouter['routeTree']>,
  TRoute extends AnyRoute = RouteById<RegisteredRouter['routeTree'], TId>,
  TFullSearchSchema = TRoute['types']['fullSearchSchema'],
  TAllParams = TRoute['types']['allParams'],
  TAllContext = TRoute['types']['allContext'],
  TLoaderDeps = TRoute['types']['loaderDeps'],
  TLoaderData = TRoute['types']['loaderData'],
> {
  id: TId

  /**
   * @deprecated Use the `getRouteApi` function instead.
   */
  constructor({ id }: { id: TId }) {
    this.id = id as any
  }

  useMatch = <
    TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
    TRouteMatch = MakeRouteMatch<TRouteTree, TId>,
    TSelected = TRouteMatch,
  >(opts?: {
    select?: (match: TRouteMatch) => TSelected
  }): TSelected => {
    return useMatch({ select: opts?.select, from: this.id })
  }

  useRouteContext = <TSelected = Expand<TAllContext>>(opts?: {
    select?: (s: Expand<TAllContext>) => TSelected
  }): TSelected => {
    return useMatch({
      from: this.id,
      select: (d: any) => (opts?.select ? opts.select(d.context) : d.context),
    })
  }

  useSearch = <TSelected = Expand<TFullSearchSchema>>(opts?: {
    select?: (s: Expand<TFullSearchSchema>) => TSelected
  }): TSelected => {
    return useSearch({ ...opts, from: this.id })
  }

  useParams = <TSelected = Expand<TAllParams>>(opts?: {
    select?: (s: Expand<TAllParams>) => TSelected
  }): TSelected => {
    return useParams({ ...opts, from: this.id })
  }

  useLoaderDeps = <TSelected = TLoaderDeps>(opts?: {
    select?: (s: TLoaderDeps) => TSelected
  }): TSelected => {
    return useLoaderDeps({ ...opts, from: this.id, strict: false } as any)
  }

  useLoaderData = <TSelected = TLoaderData>(opts?: {
    select?: (s: TLoaderData) => TSelected
  }): TSelected => {
    return useLoaderData({ ...opts, from: this.id, strict: false } as any)
  }

  useNavigate = () => {
    return useNavigate({ from: this.id })
  }

  notFound = (opts?: NotFoundError) => {
    return notFound({ routeId: this.id as string, ...opts })
  }
}

export class Route<
  in out TParentRoute extends RouteConstraints['TParentRoute'] = AnyRoute,
  in out TPath extends RouteConstraints['TPath'] = '/',
  in out TFullPath extends RouteConstraints['TFullPath'] = ResolveFullPath<
    TParentRoute,
    TPath
  >,
  in out TCustomId extends RouteConstraints['TCustomId'] = string,
  in out TId extends RouteConstraints['TId'] = ResolveId<
    TParentRoute,
    TCustomId,
    TPath
  >,
  in out TSearchSchemaInput extends RouteConstraints['TSearchSchema'] = {},
  in out TSearchSchema extends RouteConstraints['TSearchSchema'] = {},
  in out TSearchSchemaUsed = TSearchSchemaInput extends SearchSchemaInput
    ? Omit<TSearchSchemaInput, keyof SearchSchemaInput>
    : TSearchSchema,
  in out TFullSearchSchemaInput = ResolveFullSearchSchemaInput<
    TParentRoute,
    TSearchSchemaUsed
  >,
  in out TFullSearchSchema = ResolveFullSearchSchema<
    TParentRoute,
    TSearchSchema
  >,
  in out TParams = Record<ParsePathParams<TPath>, string>,
  in out TAllParams = ResolveAllParams<TParentRoute, TParams>,
  TRouteContextReturn extends RouteConstraints['TRouteContext'] = RouteContext,
  in out TRouteContext = [TRouteContextReturn] extends [never]
    ? RouteContext
    : TRouteContextReturn,
  in out TAllContext = Assign<
    IsAny<TParentRoute['types']['allContext'], {}>,
    TRouteContext
  >,
  in out TRouterContext extends RouteConstraints['TRouterContext'] = AnyContext,
  in out TLoaderDeps extends Record<string, any> = {},
  TLoaderDataReturn = unknown,
  in out TLoaderData = [TLoaderDataReturn] extends [never]
    ? undefined
    : TLoaderDataReturn,
  in out TChildren extends RouteConstraints['TChildren'] = unknown,
> {
  isRoot: TParentRoute extends Route<any> ? true : false
  options: RouteOptions<
    TParentRoute,
    TCustomId,
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
    TLoaderDataReturn,
    TLoaderData
  >

  // Set up in this.init()
  parentRoute!: TParentRoute
  id!: TId
  // customId!: TCustomId
  path!: TPath
  fullPath!: TFullPath
  to!: TrimPathRight<TFullPath>

  // Optional
  children?: TChildren
  originalIndex?: number
  router?: AnyRouter
  rank!: number
  lazyFn?: () => Promise<LazyRoute<any>>

  /**
   * @deprecated Use the `createRoute` function instead.
   */
  constructor(
    options?: RouteOptions<
      TParentRoute,
      TCustomId,
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
      TLoaderDataReturn,
      TLoaderData
    >,
  ) {
    this.options = (options as any) || {}

    this.isRoot = !options?.getParentRoute as any
    invariant(
      !((options as any)?.id && (options as any)?.path),
      `Route cannot have both an 'id' and a 'path' option.`,
    )
    ;(this as any).$$typeof = Symbol.for('react.memo')
  }

  types!: {
    parentRoute: TParentRoute
    path: TPath
    to: TrimPathRight<TFullPath>
    fullPath: TFullPath
    customId: TCustomId
    id: TId
    searchSchema: TSearchSchema
    searchSchemaInput: TSearchSchemaInput
    searchSchemaUsed: TSearchSchemaUsed
    fullSearchSchema: TFullSearchSchema
    fullSearchSchemaInput: TFullSearchSchemaInput
    params: TParams
    allParams: TAllParams
    routeContext: TRouteContext
    allContext: TAllContext
    children: TChildren
    routerContext: TRouterContext
    loaderData: TLoaderData
    loaderDeps: TLoaderDeps
  }

  init = (opts: { originalIndex: number }): void => {
    this.originalIndex = opts.originalIndex

    const options = this.options as
      | (RouteOptions<
          TParentRoute,
          TCustomId,
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
          TLoaderDataReturn,
          TLoaderData
        > &
          RoutePathOptionsIntersection<TCustomId, TPath>)
      | undefined

    const isRoot = !options?.path && !options?.id

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    this.parentRoute = this.options?.getParentRoute?.()

    if (isRoot) {
      this.path = rootRouteId as TPath
    } else {
      invariant(
        this.parentRoute,
        `Child Route instances must pass a 'getParentRoute: () => ParentRoute' option that returns a Route instance.`,
      )
    }

    let path: undefined | string = isRoot ? rootRouteId : options.path

    // If the path is anything other than an index path, trim it up
    if (path && path !== '/') {
      path = trimPathLeft(path)
    }

    const customId = options?.id || path

    // Strip the parentId prefix from the first level of children
    let id = isRoot
      ? rootRouteId
      : joinPaths([
          this.parentRoute.id === rootRouteId ? '' : this.parentRoute.id,
          customId,
        ])

    if (path === rootRouteId) {
      path = '/'
    }

    if (id !== rootRouteId) {
      id = joinPaths(['/', id])
    }

    const fullPath =
      id === rootRouteId ? '/' : joinPaths([this.parentRoute.fullPath, path])

    this.path = path as TPath
    this.id = id as TId
    // this.customId = customId as TCustomId
    this.fullPath = fullPath as TFullPath
    this.to = fullPath as TrimPathRight<TFullPath>
  }

  addChildren = <const TNewChildren extends ReadonlyArray<AnyRoute>>(
    children: TNewChildren,
  ): Route<
    TParentRoute,
    TPath,
    TFullPath,
    TCustomId,
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
    TLoaderDataReturn,
    TLoaderData,
    TNewChildren
  > => {
    this.children = children as any
    return this as any
  }

  updateLoader = <TNewLoaderData = unknown>(options: {
    loader: RouteLoaderFn<
      TAllParams,
      TLoaderDeps,
      TAllContext,
      TRouteContext,
      TNewLoaderData
    >
  }) => {
    Object.assign(this.options, options)
    return this as unknown as Route<
      TParentRoute,
      TPath,
      TFullPath,
      TCustomId,
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
      TNewLoaderData,
      TChildren
    >
  }

  update = (
    options: UpdatableRouteOptions<
      TCustomId,
      TAllParams,
      TFullSearchSchema,
      TLoaderData,
      TAllContext,
      TRouteContext,
      TLoaderDeps
    >,
  ): this => {
    Object.assign(this.options, options)
    return this
  }

  lazy = (lazyFn: () => Promise<LazyRoute<any>>): this => {
    this.lazyFn = lazyFn
    return this
  }

  useMatch = <
    TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
    TRouteMatch = MakeRouteMatch<TRouteTree, TId>,
    TSelected = TRouteMatch,
  >(opts?: {
    select?: (match: TRouteMatch) => TSelected
  }): TSelected => {
    return useMatch({ ...opts, from: this.id })
  }

  useRouteContext = <TSelected = Expand<TAllContext>>(opts?: {
    select?: (search: Expand<TAllContext>) => TSelected
  }): TSelected => {
    return useMatch({
      ...opts,
      from: this.id,
      select: (d: any) => (opts?.select ? opts.select(d.context) : d.context),
    })
  }

  useSearch = <TSelected = Expand<TFullSearchSchema>>(opts?: {
    select?: (search: Expand<TFullSearchSchema>) => TSelected
  }): TSelected => {
    return useSearch({ ...opts, from: this.id })
  }

  useParams = <TSelected = Expand<TAllParams>>(opts?: {
    select?: (search: Expand<TAllParams>) => TSelected
  }): TSelected => {
    return useParams({ ...opts, from: this.id })
  }

  useLoaderDeps = <TSelected = TLoaderDeps>(opts?: {
    select?: (s: TLoaderDeps) => TSelected
  }): TSelected => {
    return useLoaderDeps({ ...opts, from: this.id } as any)
  }

  useLoaderData = <TSelected = TLoaderData>(opts?: {
    select?: (search: TLoaderData) => TSelected
  }): TSelected => {
    return useLoaderData({ ...opts, from: this.id } as any)
  }

  useNavigate = (): UseNavigateResult<string> => {
    return useNavigate({ from: this.id })
  }
}

export function createRoute<
  TParentRoute extends RouteConstraints['TParentRoute'] = AnyRoute,
  TPath extends RouteConstraints['TPath'] = '/',
  TFullPath extends RouteConstraints['TFullPath'] = ResolveFullPath<
    TParentRoute,
    TPath
  >,
  TCustomId extends RouteConstraints['TCustomId'] = string,
  TId extends RouteConstraints['TId'] = ResolveId<
    TParentRoute,
    TCustomId,
    TPath
  >,
  TSearchSchemaInput extends RouteConstraints['TSearchSchema'] = {},
  TSearchSchema extends RouteConstraints['TSearchSchema'] = {},
  TSearchSchemaUsed = TSearchSchemaInput extends SearchSchemaInput
    ? Omit<TSearchSchemaInput, keyof SearchSchemaInput>
    : TSearchSchema,
  TFullSearchSchemaInput = ResolveFullSearchSchemaInput<
    TParentRoute,
    TSearchSchemaUsed
  >,
  TFullSearchSchema = ResolveFullSearchSchema<TParentRoute, TSearchSchema>,
  TParams = Record<ParsePathParams<TPath>, string>,
  TAllParams = ResolveAllParams<TParentRoute, TParams>,
  TRouteContextReturn extends RouteConstraints['TRouteContext'] = RouteContext,
  TRouteContext = [TRouteContextReturn] extends [never]
    ? RouteContext
    : TRouteContextReturn,
  TAllContext = Assign<
    IsAny<TParentRoute['types']['allContext'], {}>,
    TRouteContext
  >,
  TRouterContext extends RouteConstraints['TRouterContext'] = AnyContext,
  TLoaderDeps extends Record<string, any> = {},
  TLoaderDataReturn = unknown,
  TLoaderData = [TLoaderDataReturn] extends [never]
    ? undefined
    : TLoaderDataReturn,
  TChildren extends RouteConstraints['TChildren'] = unknown,
>(
  options: RouteOptions<
    TParentRoute,
    TCustomId,
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
    TLoaderDataReturn,
    TLoaderData
  >,
) {
  return new Route<
    TParentRoute,
    TPath,
    TFullPath,
    TCustomId,
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
    TLoaderDataReturn,
    TLoaderData,
    TChildren
  >(options)
}

export type AnyRootRoute = RootRoute<any, any, any, any, any, any, any, any>

export function createRootRouteWithContext<TRouterContext extends {}>() {
  return <
    TSearchSchemaInput extends Record<string, any> = RootSearchSchema,
    TSearchSchema extends Record<string, any> = RootSearchSchema,
    TSearchSchemaUsed extends Record<string, any> = RootSearchSchema,
    TRouteContextReturn extends RouteContext = RouteContext,
    TRouteContext extends RouteContext = [TRouteContextReturn] extends [never]
      ? RouteContext
      : TRouteContextReturn,
    TLoaderDeps extends Record<string, any> = {},
    TLoaderDataReturn = unknown,
    TLoaderData = [TLoaderDataReturn] extends [never]
      ? undefined
      : TLoaderDataReturn,
  >(
    options?: Omit<
      RouteOptions<
        any, // TParentRoute
        RootRouteId, // TCustomId
        '', // TPath
        TSearchSchemaInput, // TSearchSchemaInput
        TSearchSchema, // TSearchSchema
        TSearchSchemaUsed,
        TSearchSchemaUsed, //TFullSearchSchemaInput
        TSearchSchema, // TFullSearchSchema
        {}, // TParams
        {}, // TAllParams
        TRouteContextReturn, // TRouteContextReturn
        TRouteContext, // TRouteContext
        TRouterContext,
        Assign<TRouterContext, TRouteContext>, // TAllContext
        TLoaderDeps,
        TLoaderDataReturn, // TLoaderDataReturn,
        TLoaderData // TLoaderData,
      >,
      | 'path'
      | 'id'
      | 'getParentRoute'
      | 'caseSensitive'
      | 'parseParams'
      | 'stringifyParams'
    >,
  ) => {
    return createRootRoute<
      TSearchSchemaInput,
      TSearchSchema,
      TSearchSchemaUsed,
      TRouteContextReturn,
      TRouteContext,
      TRouterContext,
      TLoaderDeps,
      TLoaderData
    >(options as any)
  }
}

/**
 * @deprecated Use the `createRootRouteWithContext` function instead.
 */
export const rootRouteWithContext = createRootRouteWithContext

export type RootSearchSchema = {
  __TRootSearchSchema__: '__TRootSearchSchema__'
}

export class RootRoute<
  in out TSearchSchemaInput extends Record<string, any> = RootSearchSchema,
  in out TSearchSchema extends Record<string, any> = RootSearchSchema,
  in out TSearchSchemaUsed extends Record<string, any> = RootSearchSchema,
  TRouteContextReturn extends RouteContext = RouteContext,
  in out TRouteContext extends RouteContext = [TRouteContextReturn] extends [
    never,
  ]
    ? RouteContext
    : TRouteContextReturn,
  in out TRouterContext extends {} = {},
  TLoaderDeps extends Record<string, any> = {},
  TLoaderDataReturn = unknown,
  in out TLoaderData = [TLoaderDataReturn] extends [never]
    ? undefined
    : TLoaderDataReturn,
> extends Route<
  any, // TParentRoute
  '/', // TPath
  '/', // TFullPath
  string, // TCustomId
  RootRouteId, // TId
  TSearchSchemaInput, // TSearchSchemaInput
  TSearchSchema, // TSearchSchema
  TSearchSchemaUsed,
  TSearchSchemaUsed, // TFullSearchSchemaInput
  TSearchSchema, // TFullSearchSchema
  {}, // TParams
  {}, // TAllParams
  TRouteContextReturn, // TRouteContextReturn
  TRouteContext, // TRouteContext
  Assign<TRouterContext, TRouteContext>, // TAllContext
  TRouterContext, // TRouterContext
  TLoaderDeps,
  TLoaderDataReturn,
  TLoaderData,
  any // TChildren
> {
  /**
   * @deprecated `RootRoute` is now an internal implementation detail. Use `createRootRoute()` instead.
   */
  constructor(
    options?: Omit<
      RouteOptions<
        any, // TParentRoute
        RootRouteId, // TCustomId
        '', // TPath
        TSearchSchemaInput, // TSearchSchemaInput
        TSearchSchema, // TSearchSchema
        TSearchSchemaUsed,
        TSearchSchemaUsed, // TFullSearchSchemaInput
        TSearchSchema, // TFullSearchSchema
        {}, // TParams
        {}, // TAllParams
        TRouteContextReturn, // TRouteContextReturn
        TRouteContext, // TRouteContext
        TRouterContext,
        Assign<TRouterContext, TRouteContext>, // TAllContext
        TLoaderDeps,
        TLoaderDataReturn,
        TLoaderData
      >,
      | 'path'
      | 'id'
      | 'getParentRoute'
      | 'caseSensitive'
      | 'parseParams'
      | 'stringifyParams'
    >,
  ) {
    super(options as any)
  }
}

export function createRootRoute<
  TSearchSchemaInput extends Record<string, any> = RootSearchSchema,
  TSearchSchema extends Record<string, any> = RootSearchSchema,
  TSearchSchemaUsed extends Record<string, any> = RootSearchSchema,
  TRouteContextReturn extends RouteContext = RouteContext,
  TRouteContext extends RouteContext = [TRouteContextReturn] extends [never]
    ? RouteContext
    : TRouteContextReturn,
  TRouterContext extends {} = {},
  TLoaderDeps extends Record<string, any> = {},
  TLoaderDataReturn = unknown,
  TLoaderData = [TLoaderDataReturn] extends [never]
    ? undefined
    : TLoaderDataReturn,
>(
  options?: Omit<
    RouteOptions<
      any, // TParentRoute
      RootRouteId, // TCustomId
      '', // TPath
      TSearchSchemaInput, // TSearchSchemaInput
      TSearchSchema, // TSearchSchema
      TSearchSchemaUsed,
      TSearchSchemaUsed, // TFullSearchSchemaInput
      TSearchSchema, // TFullSearchSchema
      {}, // TParams
      {}, // TAllParams
      TRouteContextReturn, // TRouteContextReturn
      TRouteContext, // TRouteContext
      TRouterContext,
      Assign<TRouterContext, TRouteContext>, // TAllContext
      TLoaderDeps,
      TLoaderDataReturn,
      TLoaderData
    >,
    | 'path'
    | 'id'
    | 'getParentRoute'
    | 'caseSensitive'
    | 'parseParams'
    | 'stringifyParams'
  >,
) {
  return new RootRoute<
    TSearchSchemaInput,
    TSearchSchema,
    TSearchSchemaUsed,
    TRouteContextReturn,
    TRouteContext,
    TRouterContext,
    TLoaderDeps,
    TLoaderDataReturn,
    TLoaderData
  >(options)
}

export type ResolveFullPath<
  TParentRoute extends AnyRoute,
  TPath extends string,
  TPrefixed = RoutePrefix<TParentRoute['fullPath'], TPath>,
> = TPrefixed extends RootRouteId ? '/' : TPrefixed

type RoutePrefix<
  TPrefix extends string,
  TPath extends string,
> = string extends TPath
  ? RootRouteId
  : TPath extends string
    ? TPrefix extends RootRouteId
      ? TPath extends '/'
        ? '/'
        : `/${TrimPath<TPath>}`
      : `${TPrefix}/${TPath}` extends '/'
        ? '/'
        : `/${TrimPathLeft<`${TrimPathRight<TPrefix>}/${TrimPath<TPath>}`>}`
    : never

export type TrimPath<T extends string> = '' extends T
  ? ''
  : TrimPathRight<TrimPathLeft<T>>

export type TrimPathLeft<T extends string> =
  T extends `${RootRouteId}/${infer U}`
    ? TrimPathLeft<U>
    : T extends `/${infer U}`
      ? TrimPathLeft<U>
      : T
export type TrimPathRight<T extends string> = T extends '/'
  ? '/'
  : T extends `${infer U}/`
    ? TrimPathRight<U>
    : T

export type RouteMask<TRouteTree extends AnyRoute> = {
  routeTree: TRouteTree
  from: RoutePaths<TRouteTree>
  to?: any
  params?: any
  search?: any
  hash?: any
  state?: any
  unmaskOnReload?: boolean
}

export function createRouteMask<
  TRouteTree extends AnyRoute,
  TFrom extends RoutePaths<TRouteTree>,
  TTo extends string,
>(
  opts: {
    routeTree: TRouteTree
  } & ToSubOptions<Router<TRouteTree, 'never'>, TFrom, TTo>,
): RouteMask<TRouteTree> {
  return opts as any
}

/**
 * @deprecated Use `ErrorComponentProps` instead.
 */
export type ErrorRouteProps = {
  error: unknown
  info?: { componentStack: string }
  reset: () => void
}

export type ErrorComponentProps = {
  error: unknown
  info?: { componentStack: string }
  reset: () => void
}
export type NotFoundRouteProps = {
  // TODO: Make sure this is `| null | undefined` (this is for global not-founds)
  data: unknown
}
//

export type ReactNode = any

export type SyncRouteComponent<TProps> =
  | ((props: TProps) => ReactNode)
  | React.LazyExoticComponent<(props: TProps) => ReactNode>

export type AsyncRouteComponent<TProps> = SyncRouteComponent<TProps> & {
  preload?: () => Promise<void>
}

export type RouteComponent<TProps = any> = SyncRouteComponent<TProps> &
  AsyncRouteComponent<TProps>

export type ErrorRouteComponent = RouteComponent<ErrorComponentProps>

export type NotFoundRouteComponent = SyncRouteComponent<NotFoundRouteProps>

export class NotFoundRoute<
  TParentRoute extends AnyRootRoute,
  TSearchSchemaInput extends Record<string, any> = {},
  TSearchSchema extends RouteConstraints['TSearchSchema'] = {},
  TSearchSchemaUsed extends RouteConstraints['TSearchSchema'] = {},
  TFullSearchSchemaInput extends
    RouteConstraints['TFullSearchSchema'] = ResolveFullSearchSchemaInput<
    TParentRoute,
    TSearchSchemaUsed
  >,
  TFullSearchSchema = ResolveFullSearchSchema<TParentRoute, TSearchSchema>,
  TRouteContextReturn extends RouteConstraints['TRouteContext'] = AnyContext,
  TRouteContext extends RouteConstraints['TRouteContext'] = RouteContext,
  TAllContext = Assign<
    IsAny<TParentRoute['types']['allContext'], {}>,
    TRouteContext
  >,
  TRouterContext extends RouteConstraints['TRouterContext'] = AnyContext,
  TLoaderDeps extends Record<string, any> = {},
  TLoaderDataReturn = unknown,
  TLoaderData = [TLoaderDataReturn] extends [never]
    ? undefined
    : TLoaderDataReturn,
  TChildren extends RouteConstraints['TChildren'] = unknown,
> extends Route<
  TParentRoute,
  '/404',
  '/404',
  '404',
  '404',
  TSearchSchemaInput,
  TSearchSchema,
  TSearchSchemaUsed,
  TFullSearchSchemaInput,
  TFullSearchSchema,
  {},
  {},
  TRouteContextReturn,
  TRouteContext,
  TAllContext,
  TRouterContext,
  TLoaderDeps,
  TLoaderDataReturn,
  TLoaderData,
  TChildren
> {
  constructor(
    options: Omit<
      RouteOptions<
        TParentRoute,
        string,
        string,
        TSearchSchemaInput,
        TSearchSchema,
        TSearchSchemaUsed,
        TFullSearchSchemaInput,
        TFullSearchSchema,
        {},
        {},
        TRouteContextReturn,
        TRouteContext,
        TRouterContext,
        TAllContext,
        TLoaderDeps,
        TLoaderDataReturn,
        TLoaderData
      >,
      'caseSensitive' | 'parseParams' | 'stringifyParams' | 'path' | 'id'
    >,
  ) {
    super({
      ...(options as any),
      id: '404',
    })
  }
}
