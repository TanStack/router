import type { NavigateOptions, ParsePathParams } from './link'
import type { ParsedLocation } from './location'
import type {
  AnyRouteMatch,
  MakeRouteMatchFromRoute,
  MakeRouteMatchUnion,
  RouteMatch,
} from './Matches'
import type { RootRouteId } from './root'
import type { ParseRoute } from './routeInfo'
import type { AnyRouter, RegisteredRouter } from './router'
import type { BuildLocationFn, NavigateFn } from './RouterProvider'
import type {
  Assign,
  Constrain,
  Expand,
  IntersectAssign,
  NoInfer,
} from './utils'
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

export type RoutePrefix<
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

export type ResolveRouteContext<TRouteContextFn, TBeforeLoadFn> = Assign<
  ContextReturnType<TRouteContextFn>,
  ContextAsyncReturnType<TBeforeLoadFn>
>

export type ResolveLoaderData<TLoaderFn> = unknown extends TLoaderFn
  ? TLoaderFn
  : LooseAsyncReturnType<TLoaderFn> extends never
    ? undefined
    : LooseAsyncReturnType<TLoaderFn>

export type ResolveFullSearchSchema<
  TParentRoute extends AnyRoute,
  TSearchValidator,
> = unknown extends TParentRoute
  ? ResolveValidatorOutput<TSearchValidator>
  : IntersectAssign<
      InferFullSearchSchema<TParentRoute>,
      ResolveValidatorOutput<TSearchValidator>
    >

export type ResolveFullSearchSchemaInput<
  TParentRoute extends AnyRoute,
  TSearchValidator,
> = IntersectAssign<
  InferFullSearchSchemaInput<TParentRoute>,
  ResolveSearchValidatorInput<TSearchValidator>
>

export type ResolveAllParamsFromParent<
  TParentRoute extends AnyRoute,
  TParams,
> = Assign<InferAllParams<TParentRoute>, TParams>

export type RouteContextParameter<
  TParentRoute extends AnyRoute,
  TRouterContext,
> = unknown extends TParentRoute
  ? TRouterContext
  : Assign<TRouterContext, InferAllContext<TParentRoute>>

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
export interface FullSearchSchemaOption<
  in out TParentRoute extends AnyRoute,
  in out TSearchValidator,
> {
  search: Expand<ResolveFullSearchSchema<TParentRoute, TSearchValidator>>
}

export interface RemountDepsOptions<
  in out TRouteId,
  in out TFullSearchSchema,
  in out TAllParams,
  in out TLoaderDeps,
> {
  routeId: TRouteId
  search: TFullSearchSchema
  params: TAllParams
  loaderDeps: TLoaderDeps
}

export type MakeRemountDepsOptionsUnion<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TRoute extends AnyRoute = ParseRoute<TRouteTree>,
> = TRoute extends any
  ? RemountDepsOptions<
      TRoute['id'],
      TRoute['types']['fullSearchSchema'],
      TRoute['types']['allParams'],
      TRoute['types']['loaderDeps']
    >
  : never

export interface RouteTypes<
  in out TParentRoute extends AnyRoute,
  in out TPath extends string,
  in out TFullPath extends string,
  in out TCustomId extends string,
  in out TId extends string,
  in out TSearchValidator,
  in out TParams,
  in out TRouterContext,
  in out TRouteContextFn,
  in out TBeforeLoadFn,
  in out TLoaderDeps,
  in out TLoaderFn,
  in out TChildren,
  in out TFileRouteTypes,
> {
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
  fileRouteTypes: TFileRouteTypes
}

export type ResolveFullPath<
  TParentRoute extends AnyRoute,
  TPath extends string,
  TPrefixed = RoutePrefix<TParentRoute['fullPath'], TPath>,
> = TPrefixed extends RootRouteId ? '/' : TPrefixed

export interface Route<
  in out TParentRoute extends AnyRoute,
  in out TPath extends string,
  in out TFullPath extends string,
  in out TCustomId extends string,
  in out TId extends string,
  in out TSearchValidator,
  in out TParams,
  in out TRouterContext,
  in out TRouteContextFn,
  in out TBeforeLoadFn,
  in out TLoaderDeps,
  in out TLoaderFn,
  in out TChildren,
  in out TFileRouteTypes,
> {
  fullPath: TFullPath
  path: TPath
  id: TId
  types: RouteTypes<
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
    TChildren,
    TFileRouteTypes
  >
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
  any,
  any,
  any,
  any
>

export interface RootRoute<
  in out TSearchValidator,
  in out TRouterContext,
  in out TRouteContextFn,
  in out TBeforeLoadFn,
  in out TLoaderDeps extends Record<string, any>,
  in out TLoaderFn,
  in out TChildren,
  in out TFileRouteTypes,
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
    TChildren, // TChildren
    TFileRouteTypes
  > {}

export type AnyRouteWithContext<TContext> = AnyRoute & {
  types: { allContext: TContext }
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
  TRemountDepsFn = AnyContext,
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

  remountDeps?: Constrain<
    TRemountDepsFn,
    (
      opt: RemountDepsOptions<
        TId,
        FullSearchSchemaOption<TParentRoute, TSearchValidator>,
        Expand<ResolveAllParamsFromParent<TParentRoute, TParams>>,
        TLoaderDeps
      >,
    ) => any
  >

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

type AssetFnContextOptions<
  in out TRouteId,
  in out TFullPath,
  in out TParentRoute extends AnyRoute,
  in out TParams,
  in out TSearchValidator,
  in out TLoaderFn,
  in out TRouterContext,
  in out TRouteContextFn,
  in out TBeforeLoadFn,
  in out TLoaderDeps,
> = {
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
  loaderData: ResolveLoaderData<TLoaderFn>
}

export interface DefaultUpdatableRouteOptionsExtensions {
  component?: unknown
  errorComponent?: unknown
  notFoundComponent?: unknown
  pendingComponent?: unknown
}

export interface UpdatableRouteOptionsExtensions {}

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
> extends UpdatableStaticRouteOption,
    UpdatableRouteOptionsExtensions {
  // If true, this route will be matched as case-sensitive
  caseSensitive?: boolean
  // If true, this route will be forcefully wrapped in a suspense boundary
  wrapInSuspense?: boolean
  // The content to be rendered when the route is matched. If no component is provided, defaults to `<Outlet />`

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
  onCatch?: (error: Error) => void
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
  head?: (
    ctx: AssetFnContextOptions<
      TRouteId,
      TFullPath,
      TParentRoute,
      TParams,
      TSearchValidator,
      TLoaderFn,
      TRouterContext,
      TRouteContextFn,
      TBeforeLoadFn,
      TLoaderDeps
    >,
  ) => {
    links?: AnyRouteMatch['links']
    scripts?: AnyRouteMatch['headScripts']
    meta?: AnyRouteMatch['meta']
  }
  scripts?: (
    ctx: AssetFnContextOptions<
      TRouteId,
      TFullPath,
      TParentRoute,
      TParams,
      TSearchValidator,
      TLoaderFn,
      TRouterContext,
      TRouteContextFn,
      TBeforeLoadFn,
      TLoaderDeps
    >,
  ) => AnyRouteMatch['scripts']
  ssr?: boolean
  codeSplitGroupings?: Array<
    Array<
      | 'loader'
      | 'component'
      | 'pendingComponent'
      | 'notFoundComponent'
      | 'errorComponent'
    >
  >
}

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
  route: AnyRoute
}

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
