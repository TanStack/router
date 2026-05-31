import { invariant } from './invariant'
import { joinPaths, trimPathLeft, trimPathRight } from './path'
import { notFound } from './not-found'
import { redirect } from './redirect'
import { rootRouteId } from './root'
import type { LazyRoute } from './fileRoute'
import type { NotFoundError } from './not-found'
import type { RedirectFnRoute } from './redirect'
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
  SSROption,
} from './router'
import type { BuildLocationFn, NavigateFn } from './RouterProvider'
import type {
  Assign,
  Awaitable,
  Constrain,
  Expand,
  IntersectAssign,
  IsAny,
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
  ValidateSerializableInput,
  ValidateSerializableLifecycleResult,
} from './ssr/serializer/transformer'
import type { DefaultDehydrateConfig } from './lifecycle'

// ---------------------------------------------------------------------------
// Type-level dehydrate resolution helpers
// ---------------------------------------------------------------------------

/**
 * Read `defaultDehydrate` from the registered config (via TRegister).
 * Returns `unknown` if no config registered.
 */
type RegisteredDefaultDehydrate<TRegister> = RegisteredConfigType<
  TRegister,
  'defaultDehydrate'
>

/**
 * Resolve the registered default dehydrate flag for a specific method.
 * Falls back to TBuiltin if the registered config doesn't specify the method.
 */
type MethodDefaultDehydrate<
  TRegister,
  TMethod extends keyof DefaultDehydrateConfig,
  TBuiltin extends boolean,
> =
  unknown extends RegisteredDefaultDehydrate<TRegister>
    ? TBuiltin
    : RegisteredDefaultDehydrate<TRegister> extends DefaultDehydrateConfig
      ? undefined extends RegisteredDefaultDehydrate<TRegister>[TMethod]
        ? TBuiltin
        : NonNullable<RegisteredDefaultDehydrate<TRegister>[TMethod]>
      : TBuiltin

/**
 * Conditionally apply serialization validation based on the effective dehydrate flag.
 * When dehydrate is true, validates that the handler return type is serializable.
 * When dehydrate is false, allows any return type.
 */
type ValidateIfSerializable<
  TRegister,
  TParentRoute extends AnyRoute,
  TSSR,
  TFn,
  TDehydrate,
> = TDehydrate extends true
  ? ValidateSerializableLifecycleResult<TRegister, TParentRoute, TSSR, TFn>
  : unknown

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

export type ParamsOptions<in out TPath extends string, in out TParams> = {
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

  /** 
  @deprecated Use params.parse instead
  */
  parseParams?: ParseParamsFn<TPath, TParams> &
    ValidateParsedParams<TPath, TParams>

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

type ResolveLifecycleHandler<TOption> = TOption extends {
  handler: infer THandler
}
  ? THandler
  : TOption

export type ContextReturnType<TContextFn> = IsAny<
  TContextFn,
  AnyContext,
  unknown extends TContextFn
    ? AnyContext
    : ResolveLifecycleHandler<TContextFn> extends (...args: Array<any>) => any
      ? LooseReturnType<ResolveLifecycleHandler<TContextFn>> extends never
        ? AnyContext
        : LooseReturnType<ResolveLifecycleHandler<TContextFn>>
      : [ResolveLifecycleHandler<TContextFn>] extends [never]
        ? AnyContext
        : [ResolveLifecycleHandler<TContextFn>] extends [undefined]
          ? AnyContext
          : ResolveLifecycleHandler<TContextFn>
>

export type ContextAsyncReturnType<TContextFn> = IsAny<
  TContextFn,
  AnyContext,
  unknown extends TContextFn
    ? AnyContext
    : ResolveLifecycleHandler<TContextFn> extends (...args: Array<any>) => any
      ? LooseReturnType<ResolveLifecycleHandler<TContextFn>> extends Promise<
          infer TReturn
        >
        ? TReturn extends never
          ? AnyContext
          : TReturn
        : LooseReturnType<ResolveLifecycleHandler<TContextFn>> extends never
          ? AnyContext
          : LooseReturnType<ResolveLifecycleHandler<TContextFn>>
      : [Awaited<ResolveLifecycleHandler<TContextFn>>] extends [never]
        ? AnyContext
        : [Awaited<ResolveLifecycleHandler<TContextFn>>] extends [undefined]
          ? AnyContext
          : Awaited<ResolveLifecycleHandler<TContextFn>>
>

export type ResolveRouteContext<TContextFn, TBeforeLoadFn> = Assign<
  ContextReturnType<TContextFn>,
  ContextAsyncReturnType<TBeforeLoadFn>
>

export type ResolveLoaderData<TLoaderFn> = IsAny<
  TLoaderFn,
  any,
  unknown extends TLoaderFn
    ? TLoaderFn
    : ResolveLifecycleHandler<TLoaderFn> extends (...args: Array<any>) => any
      ? LooseReturnType<ResolveLifecycleHandler<TLoaderFn>> extends Promise<
          infer TReturn
        >
        ? TReturn extends never
          ? undefined
          : TReturn
        : LooseReturnType<ResolveLifecycleHandler<TLoaderFn>> extends never
          ? undefined
          : LooseReturnType<ResolveLifecycleHandler<TLoaderFn>>
      : [Awaited<ResolveLifecycleHandler<TLoaderFn>>] extends [never]
        ? undefined
        : Awaited<ResolveLifecycleHandler<TLoaderFn>>
>

export type ResolveRouteLoaderFn<TLoaderFn> = TLoaderFn extends {
  handler: infer THandler
}
  ? THandler
  : TLoaderFn

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
  TContextFn,
> = Assign<
  RouteContextParameter<TParentRoute, TRouterContext>,
  ContextReturnType<TContextFn>
>

export type ResolveAllContext<
  TParentRoute extends AnyRoute,
  TRouterContext,
  TContextFn,
  TBeforeLoadFn,
> = Assign<
  BeforeLoadContextParameter<TParentRoute, TRouterContext, TContextFn>,
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
  in out TContextFn,
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
  routeContext: ResolveRouteContext<TContextFn, TBeforeLoadFn>
  contextFn: TContextFn
  beforeLoadFn: TBeforeLoadFn
  allContext: ResolveAllContext<
    TParentRoute,
    TRouterContext,
    TContextFn,
    TBeforeLoadFn
  >
  children: TChildren
  loaderData: ResolveLoaderData<TLoaderFn>
  loaderDeps: TLoaderDeps
  fileRouteTypes: TFileRouteTypes
  ssr: ResolveSSR<TSSR>
  allSsr: ResolveAllSSR<TParentRoute, TSSR>
}

export type ResolveSSR<TSSR> = TSSR extends (...args: ReadonlyArray<any>) => any
  ? LooseReturnType<TSSR>
  : TSSR

export type ResolveAllSSR<
  TParentRoute extends AnyRoute,
  TSSR,
> = unknown extends TParentRoute
  ? ResolveSSR<TSSR>
  : unknown extends TSSR
    ? TParentRoute['types']['allSsr']
    : ResolveSSR<TSSR>

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
  in out TContextFn,
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
  TContextFn,
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
  in out TContextFn,
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
  TContextFn,
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
  TContextFn,
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
  TContextFn,
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
  in out TContextFn,
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
    TContextFn,
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
    TContextFn,
    TBeforeLoadFn,
    TSSR,
    TServerMiddlewares,
    THandlers
  >
  isRoot: TParentRoute extends AnyRoute ? true : false
  /** @internal */
  _componentsPromise?: Promise<void>
  /** @internal */
  _componentsLoaded?: boolean
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
        TContextFn,
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
  _lazyPromise?: Promise<void>
  /** @internal */
  _lazyLoaded?: boolean
  rank: number
  to: TrimPathRight<TFullPath>
  init: (opts: { originalIndex: number }) => void
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
      TContextFn,
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
      TContextFn,
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
    TContextFn,
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
    TContextFn,
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
    TContextFn,
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

export type AnyRoute = Omit<
  Route<
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
  >,
  | 'options'
  | 'types'
  | 'lazyFn'
  | 'addChildren'
  | '_addFileChildren'
  | '_addFileTypes'
  | 'updateLoader'
  | 'update'
  | 'lazy'
> & {
  options: any
  types: any
  lazyFn?: any
  addChildren?: any
  _addFileChildren?: any
  _addFileTypes?: any
  updateLoader?: any
  update?: any
  lazy?: any
}

export type AnyRouteWithContext<TContext> = AnyRoute & {
  types: { allContext: TContext }
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
  TContextFn = AnyContext,
  TBeforeLoadFn = AnyContext,
  TSSR = unknown,
  TServerMiddlewares = unknown,
  THandlers = undefined,
  TContextDehydrateFn = DefaultLifecycleDehydrateFn<TContextFn>,
  TBeforeLoadDehydrateFn = DefaultLifecycleDehydrateFn<TBeforeLoadFn>,
  TLoaderDehydrateFn = DefaultLifecycleDehydrateFn<TLoaderFn>,
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
  TContextFn,
  TBeforeLoadFn,
  TSSR,
  TServerMiddlewares,
  THandlers,
  TContextDehydrateFn,
  TBeforeLoadDehydrateFn,
  TLoaderDehydrateFn
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
    NoInfer<TContextFn>,
    NoInfer<TBeforeLoadFn>
  >

export type ContextFn<
  in out TParentRoute extends AnyRoute,
  in out TParams,
  in out TRouterContext,
  in out TRouteId,
  in out TLoaderDeps,
> = (
  ctx: ContextFnOptions<
    TParentRoute,
    TParams,
    TRouterContext,
    TRouteId,
    TLoaderDeps
  >,
) => any

type ContextRevalidateFn<
  TParentRoute extends AnyRoute,
  TParams,
  TRouterContext,
  TId extends string,
  TLoaderDeps extends Record<string, any>,
  TContextData,
> = (
  ctx: Omit<
    ContextFnOptions<TParentRoute, TParams, TRouterContext, TId, TLoaderDeps>,
    'matches'
  > & {
    matches: Array<AnyRouteMatch>
    prev: NoInfer<TContextData> | undefined
  },
) => Awaitable<NoInfer<TContextData>>

type LifecycleReturn<TOption> =
  ResolveLifecycleHandler<TOption> extends (
    ...args: Array<any>
  ) => infer TReturn
    ? TReturn
    : ResolveLifecycleHandler<TOption>

type LifecycleValue<TValue, TFallback> = IsAny<
  TValue,
  any,
  [Awaited<LifecycleReturn<TValue>>] extends [never]
    ? TFallback
    : [Awaited<LifecycleReturn<TValue>>] extends [undefined]
      ? TFallback
      : Awaited<LifecycleReturn<TValue>>
>

type LifecycleWire<TDehydrateFn> = TDehydrateFn extends (
  ...args: Array<any>
) => infer TWire
  ? TWire
  : unknown

type DehydrateLifecycleInput<TData> = [Awaited<TData>] extends [never]
  ? unknown
  : [Exclude<Awaited<TData>, undefined>] extends [never]
    ? NoInfer<Awaited<TData>>
    : NoInfer<Exclude<Awaited<TData>, undefined>>

type LifecycleDehydrateFn<TData> = (ctx: {
  data: DehydrateLifecycleInput<TData>
}) => unknown

export type DefaultLifecycleDehydrateFn<TData> = unknown

type SerializableDehydrateFn<TRegister, TData, TWire> = (ctx: {
  data: DehydrateLifecycleInput<TData>
}) => Constrain<TWire, ValidateSerializableInput<TRegister, TWire>>

type LifecycleRevalidateOption<
  TParentRoute extends AnyRoute,
  TParams,
  TRouterContext,
  TId extends string,
  TLoaderDeps extends Record<string, any>,
  TContextData,
> =
  | boolean
  | ContextRevalidateFn<
      TParentRoute,
      TParams,
      TRouterContext,
      TId,
      TLoaderDeps,
      LifecycleValue<NoInfer<TContextData>, AnyContext>
    >

type ContextHandler<
  TRegister,
  TParentRoute extends AnyRoute,
  TParams,
  TRouterContext,
  TId extends string,
  TLoaderDeps extends Record<string, any>,
  TContextData,
  TSSR,
  TDehydrate,
> = (
  ctx: ContextFnOptions<
    TParentRoute,
    TParams,
    TRouterContext,
    TId,
    NoInfer<TLoaderDeps>
  >,
) => TContextData &
  ValidateIfSerializable<
    TRegister,
    TParentRoute,
    TSSR,
    TContextData,
    TDehydrate
  >

type LifecycleHandler<
  TRegister,
  TParentRoute extends AnyRoute,
  TContext,
  TLifecycleData,
  TSSR,
  TDehydrate,
> = (
  ctx: TContext,
) => TLifecycleData &
  ValidateIfSerializable<
    TRegister,
    TParentRoute,
    TSSR,
    TLifecycleData,
    TDehydrate
  >

export type ContextLifecycleOption<
  TRegister,
  TParentRoute extends AnyRoute,
  TParams,
  TRouterContext,
  TId extends string,
  TLoaderDeps extends Record<string, any>,
  TContextFn,
  TContextDehydrateFn,
  TSSR,
> =
  | ContextHandler<
      TRegister,
      TParentRoute,
      TParams,
      TRouterContext,
      TId,
      TLoaderDeps,
      TContextFn,
      TSSR,
      MethodDefaultDehydrate<TRegister, 'context', false>
    >
  | {
      handler: ContextHandler<
        TRegister,
        TParentRoute,
        TParams,
        TRouterContext,
        TId,
        TLoaderDeps,
        TContextFn,
        TSSR,
        MethodDefaultDehydrate<TRegister, 'context', false>
      >
      revalidate?: LifecycleRevalidateOption<
        TParentRoute,
        TParams,
        TRouterContext,
        TId,
        TLoaderDeps,
        NoInfer<TContextFn>
      >
      dehydrate?: undefined
      hydrate?: undefined
    }
  | {
      handler: ContextHandler<
        TRegister,
        TParentRoute,
        TParams,
        TRouterContext,
        TId,
        TLoaderDeps,
        TContextFn,
        TSSR,
        true
      >
      revalidate?: LifecycleRevalidateOption<
        TParentRoute,
        TParams,
        TRouterContext,
        TId,
        TLoaderDeps,
        NoInfer<TContextFn>
      >
      dehydrate: true
      hydrate?: undefined
    }
  | {
      handler: ContextHandler<
        TRegister,
        TParentRoute,
        TParams,
        TRouterContext,
        TId,
        TLoaderDeps,
        TContextFn,
        TSSR,
        false
      >
      revalidate?: LifecycleRevalidateOption<
        TParentRoute,
        TParams,
        TRouterContext,
        TId,
        TLoaderDeps,
        NoInfer<TContextFn>
      >
      dehydrate: false
      hydrate?: undefined
    }
  | {
      handler: (
        ctx: ContextFnOptions<
          TParentRoute,
          TParams,
          TRouterContext,
          TId,
          NoInfer<TLoaderDeps>
        >,
      ) => TContextFn
      revalidate?: LifecycleRevalidateOption<
        TParentRoute,
        TParams,
        TRouterContext,
        TId,
        TLoaderDeps,
        NoInfer<TContextFn>
      >
      dehydrate: SerializableDehydrateFn<
        TRegister,
        TContextFn,
        TContextDehydrateFn
      >
      hydrate: (ctx: {
        data: NoInfer<TContextDehydrateFn>
      }) => NoInfer<LifecycleValue<TContextFn, AnyContext>>
    }

type LifecycleOption<
  TRegister,
  TParentRoute extends AnyRoute,
  TContext,
  TLifecycleFn,
  TLifecycleDehydrateFn,
  TSSR,
  TMethod extends keyof DefaultDehydrateConfig,
  TExtra extends object = {},
> =
  | LifecycleHandler<
      TRegister,
      TParentRoute,
      TContext,
      TLifecycleFn,
      TSSR,
      MethodDefaultDehydrate<TRegister, TMethod, true>
    >
  | ({
      handler: LifecycleHandler<
        TRegister,
        TParentRoute,
        TContext,
        TLifecycleFn,
        TSSR,
        MethodDefaultDehydrate<TRegister, TMethod, true>
      >
      dehydrate?: undefined
      hydrate?: undefined
    } & TExtra)
  | ({
      handler: LifecycleHandler<
        TRegister,
        TParentRoute,
        TContext,
        TLifecycleFn,
        TSSR,
        true
      >
      dehydrate: true
      hydrate?: undefined
    } & TExtra)
  | ({
      handler: LifecycleHandler<
        TRegister,
        TParentRoute,
        TContext,
        TLifecycleFn,
        TSSR,
        false
      >
      dehydrate: false
      hydrate?: undefined
    } & TExtra)
  | ({
      handler: (ctx: TContext) => TLifecycleFn
      dehydrate: SerializableDehydrateFn<
        TRegister,
        TLifecycleFn,
        TLifecycleDehydrateFn
      >
      hydrate: (ctx: {
        data: NoInfer<TLifecycleDehydrateFn>
      }) => NoInfer<LifecycleValue<TLifecycleFn, undefined>>
    } & TExtra)

export type BeforeLoadLifecycleOption<
  TRegister,
  TParentRoute extends AnyRoute,
  TSearchValidator,
  TParams,
  TRouterContext,
  TContextFn,
  TId extends string,
  TServerMiddlewares,
  THandlers,
  TBeforeLoadFn,
  TBeforeLoadDehydrateFn,
  TSSR,
> = LifecycleOption<
  TRegister,
  TParentRoute,
  BeforeLoadContextOptions<
    TRegister,
    TParentRoute,
    TSearchValidator,
    TParams,
    TRouterContext,
    TContextFn,
    TId,
    TServerMiddlewares,
    THandlers
  >,
  TBeforeLoadFn,
  TBeforeLoadDehydrateFn,
  TSSR,
  'beforeLoad'
>

export type LoaderLifecycleOption<
  TRegister,
  TParentRoute extends AnyRoute,
  TId extends string,
  TParams,
  TLoaderDeps extends Record<string, any>,
  TRouterContext,
  TContextFn,
  TBeforeLoadFn,
  TServerMiddlewares,
  THandlers,
  TLoaderFn,
  TLoaderDehydrateFn,
  TSSR,
> = LifecycleOption<
  TRegister,
  TParentRoute,
  LoaderFnContext<
    TRegister,
    TParentRoute,
    TId,
    TParams,
    NoInfer<TLoaderDeps>,
    TRouterContext,
    TContextFn,
    TBeforeLoadFn,
    TServerMiddlewares,
    THandlers
  >,
  TLoaderFn,
  TLoaderDehydrateFn,
  TSSR,
  'loader',
  { staleReloadMode?: LoaderStaleReloadMode }
>

export type ContextObjectWithDehydrateInput<
  TParentRoute extends AnyRoute,
  TParams,
  TRouterContext,
  TId extends string,
  TLoaderDeps extends Record<string, any>,
  TContextFn,
> = {
  handler: (
    ctx: ContextFnOptions<
      TParentRoute,
      TParams,
      TRouterContext,
      TId,
      NoInfer<TLoaderDeps>
    >,
  ) => TContextFn
  revalidate?:
    | boolean
    | ContextRevalidateFn<
        TParentRoute,
        TParams,
        TRouterContext,
        TId,
        TLoaderDeps,
        NoInfer<TContextFn>
      >
  dehydrate: LifecycleDehydrateFn<TContextFn>
  hydrate: (ctx: {
    data: NoInfer<LifecycleWire<LifecycleDehydrateFn<TContextFn>>>
  }) => NoInfer<LifecycleValue<TContextFn, AnyContext>>
}

export type LifecycleObjectWithDehydrateInput<TData, TContext> = {
  handler: (ctx: TContext) => TData
  dehydrate: LifecycleDehydrateFn<TData>
  hydrate: (ctx: {
    data: NoInfer<LifecycleWire<LifecycleDehydrateFn<TData>>>
  }) => NoInfer<LifecycleValue<TData, undefined>>
}

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
  TContextFn = AnyContext,
  TBeforeLoadFn = AnyContext,
  TRemountDepsFn = AnyContext,
  TSSR = unknown,
  TServerMiddlewares = unknown,
  THandlers = undefined,
  TContextDehydrateFn = DefaultLifecycleDehydrateFn<TContextFn>,
  TBeforeLoadDehydrateFn = DefaultLifecycleDehydrateFn<TBeforeLoadFn>,
  TLoaderDehydrateFn = DefaultLifecycleDehydrateFn<TLoaderFn>,
> = ParamsOptions<TPath, TParams> &
  FilebaseRouteOptionsInterface<
    TRegister,
    TParentRoute,
    TId,
    TPath,
    TSearchValidator,
    TParams,
    TLoaderDeps,
    TLoaderFn,
    TRouterContext,
    TContextFn,
    TBeforeLoadFn,
    TRemountDepsFn,
    TSSR,
    TServerMiddlewares,
    THandlers,
    TContextDehydrateFn,
    TBeforeLoadDehydrateFn,
    TLoaderDehydrateFn
  >

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
  TContextFn = AnyContext,
  TBeforeLoadFn = AnyContext,
  TRemountDepsFn = AnyContext,
  TSSR = unknown,
  TServerMiddlewares = unknown,
  THandlers = undefined,
  TContextDehydrateFn = DefaultLifecycleDehydrateFn<TContextFn>,
  TBeforeLoadDehydrateFn = DefaultLifecycleDehydrateFn<TBeforeLoadFn>,
  TLoaderDehydrateFn = DefaultLifecycleDehydrateFn<TLoaderFn>,
> {
  validateSearch?: Constrain<TSearchValidator, AnyValidator, DefaultValidator>

  shouldReload?:
    | boolean
    | ((
        match: LoaderFnContext<
          TRegister,
          TParentRoute,
          TId,
          TParams,
          NoInfer<TLoaderDeps>,
          TRouterContext,
          TContextFn,
          TBeforeLoadFn,
          TServerMiddlewares,
          THandlers
        >,
      ) => any)

  context?: ContextLifecycleOption<
    TRegister,
    TParentRoute,
    TParams,
    TRouterContext,
    TId,
    TLoaderDeps,
    TContextFn,
    TContextDehydrateFn,
    TSSR
  >

  ssr?: Constrain<
    TSSR,
    | undefined
    | SSROption
    | ((
        ctx: SsrContextOptions<TParentRoute, TSearchValidator, TParams>,
      ) => Awaitable<undefined | SSROption>)
  >

  // This async function is called before a route is loaded.
  // If an error is thrown here, the route's loader will not be called.
  // If thrown during a navigation, the navigation will be cancelled and the error will be passed to the `onError` function.
  // If thrown during a preload event, the error will be logged to the console.
  beforeLoad?: BeforeLoadLifecycleOption<
    TRegister,
    TParentRoute,
    TSearchValidator,
    TParams,
    TRouterContext,
    TContextFn,
    TId,
    TServerMiddlewares,
    THandlers,
    TBeforeLoadFn,
    TBeforeLoadDehydrateFn,
    TSSR
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
        NoInfer<TLoaderDeps>
      >,
    ) => any
  >

  loader?: LoaderLifecycleOption<
    TRegister,
    TParentRoute,
    TId,
    TParams,
    TLoaderDeps,
    TRouterContext,
    TContextFn,
    TBeforeLoadFn,
    TServerMiddlewares,
    THandlers,
    TLoaderFn,
    TLoaderDehydrateFn,
    TSSR
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
  TContextFn = AnyContext,
  TBeforeLoadFn = AnyContext,
  TSSR = unknown,
  TServerMiddlewares = unknown,
  THandlers = undefined,
  TContextDehydrateFn = DefaultLifecycleDehydrateFn<TContextFn>,
  TBeforeLoadDehydrateFn = DefaultLifecycleDehydrateFn<TBeforeLoadFn>,
  TLoaderDehydrateFn = DefaultLifecycleDehydrateFn<TLoaderFn>,
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
    TContextFn,
    TBeforeLoadFn,
    AnyContext,
    TSSR,
    TServerMiddlewares,
    THandlers,
    TContextDehydrateFn,
    TBeforeLoadDehydrateFn,
    TLoaderDehydrateFn
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

export interface RouteContextOptions<
  in out TParentRoute extends AnyRoute,
  in out TParams,
  in out TRouterContext,
  in out TRouteId,
  in out TLoaderDeps,
> extends ContextOptions<TParentRoute, TParams, TRouteId> {
  context: Expand<RouteContextParameter<TParentRoute, TRouterContext>>
  deps: TLoaderDeps
}

export interface ContextFnOptions<
  in out TParentRoute extends AnyRoute,
  in out TParams,
  in out TRouterContext,
  in out TRouteId,
  in out TLoaderDeps,
> extends ContextOptions<TParentRoute, TParams, TRouteId> {
  context: Expand<RouteContextParameter<TParentRoute, TRouterContext>>
  deps: TLoaderDeps
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
  in out TContextFn,
  in out TRouteId,
  in out TServerMiddlewares,
  in out THandlers,
>
  extends
    ContextOptions<TParentRoute, TParams, TRouteId>,
    FullSearchSchemaOption<TParentRoute, TSearchValidator> {
  context: Expand<
    BeforeLoadContextParameter<TParentRoute, TRouterContext, TContextFn>
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
  in out TContextFn,
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
      ResolveLoaderData<TLoaderFn>,
      ResolveAllContext<
        TParentRoute,
        TRouterContext,
        TContextFn,
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
    ResolveAllContext<TParentRoute, TRouterContext, TContextFn, TBeforeLoadFn>,
    TLoaderDeps
  >
  params: ResolveAllParamsFromParent<TParentRoute, TParams>
  loaderData?: ResolveLoaderData<TLoaderFn>
}

export interface DefaultUpdatableRouteOptionsExtensions {
  component?: unknown
  errorComponent?: unknown
  notFoundComponent?: unknown
  pendingComponent?: unknown
}

export interface UpdatableRouteOptionsExtensions extends DefaultUpdatableRouteOptionsExtensions {}

export interface UpdatableRouteOptions<
  in out TParentRoute extends AnyRoute,
  in out TRouteId,
  in out TFullPath,
  in out TParams,
  in out TSearchValidator,
  in out TLoaderFn,
  in out TLoaderDeps,
  in out TRouterContext,
  in out TContextFn,
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
        TContextFn,
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
        TContextFn,
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
        TContextFn,
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
      TContextFn,
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
      TContextFn,
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
      TContextFn,
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
  in out TContextFn = AnyContext,
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
    TContextFn,
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
  in out TContextFn = AnyContext,
  in out TBeforeLoadFn = AnyContext,
  in out TServerMiddlewares = unknown,
  in out THandlers = undefined,
> {
  abortController: AbortController
  preload: boolean
  params: Expand<ResolveAllParamsFromParent<TParentRoute, TParams>>
  deps: TLoaderDeps
  context: Expand<
    ResolveAllContext<TParentRoute, TRouterContext, TContextFn, TBeforeLoadFn>
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
  TContextFn = AnyContext,
  TBeforeLoadFn = AnyContext,
  TLoaderDeps extends Record<string, any> = {},
  TLoaderFn = undefined,
  TSSR = unknown,
  TServerMiddlewares = unknown,
  THandlers = undefined,
  TContextDehydrateFn = DefaultLifecycleDehydrateFn<TContextFn>,
  TBeforeLoadDehydrateFn = DefaultLifecycleDehydrateFn<TBeforeLoadFn>,
  TLoaderDehydrateFn = DefaultLifecycleDehydrateFn<TLoaderFn>,
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
        TContextFn,
        TBeforeLoadFn,
        TSSR,
        TServerMiddlewares,
        THandlers,
        TContextDehydrateFn,
        TBeforeLoadDehydrateFn,
        TLoaderDehydrateFn
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

export type ErrorComponentProps<TError = Error> = {
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
  in out TContextFn = AnyContext,
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
    TContextFn,
    TBeforeLoadFn,
    TSSR,
    TServerMiddlewares,
    THandlers
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
        TContextFn,
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
  _lazyPromise?: Promise<void>
  /** @internal */
  _componentsPromise?: Promise<void>

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
      TContextFn,
      TBeforeLoadFn,
      TSSR,
      TServerMiddlewares,
      THandlers
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
    TContextFn,
    TBeforeLoadFn,
    TLoaderDeps,
    TLoaderFn,
    TChildren,
    TFileRouteTypes,
    TSSR,
    TServerMiddlewares,
    THandlers
  >

  init = (opts: { originalIndex: number }): void => {
    this.originalIndex = opts.originalIndex

    const options = this.options as RouteOptions<
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
      TContextFn,
      TBeforeLoadFn,
      TSSR,
      TServerMiddlewares,
      THandlers
    > &
      RoutePathOptionsIntersection<TCustomId, TPath>

    const isRoot = !options.path && !options.id

    const parentRoute = (this.options as any).getParentRoute?.()
    this.parentRoute = parentRoute

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

    let path: undefined | string = isRoot ? rootRouteId : options.path

    // If the path is anything other than an index path, trim it up
    if (path && path !== '/') {
      path = trimPathLeft(path)
    }

    const customId = options.id || path

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
    TContextFn,
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
    TContextFn,
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
    TContextFn,
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
        TContextFn,
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
      TContextFn,
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
      TContextFn,
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
      TContextFn,
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
  in out TContextFn = AnyContext,
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
  TContextFn,
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
  in out TContextFn = AnyContext,
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
  TContextFn,
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
      TContextFn,
      TBeforeLoadFn,
      TLoaderDeps,
      TLoaderFn,
      TSSR,
      TServerMiddlewares,
      THandlers
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
