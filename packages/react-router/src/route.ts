import invariant from 'tiny-invariant'
import { joinPaths, trimPathLeft } from './path'
import { useLoaderData } from './useLoaderData'
import { useLoaderDeps } from './useLoaderDeps'
import { useParams } from './useParams'
import { useSearch } from './useSearch'
import { notFound } from './not-found'
import { useNavigate } from './useNavigate'
import { rootRouteId } from './root'
import { useMatch } from './useMatch'
import type { UseLoaderDataRoute } from './useLoaderData'
import type { UseMatchRoute } from './useMatch'
import type { UseLoaderDepsRoute } from './useLoaderDeps'
import type { UseParamsRoute } from './useParams'
import type { UseSearchRoute } from './useSearch'
import type * as React from 'react'
import type { RootRouteId } from './root'
import type { UseNavigateResult } from './useNavigate'
import type {
  AnyRouteMatch,
  MakeRouteMatchFromRoute,
  MakeRouteMatchUnion,
  RouteMatch,
} from './Matches'
import type { NavigateOptions, ParsePathParams, ToMaskOptions } from './link'
import type { ParsedLocation } from './location'
import type { RouteById, RouteIds, RoutePaths } from './routeInfo'
import type { AnyRouter, RegisteredRouter, Router } from './router'
import type {
  Assign,
  Constrain,
  ConstrainLiteral,
  Expand,
  NoInfer,
} from './utils'
import type { BuildLocationFn, NavigateFn } from './RouterProvider'
import type { NotFoundError } from './not-found'
import type { LazyRoute } from './fileRoute'
import type {
  AnySchema,
  AnyStandardSchemaValidator,
  AnyValidator,
  AnyValidatorAdapter,
  AnyValidatorObj,
  DefaultValidator,
  ResolveSearchValidatorInput,
  ResolveValidatorOutput,
  StandardSchemaValidator,
  ValidatorAdapter,
  ValidatorFn,
  ValidatorObj,
} from './validators'
import type { UseRouteContextRoute } from './useRouteContext'

export type AnyPathParams = {}

export type SearchSchemaInput = {
  __TSearchSchemaInput__: 'TSearchSchemaInput'
}

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

export type RoutePathOptionsIntersection<TCustomId, TPath> = {
  path: TPath
  id: TCustomId
}

export type RouteOptions<
  TParentRoute extends AnyRoute = AnyRoute,
  TId extends string = string,
  TCustomId extends string = string,
  TFullPath extends string = string,
  TPath extends string = string,
  TSearchValidator = undefined,
  TParams = AnyPathParams,
  TLoaderDeps extends Record<string, any> = {},
  TLoaderFn = undefined,
  TRouterContext = {},
  TRouteContextFn = AnyContext,
  TBeforeLoadFn = AnyContext,
> = BaseRouteOptions<
  TParentRoute,
  TId,
  TCustomId,
  TPath,
  TSearchValidator,
  TParams,
  TLoaderDeps,
  TLoaderFn,
  TRouterContext,
  TRouteContextFn,
  TBeforeLoadFn
> &
  UpdatableRouteOptions<
    NoInfer<TParentRoute>,
    NoInfer<TCustomId>,
    NoInfer<TFullPath>,
    NoInfer<TParams>,
    NoInfer<TSearchValidator>,
    NoInfer<TLoaderFn>,
    NoInfer<TLoaderDeps>,
    NoInfer<TRouterContext>,
    NoInfer<TRouteContextFn>,
    NoInfer<TBeforeLoadFn>
  >

export type ParseSplatParams<TPath extends string> = TPath &
  `${string}$` extends never
  ? TPath & `${string}$/${string}` extends never
    ? never
    : '_splat'
  : '_splat'

export interface SplatParams {
  _splat?: string
}

export type ResolveParams<TPath extends string> =
  ParseSplatParams<TPath> extends never
    ? Record<ParsePathParams<TPath>, string>
    : Record<ParsePathParams<TPath>, string> & SplatParams

export type ParseParamsFn<in out TPath extends string, in out TParams> = (
  rawParams: ResolveParams<TPath>,
) => TParams extends Record<ParsePathParams<TPath>, any>
  ? TParams
  : Record<ParsePathParams<TPath>, any>

export type StringifyParamsFn<in out TPath extends string, in out TParams> = (
  params: TParams,
) => ResolveParams<TPath>

export type ParamsOptions<in out TPath extends string, in out TParams> = {
  params?: {
    parse?: ParseParamsFn<TPath, TParams>
    stringify?: StringifyParamsFn<TPath, TParams>
  }

  /** 
  @deprecated Use params.parse instead
  */
  parseParams?: ParseParamsFn<TPath, TParams>

  /** 
  @deprecated Use params.stringify instead
  */
  stringifyParams?: StringifyParamsFn<TPath, TParams>
}

export interface FullSearchSchemaOption<
  in out TParentRoute extends AnyRoute,
  in out TSearchValidator,
> {
  search: Expand<ResolveFullSearchSchema<TParentRoute, TSearchValidator>>
}

export type RouteContextFn<
  in out TParentRoute extends AnyRoute,
  in out TSearchValidator,
  in out TParams,
  in out TRouterContext,
> = (
  ctx: RouteContextOptions<
    TParentRoute,
    TSearchValidator,
    TParams,
    TRouterContext
  >,
) => any

export type BeforeLoadFn<
  in out TParentRoute extends AnyRoute,
  in out TSearchValidator,
  in out TParams,
  in out TRouterContext,
  in out TRouteContextFn,
> = (
  ctx: BeforeLoadContextOptions<
    TParentRoute,
    TSearchValidator,
    TParams,
    TRouterContext,
    TRouteContextFn
  >,
) => any

export type FileBaseRouteOptions<
  TParentRoute extends AnyRoute = AnyRoute,
  TId extends string = string,
  TPath extends string = string,
  TSearchValidator = undefined,
  TParams = {},
  TLoaderDeps extends Record<string, any> = {},
  TLoaderFn = undefined,
  TRouterContext = {},
  TRouteContextFn = AnyContext,
  TBeforeLoadFn = AnyContext,
> = ParamsOptions<TPath, TParams> & {
  validateSearch?: Constrain<TSearchValidator, AnyValidator, DefaultValidator>

  shouldReload?:
    | boolean
    | ((
        match: LoaderFnContext<
          TParentRoute,
          TId,
          TParams,
          TLoaderDeps,
          TRouterContext,
          TRouteContextFn,
          TBeforeLoadFn
        >,
      ) => any)

  context?: Constrain<
    TRouteContextFn,
    (
      ctx: RouteContextOptions<
        TParentRoute,
        TParams,
        TRouterContext,
        TLoaderDeps
      >,
    ) => any
  >

  // This async function is called before a route is loaded.
  // If an error is thrown here, the route's loader will not be called.
  // If thrown during a navigation, the navigation will be cancelled and the error will be passed to the `onError` function.
  // If thrown during a preload event, the error will be logged to the console.
  beforeLoad?: Constrain<
    TBeforeLoadFn,
    (
      ctx: BeforeLoadContextOptions<
        TParentRoute,
        TSearchValidator,
        TParams,
        TRouterContext,
        TRouteContextFn
      >,
    ) => any
  >

  loaderDeps?: (
    opts: FullSearchSchemaOption<TParentRoute, TSearchValidator>,
  ) => TLoaderDeps

  loader?: Constrain<
    TLoaderFn,
    (
      ctx: LoaderFnContext<
        TParentRoute,
        TId,
        TParams,
        TLoaderDeps,
        TRouterContext,
        TRouteContextFn,
        TBeforeLoadFn
      >,
    ) => any
  >
}

export type BaseRouteOptions<
  TParentRoute extends AnyRoute = AnyRoute,
  TId extends string = string,
  TCustomId extends string = string,
  TPath extends string = string,
  TSearchValidator = undefined,
  TParams = {},
  TLoaderDeps extends Record<string, any> = {},
  TLoaderFn = undefined,
  TRouterContext = {},
  TRouteContextFn = AnyContext,
  TBeforeLoadFn = AnyContext,
> = RoutePathOptions<TCustomId, TPath> &
  FileBaseRouteOptions<
    TParentRoute,
    TId,
    TPath,
    TSearchValidator,
    TParams,
    TLoaderDeps,
    TLoaderFn,
    TRouterContext,
    TRouteContextFn,
    TBeforeLoadFn
  > & {
    getParentRoute: () => TParentRoute
  }

export interface ContextOptions<
  in out TParentRoute extends AnyRoute,
  in out TParams,
> {
  abortController: AbortController
  preload: boolean
  params: Expand<ResolveAllParamsFromParent<TParentRoute, TParams>>
  location: ParsedLocation
  /**
   * @deprecated Use `throw redirect({ to: '/somewhere' })` instead
   **/
  navigate: NavigateFn
  buildLocation: BuildLocationFn
  cause: 'preload' | 'enter' | 'stay'
  matches: Array<MakeRouteMatchUnion>
}

export interface RouteContextOptions<
  in out TParentRoute extends AnyRoute,
  in out TParams,
  in out TRouterContext,
  in out TLoaderDeps,
> extends ContextOptions<TParentRoute, TParams> {
  deps: TLoaderDeps
  context: Expand<RouteContextParameter<TParentRoute, TRouterContext>>
}

export interface BeforeLoadContextOptions<
  in out TParentRoute extends AnyRoute,
  in out TSearchValidator,
  in out TParams,
  in out TRouterContext,
  in out TRouteContextFn,
> extends ContextOptions<TParentRoute, TParams>,
    FullSearchSchemaOption<TParentRoute, TSearchValidator> {
  context: Expand<
    BeforeLoadContextParameter<TParentRoute, TRouterContext, TRouteContextFn>
  >
}

export interface UpdatableRouteOptions<
  in out TParentRoute extends AnyRoute,
  in out TRouteId,
  in out TFullPath,
  in out TParams,
  in out TSearchValidator,
  in out TLoaderFn,
  in out TLoaderDeps,
  in out TRouterContext,
  in out TRouteContextFn,
  in out TBeforeLoadFn,
> extends UpdatableStaticRouteOption {
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
  preload?: boolean
  preloadStaleTime?: number
  preloadGcTime?: number
  search?: {
    middlewares?: Array<
      SearchMiddleware<
        ResolveFullSearchSchemaInput<TParentRoute, TSearchValidator>
      >
    >
  }
  /** 
  @deprecated Use search.middlewares instead
  */
  preSearchFilters?: Array<
    SearchFilter<ResolveFullSearchSchema<TParentRoute, TSearchValidator>>
  >
  /** 
  @deprecated Use search.middlewares instead
  */
  postSearchFilters?: Array<
    SearchFilter<ResolveFullSearchSchema<TParentRoute, TSearchValidator>>
  >
  onCatch?: (error: Error, errorInfo: React.ErrorInfo) => void
  onError?: (err: any) => void
  // These functions are called as route matches are loaded, stick around and leave the active
  // matches
  onEnter?: (
    match: RouteMatch<
      TRouteId,
      TFullPath,
      ResolveAllParamsFromParent<TParentRoute, TParams>,
      ResolveFullSearchSchema<TParentRoute, TSearchValidator>,
      ResolveLoaderData<TLoaderFn>,
      ResolveAllContext<
        TParentRoute,
        TRouterContext,
        TRouteContextFn,
        TBeforeLoadFn
      >,
      TLoaderDeps
    >,
  ) => void
  onStay?: (
    match: RouteMatch<
      TRouteId,
      TFullPath,
      ResolveAllParamsFromParent<TParentRoute, TParams>,
      ResolveFullSearchSchema<TParentRoute, TSearchValidator>,
      ResolveLoaderData<TLoaderFn>,
      ResolveAllContext<
        TParentRoute,
        TRouterContext,
        TRouteContextFn,
        TBeforeLoadFn
      >,
      TLoaderDeps
    >,
  ) => void
  onLeave?: (
    match: RouteMatch<
      TRouteId,
      TFullPath,
      ResolveAllParamsFromParent<TParentRoute, TParams>,
      ResolveFullSearchSchema<TParentRoute, TSearchValidator>,
      ResolveLoaderData<TLoaderFn>,
      ResolveAllContext<
        TParentRoute,
        TRouterContext,
        TRouteContextFn,
        TBeforeLoadFn
      >,
      TLoaderDeps
    >,
  ) => void
  headers?: (ctx: {
    loaderData: ResolveLoaderData<TLoaderFn>
  }) => Record<string, string>
  head?: (ctx: {
    matches: Array<
      RouteMatch<
        TRouteId,
        TFullPath,
        ResolveAllParamsFromParent<TParentRoute, TParams>,
        ResolveFullSearchSchema<TParentRoute, TSearchValidator>,
        ResolveLoaderData<TLoaderFn>,
        ResolveAllContext<
          TParentRoute,
          TRouterContext,
          TRouteContextFn,
          TBeforeLoadFn
        >,
        TLoaderDeps
      >
    >
    match: RouteMatch<
      TRouteId,
      TFullPath,
      ResolveAllParamsFromParent<TParentRoute, TParams>,
      ResolveFullSearchSchema<TParentRoute, TSearchValidator>,
      ResolveLoaderData<TLoaderFn>,
      ResolveAllContext<
        TParentRoute,
        TRouterContext,
        TRouteContextFn,
        TBeforeLoadFn
      >,
      TLoaderDeps
    >
    params: ResolveAllParamsFromParent<TParentRoute, TParams>
    loaderData: ResolveLoaderData<TLoaderFn> | undefined
  }) => {
    links?: AnyRouteMatch['links']
    scripts?: AnyRouteMatch['scripts']
    meta?: AnyRouteMatch['meta']
  }
  ssr?: boolean
}

interface RequiredStaticDataRouteOption {
  staticData: StaticDataRouteOption
}

interface OptionalStaticDataRouteOption {
  staticData?: StaticDataRouteOption
}

export type UpdatableStaticRouteOption = {} extends StaticDataRouteOption
  ? OptionalStaticDataRouteOption
  : RequiredStaticDataRouteOption

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

export type SearchValidator<TInput, TOutput> =
  | ValidatorObj<TInput, TOutput>
  | ValidatorFn<TInput, TOutput>
  | ValidatorAdapter<TInput, TOutput>
  | StandardSchemaValidator<TInput, TOutput>
  | undefined

export type AnySearchValidator = SearchValidator<any, any>

export type DefaultSearchValidator = SearchValidator<
  Record<string, unknown>,
  AnySchema
>

export type RouteLoaderFn<
  in out TParentRoute extends AnyRoute = AnyRoute,
  in out TId extends string = string,
  in out TParams = {},
  in out TLoaderDeps = {},
  in out TRouterContext = {},
  in out TRouteContextFn = AnyContext,
  in out TBeforeLoadFn = AnyContext,
> = (
  match: LoaderFnContext<
    TParentRoute,
    TId,
    TParams,
    TLoaderDeps,
    TRouterContext,
    TRouteContextFn,
    TBeforeLoadFn
  >,
) => any

export interface LoaderFnContext<
  in out TParentRoute extends AnyRoute = AnyRoute,
  in out TId extends string = string,
  in out TParams = {},
  in out TLoaderDeps = {},
  in out TRouterContext = {},
  in out TRouteContextFn = AnyContext,
  in out TBeforeLoadFn = AnyContext,
> {
  abortController: AbortController
  preload: boolean
  params: Expand<ResolveAllParamsFromParent<TParentRoute, TParams>>
  deps: TLoaderDeps
  context: Expand<
    ResolveAllContext<
      TParentRoute,
      TRouterContext,
      TRouteContextFn,
      TBeforeLoadFn
    >
  >
  location: ParsedLocation // Do not supply search schema here so as to demotivate people from trying to shortcut loaderDeps
  /**
   * @deprecated Use `throw redirect({ to: '/somewhere' })` instead
   **/
  navigate: (opts: NavigateOptions<AnyRouter>) => Promise<void> | void
  // root route does not have a parent match
  parentMatchPromise: TId extends RootRouteId
    ? never
    : Promise<MakeRouteMatchFromRoute<TParentRoute>>
  cause: 'preload' | 'enter' | 'stay'
  route: Route
}

export type SearchFilter<TInput, TResult = TInput> = (prev: TInput) => TResult

export type SearchMiddlewareContext<TSearchSchema> = {
  search: TSearchSchema
  next: (newSearch: TSearchSchema) => TSearchSchema
}

export type SearchMiddleware<TSearchSchema> = (
  ctx: SearchMiddlewareContext<TSearchSchema>,
) => TSearchSchema

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

export type InferAllParams<TRoute> = TRoute extends {
  types: {
    allParams: infer TAllParams
  }
}
  ? TAllParams
  : {}

export type InferAllContext<TRoute> = unknown extends TRoute
  ? TRoute
  : TRoute extends {
        types: {
          allContext: infer TAllContext
        }
      }
    ? TAllContext
    : {}

export type ResolveSearchSchemaFnInput<TSearchValidator> =
  TSearchValidator extends (input: infer TSearchSchemaInput) => any
    ? TSearchSchemaInput extends SearchSchemaInput
      ? Omit<TSearchSchemaInput, keyof SearchSchemaInput>
      : ResolveSearchSchemaFn<TSearchValidator>
    : AnySchema

export type ResolveSearchSchemaInput<TSearchValidator> =
  TSearchValidator extends AnyStandardSchemaValidator
    ? NonNullable<TSearchValidator['~standard']['types']>['input']
    : TSearchValidator extends AnyValidatorAdapter
      ? TSearchValidator['types']['input']
      : TSearchValidator extends AnyValidatorObj
        ? ResolveSearchSchemaFnInput<TSearchValidator['parse']>
        : ResolveSearchSchemaFnInput<TSearchValidator>

export type ResolveSearchSchemaFn<TSearchValidator> = TSearchValidator extends (
  ...args: any
) => infer TSearchSchema
  ? TSearchSchema
  : AnySchema

export type ResolveSearchSchema<TSearchValidator> =
  unknown extends TSearchValidator
    ? TSearchValidator
    : TSearchValidator extends AnyStandardSchemaValidator
      ? NonNullable<TSearchValidator['~standard']['types']>['output']
      : TSearchValidator extends AnyValidatorAdapter
        ? TSearchValidator['types']['output']
        : TSearchValidator extends AnyValidatorObj
          ? ResolveSearchSchemaFn<TSearchValidator['parse']>
          : ResolveSearchSchemaFn<TSearchValidator>

export type ResolveFullSearchSchema<
  TParentRoute extends AnyRoute,
  TSearchValidator,
> = unknown extends TParentRoute
  ? ResolveValidatorOutput<TSearchValidator>
  : Assign<
      InferFullSearchSchema<TParentRoute>,
      ResolveValidatorOutput<TSearchValidator>
    >

export type ResolveFullSearchSchemaInput<
  TParentRoute extends AnyRoute,
  TSearchValidator,
> = Assign<
  InferFullSearchSchemaInput<TParentRoute>,
  ResolveSearchValidatorInput<TSearchValidator>
>

export type LooseReturnType<T> = T extends (
  ...args: Array<any>
) => infer TReturn
  ? TReturn
  : never

export type LooseAsyncReturnType<T> = T extends (
  ...args: Array<any>
) => infer TReturn
  ? TReturn extends Promise<infer TReturn>
    ? TReturn
    : TReturn
  : never

export type ContextReturnType<TContextFn> = unknown extends TContextFn
  ? TContextFn
  : LooseReturnType<TContextFn> extends never
    ? AnyContext
    : LooseReturnType<TContextFn>

export type ContextAsyncReturnType<TContextFn> = unknown extends TContextFn
  ? TContextFn
  : LooseAsyncReturnType<TContextFn> extends never
    ? AnyContext
    : LooseAsyncReturnType<TContextFn>

export type RouteContextParameter<
  TParentRoute extends AnyRoute,
  TRouterContext,
> = unknown extends TParentRoute
  ? TRouterContext
  : Assign<TRouterContext, InferAllContext<TParentRoute>>

export type ResolveRouteContext<TRouteContextFn, TBeforeLoadFn> = Assign<
  ContextReturnType<TRouteContextFn>,
  ContextAsyncReturnType<TBeforeLoadFn>
>
export type BeforeLoadContextParameter<
  TParentRoute extends AnyRoute,
  TRouterContext,
  TRouteContextFn,
> = Assign<
  RouteContextParameter<TParentRoute, TRouterContext>,
  ContextReturnType<TRouteContextFn>
>

export type ResolveAllContext<
  TParentRoute extends AnyRoute,
  TRouterContext,
  TRouteContextFn,
  TBeforeLoadFn,
> = Assign<
  BeforeLoadContextParameter<TParentRoute, TRouterContext, TRouteContextFn>,
  ContextAsyncReturnType<TBeforeLoadFn>
>

export type ResolveLoaderData<TLoaderFn> = unknown extends TLoaderFn
  ? TLoaderFn
  : LooseAsyncReturnType<TLoaderFn> extends never
    ? {}
    : LooseAsyncReturnType<TLoaderFn>

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
    any
  > {}

export type AnyRouteWithContext<TContext> = AnyRoute & {
  types: { allContext: TContext }
}

export type ResolveAllParamsFromParent<
  TParentRoute extends AnyRoute,
  TParams,
> = Assign<InferAllParams<TParentRoute>, TParams>

export type RouteConstraints = {
  TParentRoute: AnyRoute
  TPath: string
  TFullPath: string
  TCustomId: string
  TId: string
  TSearchSchema: AnySchema
  TFullSearchSchema: AnySchema
  TParams: Record<string, any>
  TAllParams: Record<string, any>
  TParentContext: AnyContext
  TRouteContext: RouteContext
  TAllContext: AnyContext
  TRouterContext: AnyContext
  TChildren: unknown
  TRouteTree: AnyRoute
}

export type RouteTypesById<TRouter extends AnyRouter, TId> = RouteById<
  TRouter['routeTree'],
  TId
>['types']

export function getRouteApi<
  const TId,
  TRouter extends AnyRouter = RegisteredRouter,
>(id: ConstrainLiteral<TId, RouteIds<TRouter['routeTree']>>) {
  return new RouteApi<TId, TRouter>({ id })
}

export class RouteApi<TId, TRouter extends AnyRouter = RegisteredRouter> {
  id: TId

  /**
   * @deprecated Use the `getRouteApi` function instead.
   */
  constructor({ id }: { id: TId }) {
    this.id = id as any
  }

  useMatch: UseMatchRoute<TId> = (opts) => {
    return useMatch({
      select: opts?.select,
      from: this.id,
      structuralSharing: opts?.structuralSharing,
    } as any) as any
  }

  useRouteContext: UseRouteContextRoute<TId> = (opts) => {
    return useMatch({
      from: this.id as any,
      select: (d) => (opts?.select ? opts.select(d.context) : d.context),
    }) as any
  }

  useSearch: UseSearchRoute<TId> = (opts) => {
    return useSearch({
      select: opts?.select,
      structuralSharing: opts?.structuralSharing,
      from: this.id,
    } as any)
  }

  useParams: UseParamsRoute<TId> = (opts) => {
    return useParams({
      select: opts?.select,
      structuralSharing: opts?.structuralSharing,
      from: this.id,
    } as any)
  }

  useLoaderDeps: UseLoaderDepsRoute<TId> = (opts) => {
    return useLoaderDeps({ ...opts, from: this.id, strict: false } as any)
  }

  useLoaderData: UseLoaderDataRoute<TId> = (opts) => {
    return useLoaderData({ ...opts, from: this.id, strict: false } as any)
  }

  useNavigate = (): UseNavigateResult<
    RouteTypesById<TRouter, TId>['fullPath']
  > => {
    return useNavigate({ from: this.id as string })
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
  in out TSearchValidator = undefined,
  in out TParams = ResolveParams<TPath>,
  in out TRouterContext = AnyContext,
  in out TRouteContextFn = AnyContext,
  in out TBeforeLoadFn = AnyContext,
  in out TLoaderDeps extends Record<string, any> = {},
  in out TLoaderFn = undefined,
  in out TChildren = unknown,
> {
  isRoot: TParentRoute extends Route<any> ? true : false
  options: RouteOptions<
    TParentRoute,
    TId,
    TCustomId,
    TFullPath,
    TPath,
    TSearchValidator,
    TParams,
    TLoaderDeps,
    TLoaderFn,
    TRouterContext,
    TRouteContextFn,
    TBeforeLoadFn
  >

  // The following properties are set up in this.init()
  parentRoute!: TParentRoute
  private _id!: TId
  private _path!: TPath
  private _fullPath!: TFullPath
  private _to!: TrimPathRight<TFullPath>
  private _ssr!: boolean

  public get to() {
    /* invariant(
      this._to,
      `trying to access property 'to' on a route which is not initialized yet. Route properties are only available after 'createRouter' completed.`,
    )*/
    return this._to
  }

  public get id() {
    /* invariant(
      this._id,
      `trying to access property 'id' on a route which is not initialized yet. Route properties are only available after 'createRouter' completed.`,
    )*/
    return this._id
  }

  public get path() {
    /* invariant(
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      this.isRoot || this._id || this._path,
      `trying to access property 'path' on a route which is not initialized yet. Route properties are only available after 'createRouter' completed.`,
    )*/
    return this._path
  }

  public get fullPath() {
    /* invariant(
      this._fullPath,
      `trying to access property 'fullPath' on a route which is not initialized yet. Route properties are only available after 'createRouter' completed.`,
    )*/
    return this._fullPath
  }

  public get ssr() {
    return this._ssr
  }

  // Optional
  children?: TChildren
  originalIndex?: number
  router?: AnyRouter
  rank!: number
  lazyFn?: () => Promise<LazyRoute<any>>
  _lazyPromise?: Promise<void>
  _componentsPromise?: Promise<Array<void>>

  /**
   * @deprecated Use the `createRoute` function instead.
   */
  constructor(
    options?: RouteOptions<
      TParentRoute,
      TId,
      TCustomId,
      TFullPath,
      TPath,
      TSearchValidator,
      TParams,
      TLoaderDeps,
      TLoaderFn,
      TRouterContext,
      TRouteContextFn,
      TBeforeLoadFn
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
    searchSchema: ResolveValidatorOutput<TSearchValidator>
    searchSchemaInput: ResolveSearchValidatorInput<TSearchValidator>
    searchValidator: TSearchValidator
    fullSearchSchema: ResolveFullSearchSchema<TParentRoute, TSearchValidator>
    fullSearchSchemaInput: ResolveFullSearchSchemaInput<
      TParentRoute,
      TSearchValidator
    >
    params: TParams
    allParams: ResolveAllParamsFromParent<TParentRoute, TParams>
    routerContext: TRouterContext
    routeContext: ResolveRouteContext<TRouteContextFn, TBeforeLoadFn>
    routeContextFn: TRouteContextFn
    beforeLoadFn: TBeforeLoadFn
    allContext: ResolveAllContext<
      TParentRoute,
      TRouterContext,
      TRouteContextFn,
      TBeforeLoadFn
    >
    children: TChildren
    loaderData: ResolveLoaderData<TLoaderFn>
    loaderDeps: TLoaderDeps
  }

  init = (opts: { originalIndex: number; defaultSsr?: boolean }): void => {
    this.originalIndex = opts.originalIndex

    const options = this.options as
      | (RouteOptions<
          TParentRoute,
          TId,
          TCustomId,
          TFullPath,
          TPath,
          TSearchValidator,
          TParams,
          TLoaderDeps,
          TLoaderFn,
          TRouterContext,
          TRouteContextFn,
          TBeforeLoadFn
        > &
          RoutePathOptionsIntersection<TCustomId, TPath>)
      | undefined

    const isRoot = !options?.path && !options?.id

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    this.parentRoute = this.options.getParentRoute?.()

    if (isRoot) {
      this._path = rootRouteId as TPath
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

    this._path = path as TPath
    this._id = id as TId
    // this.customId = customId as TCustomId
    this._fullPath = fullPath as TFullPath
    this._to = fullPath as TrimPathRight<TFullPath>
    this._ssr = options?.ssr ?? opts.defaultSsr ?? true
  }

  addChildren<const TNewChildren>(
    children: Constrain<
      TNewChildren,
      ReadonlyArray<AnyRoute> | Record<string, AnyRoute>
    >,
  ): Route<
    TParentRoute,
    TPath,
    TFullPath,
    TCustomId,
    TId,
    TSearchValidator,
    TParams,
    TRouterContext,
    TRouteContextFn,
    TBeforeLoadFn,
    TLoaderDeps,
    TLoaderFn,
    TNewChildren
  > {
    return this._addFileChildren(children) as Route<
      TParentRoute,
      TPath,
      TFullPath,
      TCustomId,
      TId,
      TSearchValidator,
      TParams,
      TRouterContext,
      TRouteContextFn,
      TBeforeLoadFn,
      TLoaderDeps,
      TLoaderFn,
      TNewChildren
    >
  }

  _addFileChildren<const TNewChildren>(
    children: TNewChildren,
  ): Route<
    TParentRoute,
    TPath,
    TFullPath,
    TCustomId,
    TId,
    TSearchValidator,
    TParams,
    TRouterContext,
    TRouteContextFn,
    TBeforeLoadFn,
    TLoaderDeps,
    TLoaderFn,
    TNewChildren
  > {
    if (Array.isArray(children)) {
      this.children = children as TChildren
    }

    if (typeof children === 'object' && children !== null) {
      this.children = Object.values(children) as TChildren
    }

    return this as unknown as Route<
      TParentRoute,
      TPath,
      TFullPath,
      TCustomId,
      TId,
      TSearchValidator,
      TParams,
      TRouterContext,
      TRouteContextFn,
      TBeforeLoadFn,
      TLoaderDeps,
      TLoaderFn,
      TNewChildren
    >
  }

  updateLoader = <TNewLoaderFn>(options: {
    loader: Constrain<
      TNewLoaderFn,
      RouteLoaderFn<
        TParentRoute,
        TCustomId,
        TParams,
        TLoaderDeps,
        TRouterContext,
        TRouteContextFn,
        TBeforeLoadFn
      >
    >
  }) => {
    Object.assign(this.options, options)
    return this as unknown as Route<
      TParentRoute,
      TPath,
      TFullPath,
      TCustomId,
      TId,
      TSearchValidator,
      TParams,
      TRouterContext,
      TRouteContextFn,
      TBeforeLoadFn,
      TLoaderDeps,
      TNewLoaderFn,
      TChildren
    >
  }

  update = (
    options: UpdatableRouteOptions<
      TParentRoute,
      TCustomId,
      TFullPath,
      TParams,
      TSearchValidator,
      TLoaderFn,
      TLoaderDeps,
      TRouterContext,
      TRouteContextFn,
      TBeforeLoadFn
    >,
  ): this => {
    Object.assign(this.options, options)
    return this
  }

  lazy = (lazyFn: () => Promise<LazyRoute<any>>): this => {
    this.lazyFn = lazyFn
    return this
  }

  useMatch: UseMatchRoute<TId> = (opts) => {
    return useMatch({
      select: opts?.select,
      from: this.id,
      structuralSharing: opts?.structuralSharing,
    } as any) as any
  }

  useRouteContext: UseRouteContextRoute<TId> = (opts?) => {
    return useMatch({
      ...opts,
      from: this.id,
      select: (d) => (opts?.select ? opts.select(d.context) : d.context),
    }) as any
  }

  useSearch: UseSearchRoute<TId> = (opts) => {
    return useSearch({
      select: opts?.select,
      structuralSharing: opts?.structuralSharing,
      from: this.id,
    } as any)
  }

  useParams: UseParamsRoute<TId> = (opts) => {
    return useParams({
      select: opts?.select,
      structuralSharing: opts?.structuralSharing,
      from: this.id,
    } as any)
  }

  useLoaderDeps: UseLoaderDepsRoute<TId> = (opts) => {
    return useLoaderDeps({ ...opts, from: this.id } as any)
  }

  useLoaderData: UseLoaderDataRoute<TId> = (opts) => {
    return useLoaderData({ ...opts, from: this.id } as any)
  }

  useNavigate = (): UseNavigateResult<TFullPath> => {
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
  TSearchValidator = undefined,
  TParams = ResolveParams<TPath>,
  TRouteContextFn = AnyContext,
  TBeforeLoadFn = AnyContext,
  TLoaderDeps extends Record<string, any> = {},
  TLoaderFn = undefined,
  TChildren = unknown,
>(
  options: RouteOptions<
    TParentRoute,
    TId,
    TCustomId,
    TFullPath,
    TPath,
    TSearchValidator,
    TParams,
    TLoaderDeps,
    TLoaderFn,
    AnyContext,
    TRouteContextFn,
    TBeforeLoadFn
  >,
) {
  return new Route<
    TParentRoute,
    TPath,
    TFullPath,
    TCustomId,
    TId,
    TSearchValidator,
    TParams,
    AnyContext,
    TRouteContextFn,
    TBeforeLoadFn,
    TLoaderDeps,
    TLoaderFn,
    TChildren
  >(options)
}

export type AnyRootRoute = RootRoute<any, any, any, any, any, any, any, any>

export type RootRouteOptions<
  TSearchValidator = undefined,
  TRouterContext = {},
  TRouteContextFn = AnyContext,
  TBeforeLoadFn = AnyContext,
  TLoaderDeps extends Record<string, any> = {},
  TLoaderFn = undefined,
> = Omit<
  RouteOptions<
    any, // TParentRoute
    RootRouteId, // TId
    RootRouteId, // TCustomId
    '', // TFullPath
    '', // TPath
    TSearchValidator,
    {}, // TParams
    TLoaderDeps,
    TLoaderFn,
    TRouterContext,
    TRouteContextFn,
    TBeforeLoadFn
  >,
  | 'path'
  | 'id'
  | 'getParentRoute'
  | 'caseSensitive'
  | 'parseParams'
  | 'stringifyParams'
  | 'params'
>

export function createRootRouteWithContext<TRouterContext extends {}>() {
  return <
    TRouteContextFn = AnyContext,
    TBeforeLoadFn = AnyContext,
    TSearchValidator = undefined,
    TLoaderDeps extends Record<string, any> = {},
    TLoaderFn = undefined,
  >(
    options?: RootRouteOptions<
      TSearchValidator,
      TRouterContext,
      TRouteContextFn,
      TBeforeLoadFn,
      TLoaderDeps,
      TLoaderFn
    >,
  ) => {
    return createRootRoute<
      TSearchValidator,
      TRouterContext,
      TRouteContextFn,
      TBeforeLoadFn,
      TLoaderDeps,
      TLoaderFn
    >(options as any)
  }
}

/**
 * @deprecated Use the `createRootRouteWithContext` function instead.
 */
export const rootRouteWithContext = createRootRouteWithContext

export class RootRoute<
  in out TSearchValidator = undefined,
  in out TRouterContext = {},
  in out TRouteContextFn = AnyContext,
  in out TBeforeLoadFn = AnyContext,
  in out TLoaderDeps extends Record<string, any> = {},
  in out TLoaderFn = undefined,
  in out TChildren = unknown,
  in out TFileRouteTypes = unknown,
> extends Route<
  any, // TParentRoute
  '/', // TPath
  '/', // TFullPath
  string, // TCustomId
  RootRouteId, // TId
  TSearchValidator, // TSearchValidator
  {}, // TParams
  TRouterContext,
  TRouteContextFn,
  TBeforeLoadFn,
  TLoaderDeps,
  TLoaderFn,
  TChildren // TChildren
> {
  /**
   * @deprecated `RootRoute` is now an internal implementation detail. Use `createRootRoute()` instead.
   */
  constructor(
    options?: RootRouteOptions<
      TSearchValidator,
      TRouterContext,
      TRouteContextFn,
      TBeforeLoadFn,
      TLoaderDeps,
      TLoaderFn
    >,
  ) {
    super(options as any)
  }

  addChildren<const TNewChildren>(
    children: Constrain<
      TNewChildren,
      ReadonlyArray<AnyRoute> | Record<string, AnyRoute>
    >,
  ): RootRoute<
    TSearchValidator,
    TRouterContext,
    TRouteContextFn,
    TBeforeLoadFn,
    TLoaderDeps,
    TLoaderFn,
    TNewChildren,
    TFileRouteTypes
  > {
    super.addChildren(children)
    return this as unknown as RootRoute<
      TSearchValidator,
      TRouterContext,
      TRouteContextFn,
      TBeforeLoadFn,
      TLoaderDeps,
      TLoaderFn,
      TNewChildren,
      TFileRouteTypes
    >
  }

  _addFileChildren<const TNewChildren>(
    children: TNewChildren,
  ): RootRoute<
    TSearchValidator,
    TRouterContext,
    TRouteContextFn,
    TBeforeLoadFn,
    TLoaderDeps,
    TLoaderFn,
    TNewChildren,
    TFileRouteTypes
  > {
    super._addFileChildren(children)
    return this as unknown as RootRoute<
      TSearchValidator,
      TRouterContext,
      TRouteContextFn,
      TBeforeLoadFn,
      TLoaderDeps,
      TLoaderFn,
      TNewChildren,
      TFileRouteTypes
    >
  }

  _addFileTypes<TFileRouteTypes>(): RootRoute<
    TSearchValidator,
    TRouterContext,
    TRouteContextFn,
    TBeforeLoadFn,
    TLoaderDeps,
    TLoaderFn,
    TChildren,
    TFileRouteTypes
  > {
    return this as any
  }
}

export function createRootRoute<
  TSearchValidator = undefined,
  TRouterContext = {},
  TRouteContextFn = AnyContext,
  TBeforeLoadFn = AnyContext,
  TLoaderDeps extends Record<string, any> = {},
  TLoaderFn = undefined,
>(
  options?: RootRouteOptions<
    TSearchValidator,
    TRouterContext,
    TRouteContextFn,
    TBeforeLoadFn,
    TLoaderDeps,
    TLoaderFn
  >,
) {
  return new RootRoute<
    TSearchValidator,
    TRouterContext,
    TRouteContextFn,
    TBeforeLoadFn,
    TLoaderDeps,
    TLoaderFn
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
  TFrom extends string,
  TTo extends string,
>(
  opts: {
    routeTree: TRouteTree
  } & ToMaskOptions<Router<TRouteTree, 'never', boolean>, TFrom, TTo>,
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
  error: Error
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

export type RouteComponent<TProps = any> = AsyncRouteComponent<TProps>

export type ErrorRouteComponent = RouteComponent<ErrorComponentProps>

export type NotFoundRouteComponent = SyncRouteComponent<NotFoundRouteProps>

export class NotFoundRoute<
  TParentRoute extends AnyRootRoute,
  TRouterContext = AnyContext,
  TRouteContextFn = AnyContext,
  TBeforeLoadFn = AnyContext,
  TSearchValidator = undefined,
  TLoaderDeps extends Record<string, any> = {},
  TLoaderFn = undefined,
  TChildren = unknown,
> extends Route<
  TParentRoute,
  '/404',
  '/404',
  '404',
  '404',
  TSearchValidator,
  {},
  TRouterContext,
  TRouteContextFn,
  TBeforeLoadFn,
  TLoaderDeps,
  TLoaderFn,
  TChildren
> {
  constructor(
    options: Omit<
      RouteOptions<
        TParentRoute,
        string,
        string,
        string,
        string,
        TSearchValidator,
        {},
        TLoaderDeps,
        TLoaderFn,
        TRouterContext,
        TRouteContextFn,
        TBeforeLoadFn
      >,
      | 'caseSensitive'
      | 'parseParams'
      | 'stringifyParams'
      | 'path'
      | 'id'
      | 'params'
    >,
  ) {
    super({
      ...(options as any),
      id: '404',
    })
  }
}
