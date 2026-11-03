import { invariant } from './invariant'
import { cleanPath, trimPathLeft, trimPathRight } from './path'
import { notFound } from './not-found'
import { redirect } from './redirect'
import { rootRouteId } from './root'
import type { LazyRoute } from './fileRoute'
import type { RouteInterpolation } from './path'
import type { NotFoundError } from './not-found'
import type { AnyRedirect, RedirectFnRoute } from './redirect'
import type { NavigateOptions, ParsePathParams } from './link'
import type { ParsedLocation } from './location'
import type {
  AnyRouteMatch,
  MakePreValidationErrorHandlingRouteMatchUnion,
  MakeRouteMatchFromRoute,
  MakeRouteMatchUnion,
  RouteMatch,
} from './Matches'
import type { RootRouteId } from './root'
import type { ParseRoute, RouteById, RouteIds, RoutePaths } from './routeInfo'
import type {
  AnyRouter,
  Register,
  RegisteredConfigType,
  RegisteredRouter,
  RegisteredSsr,
  SSROption,
} from './router'
import type { BuildLocationFn, NavigateFn } from './RouterProvider'
import type {
  Assign,
  Awaitable,
  Constrain,
  ConstrainLiteral,
  Expand,
  IntersectAssign,
  LooseReturnType,
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
import type {
  ValidateSerializableLifecycleResult,
  ValidateSerializableLifecycleWire,
} from './ssr/serializer/transformer'

export type AnyPathParams = {}

export type SearchSchemaInput = {
  __TSearchSchemaInput__: 'TSearchSchemaInput'
}

export type AnyContext = {}

export interface RouteContext {}

export type PreloadableObj = { preload?: () => Promise<void> | undefined }

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

export type SearchMiddlewareMeta = {
  removed?: Map<string, unknown>
  removedAny?: Set<string>
  defaulted?: Map<string, unknown>
  explicit?: unknown
}

export type SearchMiddlewareContext<TSearchSchema> = {
  search: TSearchSchema
  next: (newSearch: TSearchSchema) => TSearchSchema
  meta?: SearchMiddlewareMeta
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

export type ResolveRequiredParams<TPath extends string, T> = {
  [K in ParsePathParams<TPath>['required']]: T
}

export type ResolveOptionalParams<TPath extends string, T> = {
  [K in ParsePathParams<TPath>['optional']]?: T | undefined
}

export type ResolveParams<
  TPath extends string,
  T = string,
> = ResolveRequiredParams<TPath, T> & ResolveOptionalParams<TPath, T>

export type ParseParamsFn<in out TPath extends string, in out TParams> = (
  rawParams: Expand<ResolveParams<TPath>>,
) => TParams | false

type ValidateParsedParams<TPath extends string, TParams> = [TParams] extends [
  ResolveParams<TPath, any>,
]
  ? unknown
  : never

export type StringifyParamsFn<in out TPath extends string, in out TParams> = (
  params: TParams,
) => ResolveParams<TPath>

// The members are declared in FileBaseRouteOptions (type-check cost, see there).
export type ParamsOptions<TPath extends string, TParams> = Pick<
  FileBaseRouteOptions<unknown, AnyRoute, string, TPath, undefined, TParams>,
  'params' | 'parseParams' | 'stringifyParams'
>

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

export type ContextReturnType<TContextFn> = unknown extends TContextFn
  ? TContextFn
  : Exclude<
        LifecycleReturnType<TContextFn>,
        Response & { options: object }
      > extends never
    ? AnyContext
    : Exclude<LifecycleReturnType<TContextFn>, Response & { options: object }>

export type ContextAsyncReturnType<
  TContextFn,
  TPhase extends LifecyclePhase = 'client',
> = unknown extends TContextFn
  ? TContextFn
  : Exclude<
        Awaited<LifecycleReturnType<TContextFn, TPhase>>,
        Response & { options: object }
      > extends never
    ? AnyContext
    : Exclude<
        Awaited<LifecycleReturnType<TContextFn, TPhase>>,
        Response & { options: object }
      >

export type ResolveRouteContext<TRouteContextFn, TBeforeLoadFn> = Assign<
  ContextAsyncReturnType<TRouteContextFn>,
  ContextAsyncReturnType<TBeforeLoadFn>
>

export type RouteLoaderObject<
  TRegister,
  TParentRoute extends AnyRoute = AnyRoute,
  TId extends string = string,
  TParams = {},
  TLoaderDeps = {},
  TRouterContext = {},
  TRouteContextFn = AnyContext,
  TBeforeLoadFn = AnyContext,
  TServerMiddlewares = unknown,
  THandlers = undefined,
> = {
  handler: RouteLoaderFn<
    TRegister,
    TParentRoute,
    TId,
    TParams,
    TLoaderDeps,
    TRouterContext,
    TRouteContextFn,
    TBeforeLoadFn,
    TServerMiddlewares,
    THandlers
  >
  staleReloadMode?: LoaderStaleReloadMode
}

export type ResolveLoaderData<
  TLoaderFn,
  TPhase extends LifecyclePhase = 'client',
> = unknown extends TLoaderFn
  ? TLoaderFn
  : Awaited<LifecycleReturnType<TLoaderFn, TPhase>> extends never
    ? undefined
    : Awaited<LifecycleReturnType<TLoaderFn, TPhase>>

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
  TPhase extends 'client' | 'shared' = 'shared',
> = unknown extends TParentRoute
  ? TRouterContext
  : Assign<
      TRouterContext,
      TParentRoute['types'][TPhase extends 'client'
        ? 'allContext'
        : 'allSharedContext']
    >

export type BeforeLoadContextParameter<
  TParentRoute extends AnyRoute,
  TRouterContext,
  TRouteContextFn,
  TPhase extends 'client' | 'shared' = 'shared',
> = Assign<
  RouteContextParameter<TParentRoute, TRouterContext, TPhase>,
  ContextAsyncReturnType<TRouteContextFn, TPhase>
>

export type ResolveAllContext<
  TParentRoute extends AnyRoute,
  TRouterContext,
  TRouteContextFn,
  TBeforeLoadFn,
  TPhase extends 'client' | 'shared' = 'client',
> = Assign<
  BeforeLoadContextParameter<
    TParentRoute,
    TRouterContext,
    TRouteContextFn,
    TPhase
  >,
  ContextAsyncReturnType<TBeforeLoadFn, TPhase>
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
> =
  ParseRoute<TRouteTree> extends infer TRoute extends AnyRoute
    ? TRoute extends any
      ? RemountDepsOptions<
          TRoute['id'],
          TRoute['types']['fullSearchSchema'],
          TRoute['types']['allParams'],
          TRoute['types']['loaderDeps']
        >
      : never
    : never

export interface RouteTypes<
  in out TRegister,
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
  in out TSSR,
  in out TServerMiddlewares,
  in out THandlers,
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
  routeContextFn: LifecycleFunction<TRouteContextFn>
  beforeLoadFn: LifecycleFunction<TBeforeLoadFn>
  allContext: ResolveAllContext<
    TParentRoute,
    TRouterContext,
    TRouteContextFn,
    TBeforeLoadFn
  >
  allSharedContext: ResolveAllContext<
    TParentRoute,
    TRouterContext,
    TRouteContextFn,
    TBeforeLoadFn,
    'shared'
  >
  children: TChildren
  loaderData: ResolveLoaderData<TLoaderFn>
  loaderDeps: TLoaderDeps
  fileRouteTypes: TFileRouteTypes
  ssr: ResolveSSR<TSSR>
  allSsr: ResolveAllSSR<TParentRoute, TSSR, TRegister>
}

export type ResolveSSR<TSSR> = TSSR extends (...args: ReadonlyArray<any>) => any
  ? Awaited<LooseReturnType<TSSR>>
  : TSSR

// A parent can disable rendering for its descendants, but a child cannot enable it.
export type ResolveAllSSR<
  TParentRoute extends AnyRoute,
  TSSR,
  TRegister = Register,
> = unknown extends TParentRoute
  ? ResolveSSRMode<TSSR, TRegister>
  : CapSSR<TParentRoute['types']['allSsr'], ResolveSSRMode<TSSR, TRegister>>

// Omitted options and undefined functional results use the router default.
// An unregistered default stays unknown because the runtime router can override it.
type ResolveSSRMode<TSSR, TRegister> = unknown extends TSSR
  ? RegisteredConfigType<TRegister, 'defaultSsr'>
  : ResolveSSR<TSSR> extends infer TMode
    ? TMode extends undefined
      ? RegisteredConfigType<TRegister, 'defaultSsr'>
      : TMode
    : never

type CapSSR<TParent, TChild> = TParent extends false
  ? false
  : TParent extends 'data-only'
    ? TChild extends false
      ? false
      : 'data-only'
    : TChild

export type ResolveFullPath<
  TParentRoute extends AnyRoute,
  TPath extends string,
  TPrefixed = RoutePrefix<TParentRoute['fullPath'], TPath>,
> = TPrefixed extends RootRouteId ? '/' : TPrefixed

export interface RouteExtensions<in out TId, in out TFullPath> {
  id: TId
  fullPath: TFullPath
}

export type RouteLazyFn<TRoute extends AnyRoute> = (
  lazyFn: () => Promise<LazyRoute<TRoute>>,
) => TRoute

export type RouteAddChildrenFn<
  in out TRegister,
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
  in out TLoaderDeps extends Record<string, any>,
  in out TLoaderFn,
  in out TFileRouteTypes,
  in out TSSR,
  in out TServerMiddlewares,
  in out THandlers,
> = <const TNewChildren>(
  children: Constrain<
    TNewChildren,
    ReadonlyArray<AnyRoute> | Record<string, AnyRoute>
  >,
) => Route<
  TRegister,
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
  TNewChildren,
  TFileRouteTypes,
  TSSR,
  TServerMiddlewares,
  THandlers
>

export type RouteAddFileChildrenFn<
  in out TRegister,
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
  in out TLoaderDeps extends Record<string, any>,
  in out TLoaderFn,
  in out TFileRouteTypes,
  in out TSSR,
  in out TServerMiddlewares,
  in out THandlers,
> = <const TNewChildren>(
  children: TNewChildren,
) => Route<
  TRegister,
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
  TNewChildren,
  TFileRouteTypes,
  TSSR,
  TServerMiddlewares,
  THandlers
>

export type RouteAddFileTypesFn<
  TRegister,
  TParentRoute extends AnyRoute,
  TPath extends string,
  TFullPath extends string,
  TCustomId extends string,
  TId extends string,
  TSearchValidator,
  TParams,
  TRouterContext,
  TRouteContextFn,
  TBeforeLoadFn,
  TLoaderDeps extends Record<string, any>,
  TLoaderFn,
  TChildren,
  TSSR,
  TServerMiddlewares,
  THandlers,
> = <TNewFileRouteTypes>() => Route<
  TRegister,
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
  TNewFileRouteTypes,
  TSSR,
  TServerMiddlewares,
  THandlers
>

export interface Route<
  in out TRegister,
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
  in out TLoaderDeps extends Record<string, any>,
  in out TLoaderFn,
  in out TChildren,
  in out TFileRouteTypes,
  in out TSSR,
  in out TServerMiddlewares,
  in out THandlers,
> extends RouteExtensions<TId, TFullPath> {
  path: TPath
  parentRoute: TParentRoute
  children?: TChildren
  types: RouteTypes<
    TRegister,
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
    TFileRouteTypes,
    TSSR,
    TServerMiddlewares,
    THandlers
  >
  options: RouteOptions<
    TRegister,
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
    TBeforeLoadFn,
    TSSR,
    TServerMiddlewares,
    THandlers,
    any,
    any,
    any
  >
  isRoot: TParentRoute extends AnyRoute ? true : false
  lazyFn?: () => Promise<
    LazyRoute<
      Route<
        TRegister,
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
        TFileRouteTypes,
        TSSR,
        TServerMiddlewares,
        THandlers
      >
    >
  >
  /** @internal */
  _lazy?: Promise<void> | true
  /** @internal */
  _branch?: ReadonlyArray<AnyRoute>
  /** @internal */
  _interpolation?: RouteInterpolation
  rank: number
  to: TrimPathRight<TFullPath>
  init: (originalIndex: number) => void
  update: (
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
  ) => this
  lazy: RouteLazyFn<
    Route<
      TRegister,
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
      TFileRouteTypes,
      TSSR,
      TServerMiddlewares,
      THandlers
    >
  >
  addChildren: RouteAddChildrenFn<
    TRegister,
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
    TFileRouteTypes,
    TSSR,
    TServerMiddlewares,
    THandlers
  >
  _addFileChildren: RouteAddFileChildrenFn<
    TRegister,
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
    TFileRouteTypes,
    TSSR,
    TServerMiddlewares,
    THandlers
  >
  _addFileTypes: RouteAddFileTypesFn<
    TRegister,
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
    TSSR,
    TServerMiddlewares,
    THandlers
  >
  /**
   * Create a redirect with `from` automatically set to this route's path.
   * Enables relative redirects like `Route.redirect({ to: './overview' })`.
   * @param opts Redirect options (same as `redirect()` but without `from`)
   * @returns A redirect Response that can be thrown from loaders/beforeLoad
   * @link https://tanstack.com/router/latest/docs/framework/react/api/router/redirectFunction
   */
  redirect: RedirectFnRoute<TFullPath>
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
  any,
  any,
  any,
  any,
  any
>

export type AnyRouteWithContext<TContext> = AnyRoute & {
  types: { allContext: TContext }
}

// ---------------------------------------------------------------------------
// Lifecycle options: context / beforeLoad / loader
// ---------------------------------------------------------------------------

/** Normalize a function or an object captured by lifecycle option inference. */
export type LifecycleFunction<T> = T extends { handler: infer TFn }
  ? T extends (...args: Array<any>) => any
    ? T
    : TFn
  : T

type LifecyclePhase = 'server' | 'client' | 'shared'

/** The return from one implementation of a lifecycle handler. */
// Start retains these two results in type-only metadata. Ordinary functions
// use their single return type for both phases; Router has no Start dependency.
export type LifecycleReturnType<
  TFn,
  TPhase extends LifecyclePhase = 'client',
> = TFn extends (...args: Array<any>) => infer TReturn
  ? TPhase extends 'shared'
    ? TReturn
    : TFn extends { '~types': { server: unknown; client: unknown } }
      ? TFn['~types'][Exclude<TPhase, 'shared'>]
      : TReturn
  : TFn extends { handler: infer THandler }
    ? LifecycleReturnType<THandler, TPhase>
    : never

/** The awaited successful client result of a lifecycle handler. */
// `any` before handler inference keeps named codec functions applicable.
export type LifecycleHandlerData<
  TFn,
  TPhase extends LifecyclePhase = 'client',
> = TFn extends
  | ((...args: Array<any>) => any)
  | { handler: (...args: Array<any>) => any }
  ? Exclude<
      Awaited<LifecycleReturnType<TFn, TPhase>>,
      Response & { options: object }
    >
  : any

// Full SSR renders with server data, so that data must satisfy the client contract.
// Unknown/default policies can render; only a proven false/data-only policy relaxes it.
type LifecycleSSRGuard<
  TRegister,
  TParentRoute extends AnyRoute,
  TSSR,
  TFn,
  TRaw extends boolean = false,
> =
  false extends RegisteredSsr<TRegister>
    ? unknown
    : TFn extends
          | { '~types': { server: unknown; client: unknown } }
          | { handler: { '~types': { server: unknown; client: unknown } } }
      ? ResolveAllSSR<TParentRoute, TSSR, TRegister> extends false
        ? unknown
        : TRaw extends true
          ? LifecycleClientContract<TFn>
          : Exclude<
                ResolveAllSSR<TParentRoute, TSSR, TRegister>,
                false | 'data-only'
              > extends never
            ? unknown
            : LifecycleClientContract<TFn>
      : unknown

type LifecycleClientContract<TFn> = [
  LifecycleHandlerData<TFn, 'server'>,
] extends [LifecycleHandlerData<TFn>]
  ? unknown
  : {
      'TanStack Router: server data must satisfy the client handler result when the route can render on the server': never
    }

// Raw transport needs reconstruction if its server value lacks client fields.
type LifecycleHydrateRequirement<
  TRegister,
  TParentRoute extends AnyRoute,
  TSSR,
  TFn,
> =
  LifecycleSSRGuard<
    TRegister,
    TParentRoute,
    TSSR,
    TFn,
    true
  > extends infer TGuard
    ? unknown extends TGuard
      ? unknown
      : { hydrate: unknown }
    : never

/**
 * Default of the wire generics (`TContextWire`, `TBeforeLoadWire`, `TLoaderWire`): no
 * `dehydrate` function has been inferred.
 */
// A dedicated type rather than `unknown`, so a `dehydrate` that returns `unknown`
// is an `unknown` wire, not a missing one; and not `never`, so default-wired
// option types stay assignable to the `any`-wired class constructors.
export interface LifecycleNoWire {
  readonly '~lifecycleNoWire': true
}

type LifecycleCodecContext<TCtx> = Omit<
  TCtx,
  'navigate' | 'buildLocation' | 'abortController' | 'parentMatchPromise'
>

/**
 * Client-side reconstruction. `data` is the AWAITED wire value when a `dehydrate`
 * function is present (TWire is inferred from its return, sync or async), otherwise
 * the handler's full awaited value. Shared by every arm that allows `hydrate` so the
 * contextual signature is identical.
 */
// The ctx-plus-data parameter types carry an alias on purpose: when the user's
// (contextually typed) function is inferred against the arm, TS then infers
// type-argument-wise instead of comparing the two intersections structurally. A
// structural comparison walks ContextOptions.matches -> MakeRouteMatchUnion ->
// RegisteredRouter -> Register.router -> the route tree -> this very route, which
// surfaces as "referenced directly or indirectly in its own initializer".
// `[TWire] extends [LifecycleNoWire]` also holds for `any` and `never`; the inner
// `[TWire] extends [string]` tells those two (they pass it) from the sentinel (it
// does not), so a real wire costs one check. LifecycleHydrateOrderGuard does the same.
export type LifecycleHydrateContext<TCtx, TFn, TWire> =
  LifecycleCodecContext<TCtx> & {
    data: [TWire] extends [LifecycleNoWire]
      ? [TWire] extends [string]
        ? TWire
        : LifecycleHandlerData<TFn, 'server'>
      : Awaited<TWire>
  }

export type LifecycleDehydrateContext<TCtx, TFn> =
  LifecycleCodecContext<TCtx> & {
    data: LifecycleHandlerData<TFn, 'server'>
  }

export type RouteContextRevalidateContext<TCtx, TFn> = TCtx & {
  // Revalidation runs on the client, whose data always satisfies the client contract.
  prev: LifecycleHandlerData<TFn> | undefined
}

/** `any` once the handler slot is inferred; a brand while it is still at its default. */
export type LifecycleHandlerResult<TFn> =
  LifecycleFunction<TFn> extends (...args: Array<any>) => any
    ? any
    : {
        'TanStack Router: write `handler` first: `dehydrate`, `hydrate` and (on `context`) `revalidate` are typed from it': true
      }

/**
 * Appended to the codec arm's hydrate return: rejects a `hydrate` written before
 * `dehydrate`, whose `data` would fix the wire type before `dehydrate` is seen and
 * leave the `dehydrate` return unvalidated.
 */
// `unknown` once TWire is inferred (also `any`, and `never` for a `dehydrate` that
// always throws); a brand while TWire is still LifecycleNoWire at the final check.
// It sits on hydrate (not dehydrate) because the error for a missing `hydrate` key
// or a typo next to a dehydrate function is reported from a context-insensitive
// instantiation in which TWire is still at its default; a brand on dehydrate would
// hijack those messages.
export type LifecycleHydrateOrderGuard<TWire> = [TWire] extends [
  LifecycleNoWire,
]
  ? [TWire] extends [string]
    ? unknown
    : {
        'TanStack Router: write `dehydrate` before `hydrate`: the wire type is inferred from `dehydrate`': true
      }
  : unknown

// Promise resolution also accepts callable and non-chainable thenables, including
// thenables fulfilled with another thenable. Constrain their final value without
// requiring Promise methods or letting the transform widen client data.
type LifecycleAwaitable<T> =
  | T
  | {
      then: (
        resolve: (value: LifecycleAwaitable<T>) => any,
        reject: (reason: any) => any,
      ) => any
    }

/** A hydration transform must satisfy the client handler's inferred result. */
export type LifecycleHydrateFn<TCtx, TFn, TWire> = (
  ctx: LifecycleHydrateContext<TCtx, TFn, TWire>,
) => LifecycleAwaitable<globalThis.NoInfer<LifecycleHandlerData<TFn>>>

/** Custom wire values are inferred before checking their hydration transform. */
export type LifecycleCodecHydrateFn<TCtx, TFn, TWire> = (
  ctx: LifecycleHydrateContext<TCtx, TFn, TWire>,
) => LifecycleAwaitable<globalThis.NoInfer<LifecycleHandlerData<TFn>>> &
  LifecycleHydrateOrderGuard<TWire>

/**
 * The declared return of `dehydrate` and the inference site of TWire. `unknown` while
 * TWire is still LifecycleNoWire, so a `dehydrate` checked before TWire is inferred is
 * not held against the sentinel; otherwise the wire intersected with the
 * serializability gate (an intersection, not `Constrain`, so union wires survive
 * inference). The gate lets `unknown` through, so an `unknown` wire is validated as
 * `symbol` instead: like an `unknown` handler result, it is rejected in Start apps
 * with "Type may not be serializable".
 */
export type LifecycleDehydrateReturn<
  TRegister,
  TParentRoute extends AnyRoute,
  TSSR,
  TWire,
> = [TWire] extends [LifecycleNoWire]
  ? unknown
  : TWire &
      ValidateSerializableLifecycleWire<
        TRegister,
        TParentRoute,
        TSSR,
        unknown extends TWire ? symbol : TWire
      >

/**
 * `dehydrate` may be sync or async: TWire is the raw return (`Promise<W>` for an
 * async dehydrate), consumers read `Awaited<TWire>`, and the serializability gate
 * walks into the Promise (ValidateSerializable has a Promise branch), so a function
 * inside an async wire is reported at that property.
 */
export type LifecycleDehydrateFn<
  TRegister,
  TParentRoute extends AnyRoute,
  TSSR,
  TCtx,
  TFn,
  TWire,
> = (
  ctx: LifecycleDehydrateContext<TCtx, TFn>,
) => LifecycleDehydrateReturn<TRegister, TParentRoute, TSSR, TWire>

export type RouteContextRevalidateFn<TCtx, TFn> = (
  ctx: RouteContextRevalidateContext<TCtx, TFn>,
) => Awaitable<LifecycleHandlerData<TFn> | AnyRedirect>

/**
 * `context`: cached serial lifecycle, may be async, NOT transported by default.
 * Arm order: fn, {dehydrate?: false}, codec, {dehydrate: true} (validated) last.
 * `hydrate` requires `dehydrate` (a function, or `true`).
 */
export type RouteContextOption<
  TRegister,
  TParentRoute extends AnyRoute,
  TSSR,
  TParams,
  TRouterContext,
  TLoaderDeps,
  TId,
  TServerMiddlewares,
  THandlers,
  TRouteContextFn,
  TContextWire,
  TCtx = RouteContextOptions<
    TParentRoute,
    TParams,
    TRouterContext,
    TLoaderDeps,
    TId,
    TRegister,
    TServerMiddlewares,
    THandlers
  >,
> =
  | (ConstrainLiteral<TRouteContextFn, (ctx: TCtx) => any> &
      LifecycleSSRGuard<
        TRegister,
        TParentRoute,
        TSSR,
        globalThis.NoInfer<TRouteContextFn>
      >)
  | {
      /**
       * The lifecycle function; its awaited return value is the lifecycle's data. Write it first:
       * `dehydrate`, `hydrate` and `revalidate` are typed from it.
       */
      handler: ConstrainLiteral<
        TRouteContextFn,
        (ctx: TCtx) => LifecycleHandlerResult<TRouteContextFn>
      > &
        LifecycleSSRGuard<
          TRegister,
          TParentRoute,
          TSSR,
          globalThis.NoInfer<TRouteContextFn>
        >
      /**
       * `false` is the default for `context`: the result is not sent to the client.
       * The server still runs `handler`; the client re-runs it during hydration (on `ssr: true`
       * routes both runs must produce the same value). `hydrate` is not allowed with `dehydrate: false`.
       *
       * @experimental
       */
      dehydrate?: false
      /**
       * Not allowed here: `hydrate` requires `dehydrate: true` or a `dehydrate` function.
       */
      hydrate?: undefined
      /**
       * `context` only; write it after `hydrate`. Runs on `router.invalidate()` and nothing else
       * (there is no time-based revalidation of context). `true` re-runs `handler`; a function runs
       * instead and receives `prev`, the current context data (the last successful `handler`,
       * `hydrate` or `revalidate` result, `undefined` if none has succeeded for this match yet), and
       * returns the handler's data type or a redirect; may be async. Parameters are inferred: do not annotate them.
       */
      revalidate?: boolean | RouteContextRevalidateFn<TCtx, TRouteContextFn>
    }
  | {
      /**
       * The lifecycle function; its awaited return value is the lifecycle's data. Write it first:
       * `dehydrate`, `hydrate` and `revalidate` are typed from it.
       */
      handler: ConstrainLiteral<
        TRouteContextFn,
        (ctx: TCtx) => LifecycleHandlerResult<TRouteContextFn>
      > &
        LifecycleSSRGuard<
          TRegister,
          TParentRoute,
          TSSR,
          globalThis.NoInfer<TRouteContextFn>
        >
      /**
       * Server-side transform of `data` (the handler's awaited result) into the value sent to the
       * client; may be async. Supports route context and passive lifecycle metadata.
       * Navigation functions, abort controllers and parent-match work are outside the codec API.
       * The returned value must be serializable (checked in Start apps,
       * which also reject a return typed `unknown`). A `dehydrate` function requires `hydrate`.
       * Parameters are inferred: do not annotate them. This is a transform, not a lifecycle:
       * throwing `redirect` or `notFound` here is an error.
       *
       * @experimental
       */
      dehydrate: LifecycleDehydrateFn<
        TRegister,
        TParentRoute,
        TSSR,
        TCtx,
        TRouteContextFn,
        TContextWire
      >
      /**
       * Client-side reconstruction during hydration; `data` is the awaited `dehydrate` result and route
       * context and passive lifecycle metadata are available; may be async. Write `dehydrate` before `hydrate`.
       * The result must satisfy the client handler's inferred data type. Isomorphic handlers
       * can return different server/client shapes when server rendering is disabled for the route.
       * Extra properties returned only here do not add fields to the public client data type.
       * Parameters are inferred: do not annotate them. If `hydrate` throws (anything) or returns a
       * `redirect`, the client recovers with a normal client load, which runs `handler` again;
       * `hydrate` itself calls no `onError`.
       *
       * @experimental
       */
      hydrate: LifecycleCodecHydrateFn<TCtx, TRouteContextFn, TContextWire>
      /**
       * `context` only; write it after `hydrate`. Runs on `router.invalidate()` and nothing else
       * (there is no time-based revalidation of context). `true` re-runs `handler`; a function runs
       * instead and receives `prev`, the current context data (the last successful `handler`,
       * `hydrate` or `revalidate` result, `undefined` if none has succeeded for this match yet), and
       * returns the handler's data type or a redirect; may be async. Parameters are inferred: do not annotate them.
       */
      revalidate?: boolean | RouteContextRevalidateFn<TCtx, TRouteContextFn>
    }
  | ({
      /**
       * The lifecycle function; its awaited return value is the lifecycle's data. Write it first:
       * `dehydrate`, `hydrate` and `revalidate` are typed from it.
       * The result is transported to the client, so it must be serializable (checked in Start apps).
       */
      handler: ConstrainLiteral<
        TRouteContextFn,
        (
          ctx: TCtx,
        ) => ValidateSerializableLifecycleResult<
          TRegister,
          TParentRoute,
          TSSR,
          TRouteContextFn,
          never
        >
      > &
        LifecycleSSRGuard<
          TRegister,
          TParentRoute,
          TSSR,
          globalThis.NoInfer<TRouteContextFn>
        >
      /**
       * Send the context result to the client as is (it must be serializable, checked in Start apps).
       * With `dehydrate: true`, `hydrate` receives the full value as `data`.
       *
       * @experimental
       */
      dehydrate: true
      /**
       * Optional client-side step during hydration; `data` is the handler's full awaited value and route
       * context and passive lifecycle metadata are available; may be async. Write `dehydrate` before `hydrate`.
       * The result must satisfy the client handler's inferred data type. Isomorphic handlers
       * can return different server/client shapes when server rendering is disabled for the route.
       * Extra properties returned only here do not add fields to the public client data type.
       * Parameters are inferred: do not annotate them. If `hydrate` throws (anything) or returns a
       * `redirect`, the client recovers with a normal client load, which runs `handler` again;
       * `hydrate` itself calls no `onError`.
       *
       * @experimental
       */
      hydrate?: LifecycleHydrateFn<TCtx, TRouteContextFn, TContextWire>
      /**
       * `context` only; write it after `hydrate`. Runs on `router.invalidate()` and nothing else
       * (there is no time-based revalidation of context). `true` re-runs `handler`; a function runs
       * instead and receives `prev`, the current context data (the last successful `handler`,
       * `hydrate` or `revalidate` result, `undefined` if none has succeeded for this match yet), and
       * returns the handler's data type or a redirect; may be async. Parameters are inferred: do not annotate them.
       */
      revalidate?: boolean | RouteContextRevalidateFn<TCtx, TRouteContextFn>
    } & LifecycleHydrateRequirement<
      TRegister,
      TParentRoute,
      TSSR,
      TRouteContextFn
    >)

/**
 * `beforeLoad`: transported by default.
 * Arm order: fn, {dehydrate: false}, codec, {dehydrate: true}, {dehydrate omitted}
 * (validated) last. `hydrate` requires `dehydrate` (a function, or `true`).
 */
export type RouteBeforeLoadOption<
  TRegister,
  TParentRoute extends AnyRoute,
  TSSR,
  TSearchValidator,
  TParams,
  TRouterContext,
  TRouteContextFn,
  TId,
  TServerMiddlewares,
  THandlers,
  TBeforeLoadFn,
  TBeforeLoadWire,
  TCtx = BeforeLoadContextOptions<
    TRegister,
    TParentRoute,
    TSearchValidator,
    TParams,
    TRouterContext,
    TRouteContextFn,
    TId,
    TServerMiddlewares,
    THandlers
  >,
> =
  | (ConstrainLiteral<
      TBeforeLoadFn,
      (
        ctx: TCtx,
      ) => ValidateSerializableLifecycleResult<
        TRegister,
        TParentRoute,
        TSSR,
        TBeforeLoadFn
      >
    > &
      LifecycleSSRGuard<
        TRegister,
        TParentRoute,
        TSSR,
        globalThis.NoInfer<TBeforeLoadFn>,
        true
      >)
  | {
      /**
       * The lifecycle function; its awaited return value is the lifecycle's data. Write it first:
       * `dehydrate` and `hydrate` are typed from it.
       */
      handler: ConstrainLiteral<
        TBeforeLoadFn,
        (ctx: TCtx) => LifecycleHandlerResult<TBeforeLoadFn>
      > &
        LifecycleSSRGuard<
          TRegister,
          TParentRoute,
          TSSR,
          globalThis.NoInfer<TBeforeLoadFn>
        >
      /**
       * Opt out of the default transport: the result is not sent to the client.
       * The server still runs `handler`; the client re-runs it during hydration (on `ssr: true`
       * routes both runs must produce the same value). `hydrate` is not allowed with `dehydrate: false`.
       *
       * @experimental
       */
      dehydrate: false
      /**
       * Not allowed here: `hydrate` requires `dehydrate: true` or a `dehydrate` function.
       */
      hydrate?: undefined
    }
  | {
      /**
       * The lifecycle function; its awaited return value is the lifecycle's data. Write it first:
       * `dehydrate` and `hydrate` are typed from it.
       */
      handler: ConstrainLiteral<
        TBeforeLoadFn,
        (ctx: TCtx) => LifecycleHandlerResult<TBeforeLoadFn>
      > &
        LifecycleSSRGuard<
          TRegister,
          TParentRoute,
          TSSR,
          globalThis.NoInfer<TBeforeLoadFn>
        >
      /**
       * Server-side transform of `data` (the handler's awaited result) into the value sent to the
       * client; may be async. Supports route context and passive lifecycle metadata.
       * Navigation functions, abort controllers and parent-match work are outside the codec API.
       * The returned value must be serializable (checked in Start apps,
       * which also reject a return typed `unknown`). A `dehydrate` function requires `hydrate`.
       * Parameters are inferred: do not annotate them. This is a transform, not a lifecycle:
       * throwing `redirect` or `notFound` here is an error.
       *
       * @experimental
       */
      dehydrate: LifecycleDehydrateFn<
        TRegister,
        TParentRoute,
        TSSR,
        TCtx,
        TBeforeLoadFn,
        TBeforeLoadWire
      >
      /**
       * Client-side reconstruction during hydration; `data` is the awaited `dehydrate` result and route
       * context and passive lifecycle metadata are available; may be async. Write `dehydrate` before `hydrate`.
       * The result must satisfy the client handler's inferred data type. Isomorphic handlers
       * can return different server/client shapes when server rendering is disabled for the route.
       * Extra properties returned only here do not add fields to the public client data type.
       * Parameters are inferred: do not annotate them. If `hydrate` throws (anything) or returns a
       * `redirect`, the client recovers with a normal client load, which runs `handler` again;
       * `hydrate` itself calls no `onError`.
       *
       * @experimental
       */
      hydrate: LifecycleCodecHydrateFn<TCtx, TBeforeLoadFn, TBeforeLoadWire>
    }
  | ({
      /**
       * The lifecycle function; its awaited return value is the lifecycle's data. Write it first:
       * `dehydrate` and `hydrate` are typed from it.
       * The result is transported to the client, so it must be serializable (checked in Start apps).
       */
      handler: ConstrainLiteral<
        TBeforeLoadFn,
        (
          ctx: TCtx,
        ) => ValidateSerializableLifecycleResult<
          TRegister,
          TParentRoute,
          TSSR,
          TBeforeLoadFn
        >
      > &
        LifecycleSSRGuard<
          TRegister,
          TParentRoute,
          TSSR,
          globalThis.NoInfer<TBeforeLoadFn>
        >
      /**
       * Send the result to the client as is (the default; it must be serializable, checked in Start apps).
       * With `dehydrate: true`, `hydrate` receives the full value as `data`.
       *
       * @experimental
       */
      dehydrate: true
      /**
       * Optional client-side step during hydration; `data` is the handler's full awaited value and route
       * context and passive lifecycle metadata are available; may be async. Write `dehydrate` before `hydrate`.
       * The result must satisfy the client handler's inferred data type. Isomorphic handlers
       * can return different server/client shapes when server rendering is disabled for the route.
       * Extra properties returned only here do not add fields to the public client data type.
       * Parameters are inferred: do not annotate them. If `hydrate` throws (anything) or returns a
       * `redirect`, the client recovers with a normal client load, which runs `handler` again;
       * `hydrate` itself calls no `onError`.
       *
       * @experimental
       */
      hydrate?: LifecycleHydrateFn<TCtx, TBeforeLoadFn, TBeforeLoadWire>
    } & LifecycleHydrateRequirement<
      TRegister,
      TParentRoute,
      TSSR,
      TBeforeLoadFn
    >)
  | {
      /**
       * The lifecycle function; its awaited return value is the lifecycle's data. Write it first:
       * `dehydrate` and `hydrate` are typed from it.
       * The result is transported to the client, so it must be serializable (checked in Start apps).
       */
      handler: ConstrainLiteral<
        TBeforeLoadFn,
        (
          ctx: TCtx,
        ) => ValidateSerializableLifecycleResult<
          TRegister,
          TParentRoute,
          TSSR,
          TBeforeLoadFn
        >
      > &
        LifecycleSSRGuard<
          TRegister,
          TParentRoute,
          TSSR,
          globalThis.NoInfer<TBeforeLoadFn>,
          true
        >
      /**
       * Omitted: the default transport applies (`beforeLoad` is sent to the client and must be
       * serializable). `hydrate` requires an explicit `dehydrate: true` or a `dehydrate` function.
       *
       * @experimental
       */
      dehydrate?: undefined
      /**
       * Not allowed here: `hydrate` requires `dehydrate: true` or a `dehydrate` function.
       */
      hydrate?: undefined
    }

/**
 * `loader`: transported by default; keeps `staleReloadMode` in the object form.
 * Arm order: fn, {dehydrate: false}, codec, {dehydrate: true}, {dehydrate omitted}
 * (validated) last. `hydrate` requires `dehydrate` (a function, or `true`).
 */
export type RouteLoaderOption<
  TRegister,
  TParentRoute extends AnyRoute,
  TSSR,
  TId extends string,
  TParams,
  TLoaderDeps,
  TRouterContext,
  TRouteContextFn,
  TBeforeLoadFn,
  TServerMiddlewares,
  THandlers,
  TLoaderFn,
  TLoaderWire,
  TCtx = LoaderFnContext<
    TRegister,
    TParentRoute,
    TId,
    TParams,
    TLoaderDeps,
    TRouterContext,
    TRouteContextFn,
    TBeforeLoadFn,
    TServerMiddlewares,
    THandlers
  >,
> =
  | (ConstrainLiteral<
      TLoaderFn,
      (
        ctx: TCtx,
      ) => ValidateSerializableLifecycleResult<
        TRegister,
        TParentRoute,
        TSSR,
        TLoaderFn
      >
    > &
      LifecycleSSRGuard<
        TRegister,
        TParentRoute,
        TSSR,
        globalThis.NoInfer<TLoaderFn>,
        true
      >)
  | {
      /**
       * The lifecycle function; its awaited return value is the lifecycle's data. Write it first:
       * `dehydrate` and `hydrate` are typed from it.
       */
      handler: ConstrainLiteral<
        TLoaderFn,
        (ctx: TCtx) => LifecycleHandlerResult<TLoaderFn>
      > &
        LifecycleSSRGuard<
          TRegister,
          TParentRoute,
          TSSR,
          globalThis.NoInfer<TLoaderFn>
        >
      /**
       * Opt out of the default transport: the result is not sent to the client.
       * The server still runs `handler`; the client re-runs it during hydration (on `ssr: true`
       * routes both runs must produce the same value). `hydrate` is not allowed with `dehydrate: false`.
       *
       * @experimental
       */
      dehydrate: false
      /**
       * Not allowed here: `hydrate` requires `dehydrate: true` or a `dehydrate` function.
       */
      hydrate?: undefined
      /**
       * `loader` only; write it last. How a stale match reloads: `'background'` shows the cached data
       * and re-runs the loader in the background, `'blocking'` waits for the loader. Defaults to the
       * router's `defaultStaleReloadMode` (`'background'` unless set).
       */
      staleReloadMode?: LoaderStaleReloadMode
    }
  | {
      /**
       * The lifecycle function; its awaited return value is the lifecycle's data. Write it first:
       * `dehydrate` and `hydrate` are typed from it.
       */
      handler: ConstrainLiteral<
        TLoaderFn,
        (ctx: TCtx) => LifecycleHandlerResult<TLoaderFn>
      > &
        LifecycleSSRGuard<
          TRegister,
          TParentRoute,
          TSSR,
          globalThis.NoInfer<TLoaderFn>
        >
      /**
       * Server-side transform of `data` (the handler's awaited result) into the value sent to the
       * client; may be async. Supports route context and passive lifecycle metadata.
       * Navigation functions, abort controllers and parent-match work are outside the codec API.
       * The returned value must be serializable (checked in Start apps,
       * which also reject a return typed `unknown`). A `dehydrate` function requires `hydrate`.
       * Parameters are inferred: do not annotate them. This is a transform, not a lifecycle:
       * throwing `redirect` or `notFound` here is an error.
       *
       * @experimental
       */
      dehydrate: LifecycleDehydrateFn<
        TRegister,
        TParentRoute,
        TSSR,
        TCtx,
        TLoaderFn,
        TLoaderWire
      >
      /**
       * Client-side reconstruction during hydration; `data` is the awaited `dehydrate` result and route
       * context and passive lifecycle metadata are available; may be async. Write `dehydrate` before `hydrate`.
       * The result must satisfy the client handler's inferred data type. Isomorphic handlers
       * can return different server/client shapes when server rendering is disabled for the route.
       * Extra properties returned only here do not add fields to the public client data type.
       * Parameters are inferred: do not annotate them. If `hydrate` throws (anything) or returns a
       * `redirect`, the client recovers with a normal client load, which runs `handler` again;
       * `hydrate` itself calls no `onError`.
       *
       * @experimental
       */
      hydrate: LifecycleCodecHydrateFn<TCtx, TLoaderFn, TLoaderWire>
      /**
       * `loader` only; write it last. How a stale match reloads: `'background'` shows the cached data
       * and re-runs the loader in the background, `'blocking'` waits for the loader. Defaults to the
       * router's `defaultStaleReloadMode` (`'background'` unless set).
       */
      staleReloadMode?: LoaderStaleReloadMode
    }
  | ({
      /**
       * The lifecycle function; its awaited return value is the lifecycle's data. Write it first:
       * `dehydrate` and `hydrate` are typed from it.
       * The result is transported to the client, so it must be serializable (checked in Start apps).
       */
      handler: ConstrainLiteral<
        TLoaderFn,
        (
          ctx: TCtx,
        ) => ValidateSerializableLifecycleResult<
          TRegister,
          TParentRoute,
          TSSR,
          TLoaderFn
        >
      > &
        LifecycleSSRGuard<
          TRegister,
          TParentRoute,
          TSSR,
          globalThis.NoInfer<TLoaderFn>
        >
      /**
       * Send the result to the client as is (the default; it must be serializable, checked in Start apps).
       * With `dehydrate: true`, `hydrate` receives the full value as `data`.
       *
       * @experimental
       */
      dehydrate: true
      /**
       * Optional client-side step during hydration; `data` is the handler's full awaited value and route
       * context and passive lifecycle metadata are available; may be async. Write `dehydrate` before `hydrate`.
       * The result must satisfy the client handler's inferred data type. Isomorphic handlers
       * can return different server/client shapes when server rendering is disabled for the route.
       * Extra properties returned only here do not add fields to the public client data type.
       * Parameters are inferred: do not annotate them. If `hydrate` throws (anything) or returns a
       * `redirect`, the client recovers with a normal client load, which runs `handler` again;
       * `hydrate` itself calls no `onError`.
       *
       * @experimental
       */
      hydrate?: LifecycleHydrateFn<TCtx, TLoaderFn, TLoaderWire>
      /**
       * `loader` only; write it last. How a stale match reloads: `'background'` shows the cached data
       * and re-runs the loader in the background, `'blocking'` waits for the loader. Defaults to the
       * router's `defaultStaleReloadMode` (`'background'` unless set).
       */
      staleReloadMode?: LoaderStaleReloadMode
    } & LifecycleHydrateRequirement<TRegister, TParentRoute, TSSR, TLoaderFn>)
  | {
      /**
       * The lifecycle function; its awaited return value is the lifecycle's data. Write it first:
       * `dehydrate` and `hydrate` are typed from it.
       * The result is transported to the client, so it must be serializable (checked in Start apps).
       */
      handler: ConstrainLiteral<
        TLoaderFn,
        (
          ctx: TCtx,
        ) => ValidateSerializableLifecycleResult<
          TRegister,
          TParentRoute,
          TSSR,
          TLoaderFn
        >
      > &
        LifecycleSSRGuard<
          TRegister,
          TParentRoute,
          TSSR,
          globalThis.NoInfer<TLoaderFn>,
          true
        >
      /**
       * Omitted: the default transport applies (`loader` is sent to the client and must be
       * serializable). `hydrate` requires an explicit `dehydrate: true` or a `dehydrate` function.
       *
       * @experimental
       */
      dehydrate?: undefined
      /**
       * Not allowed here: `hydrate` requires `dehydrate: true` or a `dehydrate` function.
       */
      hydrate?: undefined
      /**
       * `loader` only; write it last. How a stale match reloads: `'background'` shows the cached data
       * and re-runs the loader in the background, `'blocking'` waits for the loader. Defaults to the
       * router's `defaultStaleReloadMode` (`'background'` unless set).
       */
      staleReloadMode?: LoaderStaleReloadMode
    }

export type RouteOptions<
  TRegister,
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
  TSSR = unknown,
  TServerMiddlewares = unknown,
  THandlers = undefined,
  TContextWire = LifecycleNoWire,
  TBeforeLoadWire = LifecycleNoWire,
  TLoaderWire = LifecycleNoWire,
> = BaseRouteOptions<
  TRegister,
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
  TBeforeLoadFn,
  TSSR,
  TServerMiddlewares,
  THandlers,
  TContextWire,
  TBeforeLoadWire,
  TLoaderWire
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
  in out TRouteId,
> = (
  ctx: RouteContextOptions<
    TParentRoute,
    TSearchValidator,
    TParams,
    TRouterContext,
    TRouteId
  >,
) => any

// The three lifecycle keys (plus `shouldReload`, which receives the loader's ctx) are
// declared here, not on the augmented FilebaseRouteOptionsInterface, so wire
// generics do not have to be mirrored by every module augmentation.
// Shared downstream callbacks see server/client context possibilities. Client data
// consumers read the client handler's contract.
//
// Type-check cost, paid by every route whether it uses these options or not:
// - The keys are an inline object type, not a type alias. TypeScript measures the
//   variance of an object type alias the first time it compares two instantiations of
//   it (every app does, when its root route is checked against `AnyRoute`), and
//   measuring these option unions resolves the registered router's types.
// - The upstream slots are read in the downstream ctx types, never inferred from them,
//   so they are wrapped in the intrinsic `NoInfer` (router-core's own `NoInfer` is a
//   conditional type). Otherwise inference from every loader function would expand
//   every upstream lifecycle option during downstream parameter inference.
// - The `params` keys are declared in the same object type (ParamsOptions picks them
//   from here), so a route instantiates one object type for them instead of two.
export type FileBaseRouteOptions<
  TRegister,
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
  TSSR = unknown,
  TServerMiddlewares = unknown,
  THandlers = undefined,
  TContextWire = LifecycleNoWire,
  TBeforeLoadWire = LifecycleNoWire,
  TLoaderWire = LifecycleNoWire,
> = FilebaseRouteOptionsInterface<
  TRegister,
  TParentRoute,
  TId,
  TPath,
  TSearchValidator,
  TParams,
  TLoaderDeps,
  TLoaderFn,
  TRouterContext,
  TRouteContextFn,
  TBeforeLoadFn,
  TRemountDepsFn,
  TSSR,
  TServerMiddlewares,
  THandlers
> & {
  params?: {
    parse?: ParseParamsFn<TPath, TParams> & ValidateParsedParams<TPath, TParams>
    /**
     * When multiple route candidates use `params.parse` during matching,
     * higher priorities are tried first.
     *
     * @default 0
     */
    priority?: number
    stringify?: StringifyParamsFn<TPath, TParams>
  }

  /** @deprecated Use params.parse instead */
  parseParams?: ParseParamsFn<TPath, TParams> &
    ValidateParsedParams<TPath, TParams>

  /** @deprecated Use params.stringify instead */
  stringifyParams?: StringifyParamsFn<TPath, TParams>

  /**
   * Route context: a cached, serial lifecycle (parent to child, before `beforeLoad`), computed once
   * per match and visible to `beforeLoad`, `loader` and every child; may be async. Not sent to the
   * client by default (`dehydrate: false`): during SSR hydration the client re-runs it unless the
   * object form opts in with `dehydrate: true` or a `dehydrate` function. Accepts a function or
   * `{ handler, dehydrate?, hydrate?, revalidate? }` with the keys in that order.
   *
   * @experimental The `context` option may still change in a minor release.
   */
  context?: RouteContextOption<
    TRegister,
    TParentRoute,
    TSSR,
    TParams,
    TRouterContext,
    TLoaderDeps,
    TId,
    TServerMiddlewares,
    THandlers,
    TRouteContextFn,
    TContextWire
  >

  /**
   * Runs before the route's loader on every load. If an error is thrown here the loader is not
   * called; during a navigation the error becomes the match's error and reaches `onError`, during a
   * preload it is part of the returned matches. Sent to the client by default (`dehydrate: true`),
   * so the result must be serializable (checked in Start apps). Accepts a function or
   * `{ handler, dehydrate?, hydrate? }` with the keys in that order. `dehydrate` and `hydrate` are
   * experimental and may still change in a minor release.
   */
  beforeLoad?: RouteBeforeLoadOption<
    TRegister,
    TParentRoute,
    TSSR,
    TSearchValidator,
    TParams,
    TRouterContext,
    globalThis.NoInfer<TRouteContextFn>,
    TId,
    TServerMiddlewares,
    THandlers,
    TBeforeLoadFn,
    TBeforeLoadWire
  >

  /**
   * Loads the route's data; follows the router's caching rules. Sent to the client by default
   * (`dehydrate: true`), so the result must be serializable (checked in Start apps). Accepts a
   * function or `{ handler, dehydrate?, hydrate?, staleReloadMode? }` with the keys in that order.
   * `dehydrate` and `hydrate` are experimental and may still change in a minor release.
   */
  loader?: RouteLoaderOption<
    TRegister,
    TParentRoute,
    TSSR,
    TId,
    TParams,
    TLoaderDeps,
    TRouterContext,
    globalThis.NoInfer<TRouteContextFn>,
    globalThis.NoInfer<TBeforeLoadFn>,
    TServerMiddlewares,
    THandlers,
    TLoaderFn,
    TLoaderWire
  >

  /**
   * `false` keeps a successful match's loader data on later matches, `true` reloads it, `undefined`
   * follows the stale-while-revalidate rules. A function receives the loader's ctx and returns one
   * of those; its `context` includes what a context or beforeLoad `hydrate` returned.
   */
  shouldReload?:
    | boolean
    | ((
        match: LoaderFnContext<
          TRegister,
          TParentRoute,
          TId,
          TParams,
          TLoaderDeps,
          TRouterContext,
          globalThis.NoInfer<TRouteContextFn>,
          globalThis.NoInfer<TBeforeLoadFn>,
          TServerMiddlewares,
          THandlers
        >,
      ) => any)
}

export interface FilebaseRouteOptionsInterface<
  TRegister,
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
  TSSR = unknown,
  TServerMiddlewares = unknown,
  THandlers = undefined,
> {
  validateSearch?: Constrain<TSearchValidator, AnyValidator, DefaultValidator>

  ssr?: ConstrainLiteral<
    TSSR,
    | undefined
    | SSROption
    | ((
        ctx: SsrContextOptions<TParentRoute, TSearchValidator, TParams>,
      ) => Awaitable<undefined | SSROption>)
  >

  loaderDeps?: (
    opts: FullSearchSchemaOption<TParentRoute, TSearchValidator>,
  ) => TLoaderDeps

  remountDeps?: Constrain<
    TRemountDepsFn,
    (
      opt: RemountDepsOptions<
        TId,
        ResolveFullSearchSchema<TParentRoute, TSearchValidator>,
        Expand<ResolveAllParamsFromParent<TParentRoute, TParams>>,
        TLoaderDeps
      >,
    ) => any
  >
}

export type BaseRouteOptions<
  TRegister,
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
  TSSR = unknown,
  TServerMiddlewares = unknown,
  THandlers = undefined,
  TContextWire = LifecycleNoWire,
  TBeforeLoadWire = LifecycleNoWire,
  TLoaderWire = LifecycleNoWire,
> = RoutePathOptions<TCustomId, TPath> &
  FileBaseRouteOptions<
    TRegister,
    TParentRoute,
    TId,
    TPath,
    TSearchValidator,
    TParams,
    TLoaderDeps,
    TLoaderFn,
    TRouterContext,
    TRouteContextFn,
    TBeforeLoadFn,
    AnyContext,
    TSSR,
    TServerMiddlewares,
    THandlers,
    TContextWire,
    TBeforeLoadWire,
    TLoaderWire
  > & {
    getParentRoute: () => TParentRoute
  }

export interface ContextOptions<
  in out TParentRoute extends AnyRoute,
  in out TParams,
  in out TRouteId,
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
  routeId: TRouteId
}

/**
 * The `context` lifecycle's ctx. The last three type arguments type Start's `serverContext`. Their
 * defaults (the registered `Register`, then `any`) let a helper annotated with only the first five
 * accept any route, and keep the route's `Register`, so its results are still validated.
 */
export interface RouteContextOptions<
  in out TParentRoute extends AnyRoute,
  in out TParams,
  in out TRouterContext,
  in out TLoaderDeps,
  in out TRouteId,
  in out TRegister = Register,
  in out TServerMiddlewares = any,
  in out THandlers = any,
> extends ContextOptions<TParentRoute, TParams, TRouteId> {
  deps: TLoaderDeps
  context: Expand<RouteContextParameter<TParentRoute, TRouterContext>>
}

export interface SsrContextOptions<
  in out TParentRoute extends AnyRoute,
  in out TSearchValidator,
  in out TParams,
> {
  params:
    | {
        status: 'success'
        value: Expand<ResolveAllParamsFromParent<TParentRoute, TParams>>
      }
    | { status: 'error'; error: unknown }
  search:
    | {
        status: 'success'
        value: Expand<ResolveFullSearchSchema<TParentRoute, TSearchValidator>>
      }
    | { status: 'error'; error: unknown }
  location: ParsedLocation
  matches: Array<MakePreValidationErrorHandlingRouteMatchUnion>
}

export interface BeforeLoadContextOptions<
  in out TRegister,
  in out TParentRoute extends AnyRoute,
  in out TSearchValidator,
  in out TParams,
  in out TRouterContext,
  in out TRouteContextFn,
  in out TRouteId,
  in out TServerMiddlewares,
  in out THandlers,
>
  extends
    ContextOptions<TParentRoute, TParams, TRouteId>,
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
  ssr?: {
    nonce?: string
  }
  matches: Array<
    RouteMatch<
      TRouteId,
      TFullPath,
      ResolveAllParamsFromParent<TParentRoute, TParams>,
      ResolveFullSearchSchema<TParentRoute, TSearchValidator>,
      ResolveLoaderData<TLoaderFn, 'shared'>,
      ResolveAllContext<
        TParentRoute,
        TRouterContext,
        TRouteContextFn,
        TBeforeLoadFn,
        'shared'
      >,
      TLoaderDeps
    >
  >
  match: RouteMatch<
    TRouteId,
    TFullPath,
    ResolveAllParamsFromParent<TParentRoute, TParams>,
    ResolveFullSearchSchema<TParentRoute, TSearchValidator>,
    ResolveLoaderData<TLoaderFn, 'shared'>,
    ResolveAllContext<
      TParentRoute,
      TRouterContext,
      TRouteContextFn,
      TBeforeLoadFn,
      'shared'
    >,
    TLoaderDeps
  >
  params: ResolveAllParamsFromParent<TParentRoute, TParams>
  loaderData?: ResolveLoaderData<TLoaderFn, 'shared'>
}

export interface DefaultUpdatableRouteOptionsExtensions {
  component?: unknown
  errorComponent?: unknown
  notFoundComponent?: unknown
  pendingComponent?: unknown
}

export interface UpdatableRouteOptionsExtensions extends DefaultUpdatableRouteOptionsExtensions {}

// Read the raw handler slots here, after the factory has inferred their codec wire values.
// `createFileRoute(path)` instantiates the factory signature once per route before its
// type arguments are inferred, so the file-route factories pass the raw slots plus the
// wire generics here, and return their Route through a conditional on `TRegister`
// (always true, but deferred in that pass): folding the slots or building the Route
// there would cost every route.
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
>
  extends UpdatableStaticRouteOption, UpdatableRouteOptionsExtensions {
  /**
   * If true, this route will be matched as case-sensitive
   *
   * @default false
   */
  caseSensitive?: boolean
  /**
   * If true, this route will be forcefully wrapped in a suspense boundary
   */
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
      SearchMiddleware<ResolveFullSearchSchema<TParentRoute, TSearchValidator>>
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
  onCatch?: (error: ErrorBoundaryTypes['error']) => void
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
  headers?: (
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
  ) => Awaitable<Record<string, string> | undefined>
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
  ) => Awaitable<{
    links?: AnyRouteMatch['links']
    scripts?: AnyRouteMatch['headScripts']
    meta?: AnyRouteMatch['meta']
    styles?: AnyRouteMatch['styles']
  }>
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
  ) => Awaitable<AnyRouteMatch['scripts']>
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
  in out TRegister,
  in out TParentRoute extends AnyRoute = AnyRoute,
  in out TId extends string = string,
  in out TParams = {},
  in out TLoaderDeps = {},
  in out TRouterContext = {},
  in out TRouteContextFn = AnyContext,
  in out TBeforeLoadFn = AnyContext,
  in out TServerMiddlewares = unknown,
  in out THandlers = undefined,
> = (
  match: LoaderFnContext<
    TRegister,
    TParentRoute,
    TId,
    TParams,
    TLoaderDeps,
    TRouterContext,
    TRouteContextFn,
    TBeforeLoadFn,
    TServerMiddlewares,
    THandlers
  >,
) => any

export type LoaderStaleReloadMode = 'background' | 'blocking'

export type RouteLoaderEntry<
  TRegister,
  TParentRoute extends AnyRoute = AnyRoute,
  TId extends string = string,
  TParams = {},
  TLoaderDeps = {},
  TRouterContext = {},
  TRouteContextFn = AnyContext,
  TBeforeLoadFn = AnyContext,
  TServerMiddlewares = unknown,
  THandlers = undefined,
> =
  | RouteLoaderFn<
      TRegister,
      TParentRoute,
      TId,
      TParams,
      TLoaderDeps,
      TRouterContext,
      TRouteContextFn,
      TBeforeLoadFn,
      TServerMiddlewares,
      THandlers
    >
  | RouteLoaderObject<
      TRegister,
      TParentRoute,
      TId,
      TParams,
      TLoaderDeps,
      TRouterContext,
      TRouteContextFn,
      TBeforeLoadFn,
      TServerMiddlewares,
      THandlers
    >

export interface LoaderFnContext<
  in out TRegister = unknown,
  in out TParentRoute extends AnyRoute = AnyRoute,
  in out TId extends string = string,
  in out TParams = {},
  in out TLoaderDeps = {},
  in out TRouterContext = {},
  in out TRouteContextFn = AnyContext,
  in out TBeforeLoadFn = AnyContext,
  in out TServerMiddlewares = unknown,
  in out THandlers = undefined,
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
      TBeforeLoadFn,
      'shared'
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

export interface DefaultRootRouteOptionsExtensions {
  shellComponent?: unknown
}

export interface RootRouteOptionsExtensions extends DefaultRootRouteOptionsExtensions {}

export interface RootRouteOptions<
  TRegister = unknown,
  TSearchValidator = undefined,
  TRouterContext = {},
  TRouteContextFn = AnyContext,
  TBeforeLoadFn = AnyContext,
  TLoaderDeps extends Record<string, any> = {},
  TLoaderFn = undefined,
  TSSR = unknown,
  TServerMiddlewares = unknown,
  THandlers = undefined,
  TContextWire = LifecycleNoWire,
  TBeforeLoadWire = LifecycleNoWire,
  TLoaderWire = LifecycleNoWire,
>
  extends
    Omit<
      RouteOptions<
        TRegister,
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
        TBeforeLoadFn,
        TSSR,
        TServerMiddlewares,
        THandlers,
        TContextWire,
        TBeforeLoadWire,
        TLoaderWire
      >,
      | 'path'
      | 'id'
      | 'getParentRoute'
      | 'caseSensitive'
      | 'parseParams'
      | 'stringifyParams'
      | 'params'
    >,
    RootRouteOptionsExtensions {}

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

/**
 * @deprecated Use `ErrorComponentProps` instead.
 */
export type ErrorRouteProps = {
  error: unknown
  info?: { componentStack: string }
  reset: () => void
}

export interface DefaultErrorBoundaryTypes {
  error: unknown
}

/** Frameworks can specialize the error exposed by boundary components and callbacks. */
export interface ErrorBoundaryTypes extends DefaultErrorBoundaryTypes {}

export type ErrorComponentProps<TError = ErrorBoundaryTypes['error']> = {
  error: TError
  info?: { componentStack: string }
  reset: () => void
}

export type NotFoundRouteProps = {
  data?: unknown
  isNotFound: boolean
  routeId: RouteIds<RegisteredRouter['routeTree']>
}

export class BaseRoute<
  in out TRegister = Register,
  in out TParentRoute extends AnyRoute = AnyRoute,
  in out TPath extends string = '/',
  in out TFullPath extends string = ResolveFullPath<TParentRoute, TPath>,
  in out TCustomId extends string = string,
  in out TId extends string = ResolveId<TParentRoute, TCustomId, TPath>,
  in out TSearchValidator = undefined,
  in out TParams = ResolveParams<TPath>,
  in out TRouterContext = AnyContext,
  in out TRouteContextFn = AnyContext,
  in out TBeforeLoadFn = AnyContext,
  in out TLoaderDeps extends Record<string, any> = {},
  in out TLoaderFn = undefined,
  in out TChildren = unknown,
  in out TFileRouteTypes = unknown,
  in out TSSR = unknown,
  in out TServerMiddlewares = unknown,
  in out THandlers = undefined,
> {
  isRoot: TParentRoute extends AnyRoute ? true : false
  options: RouteOptions<
    TRegister,
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
    TBeforeLoadFn,
    TSSR,
    TServerMiddlewares,
    THandlers,
    any,
    any,
    any
  >

  // The following properties are set up in this.init()
  parentRoute!: TParentRoute
  private _id!: TId
  private _path!: TPath
  private _fullPath!: TFullPath
  private _to!: TrimPathRight<TFullPath>

  public get to() {
    return this._to
  }

  public get id() {
    return this._id
  }

  public get path() {
    return this._path
  }

  public get fullPath() {
    return this._fullPath
  }

  // Optional
  children?: TChildren
  originalIndex?: number
  rank!: number
  lazyFn?: () => Promise<
    LazyRoute<
      Route<
        TRegister,
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
        TFileRouteTypes,
        TSSR,
        TServerMiddlewares,
        THandlers
      >
    >
  >
  /** @internal */
  _lazy?: Promise<void> | true
  /** @internal */
  _branch?: ReadonlyArray<AnyRoute>
  /** @internal */
  _interpolation?: RouteInterpolation
  constructor(
    options?: RouteOptions<
      TRegister,
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
      TBeforeLoadFn,
      TSSR,
      TServerMiddlewares,
      THandlers,
      any,
      any,
      any
    >,
  ) {
    this.options = (options as any) || {}
    this.isRoot = !options?.getParentRoute as any

    if ((options as any)?.id && (options as any)?.path) {
      throw new Error(`Route cannot have both an 'id' and a 'path' option.`)
    }
  }

  types!: RouteTypes<
    TRegister,
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
    TFileRouteTypes,
    TSSR,
    TServerMiddlewares,
    THandlers
  >

  init = (originalIndex: number): void => {
    this.originalIndex = originalIndex
    // Rebuilding a tree can change the ancestors of an existing route.
    this._branch = undefined

    const options = this.options as
      | (RouteOptions<
          TRegister,
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
          TBeforeLoadFn,
          TSSR,
          TServerMiddlewares
        > &
          RoutePathOptionsIntersection<TCustomId, TPath>)
      | undefined

    const isRoot = !options?.path && !options?.id

    this.parentRoute = this.options.getParentRoute?.()

    if (isRoot) {
      this._path = rootRouteId as TPath
    } else if (!this.parentRoute) {
      if (process.env.NODE_ENV !== 'production') {
        throw new Error(
          `Invariant failed: Child Route instances must pass a 'getParentRoute: () => ParentRoute' option that returns a Route instance.`,
        )
      }

      invariant()
    }

    let path: undefined | string = isRoot ? rootRouteId : options?.path

    // If the path is anything other than an index path, trim it up
    if (path && path !== '/') {
      path = trimPathLeft(path)
    }

    const customId = options?.id || path

    // Strip the parentId prefix from the first level of children
    const id = isRoot
      ? rootRouteId
      : cleanPath(
          (this.parentRoute.id === rootRouteId ? '' : this.parentRoute.id) +
            '/' +
            (customId ?? ''),
        )

    if (path === rootRouteId) {
      path = '/'
    }

    const fullPath =
      id === rootRouteId
        ? '/'
        : path === undefined
          ? this.parentRoute.fullPath
          : cleanPath(this.parentRoute.fullPath + '/' + path)

    this._path = path as TPath
    this._id = id as TId
    this._fullPath = fullPath as TFullPath
    this._to = trimPathRight(fullPath) as TrimPathRight<TFullPath>
  }

  addChildren: RouteAddChildrenFn<
    TRegister,
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
    TFileRouteTypes,
    TSSR,
    TServerMiddlewares,
    THandlers
  > = (children) => {
    return this._addFileChildren(children) as any
  }

  _addFileChildren: RouteAddFileChildrenFn<
    TRegister,
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
    TFileRouteTypes,
    TSSR,
    TServerMiddlewares,
    THandlers
  > = (children) => {
    if (Array.isArray(children)) {
      this.children = children as TChildren
    }

    if (typeof children === 'object' && children !== null) {
      this.children = Object.values(children) as TChildren
    }

    return this as any
  }

  _addFileTypes: RouteAddFileTypesFn<
    TRegister,
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
    TSSR,
    TServerMiddlewares,
    THandlers
  > = () => {
    return this as any
  }

  updateLoader = <TNewLoaderFn>(options: {
    loader: Constrain<
      TNewLoaderFn,
      RouteLoaderFn<
        TRegister,
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
    return this as unknown as BaseRoute<
      TRegister,
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
      TChildren,
      TFileRouteTypes,
      TSSR,
      TServerMiddlewares,
      THandlers
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

  lazy: RouteLazyFn<
    Route<
      TRegister,
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
      TFileRouteTypes,
      TSSR,
      TServerMiddlewares,
      THandlers
    >
  > = (lazyFn) => {
    this.lazyFn = lazyFn
    return this
  }

  /**
   * Create a redirect with `from` automatically set to this route's fullPath.
   * Enables relative redirects like `Route.redirect({ to: './overview' })`.
   * @param opts Redirect options (same as `redirect()` but without `from`)
   * @returns A redirect Response that can be thrown from loaders/beforeLoad
   * @link https://tanstack.com/router/latest/docs/framework/react/api/router/redirectFunction
   */
  redirect: RedirectFnRoute<TFullPath> = (opts) =>
    redirect({ from: this.fullPath, ...opts } as any)
}

export class BaseRouteApi<TId, TRouter extends AnyRouter = RegisteredRouter> {
  id: TId

  constructor({ id }: { id: TId }) {
    this.id = id
  }

  notFound = (opts?: NotFoundError) => {
    return notFound({ routeId: this.id as string, ...opts })
  }

  /**
   * Create a redirect with `from` automatically set to this route's path.
   * Enables relative redirects like `routeApi.redirect({ to: './overview' })`.
   * @param opts Redirect options (same as `redirect()` but without `from`)
   * @returns A redirect Response that can be thrown from loaders/beforeLoad
   * @link https://tanstack.com/router/latest/docs/framework/react/api/router/redirectFunction
   */
  redirect: RedirectFnRoute<RouteTypesById<TRouter, TId>['fullPath']> = (
    opts,
  ) => redirect({ from: this.id as string, ...opts } as any)
}

export interface RootRoute<
  in out TRegister,
  in out TSearchValidator = undefined,
  in out TRouterContext = {},
  in out TRouteContextFn = AnyContext,
  in out TBeforeLoadFn = AnyContext,
  in out TLoaderDeps extends Record<string, any> = {},
  in out TLoaderFn = undefined,
  in out TChildren = unknown,
  in out TFileRouteTypes = unknown,
  in out TSSR = unknown,
  in out TServerMiddlewares = unknown,
  in out THandlers = undefined,
> extends Route<
  TRegister,
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
  TFileRouteTypes,
  TSSR,
  TServerMiddlewares,
  THandlers
> {}

export class BaseRootRoute<
  in out TRegister = Register,
  in out TSearchValidator = undefined,
  in out TRouterContext = {},
  in out TRouteContextFn = AnyContext,
  in out TBeforeLoadFn = AnyContext,
  in out TLoaderDeps extends Record<string, any> = {},
  in out TLoaderFn = undefined,
  in out TChildren = unknown,
  in out TFileRouteTypes = unknown,
  in out TSSR = unknown,
  in out TServerMiddlewares = unknown,
  in out THandlers = undefined,
> extends BaseRoute<
  TRegister,
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
  TFileRouteTypes,
  TSSR,
  TServerMiddlewares,
  THandlers
> {
  constructor(
    options?: RootRouteOptions<
      TRegister,
      TSearchValidator,
      TRouterContext,
      TRouteContextFn,
      TBeforeLoadFn,
      TLoaderDeps,
      TLoaderFn,
      TSSR,
      TServerMiddlewares,
      THandlers,
      any,
      any,
      any
    >,
  ) {
    super(options as any)
  }
}

//

export interface RouteLike {
  id: string
  isRoot?: boolean
  path?: string
  fullPath: string
  rank?: number
  parentRoute?: RouteLike
  children?: Array<RouteLike>
  options?: {
    caseSensitive?: boolean
  }
}
