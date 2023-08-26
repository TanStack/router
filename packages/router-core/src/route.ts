import { ParsePathParams } from './link'
import { AnyRouter, Router, RouteMatch, RegisteredRouter } from './router'
import { IsAny, NoInfer, PickRequired, UnionToIntersection } from './utils'
import invariant from 'tiny-invariant'
import { joinPaths, trimPath } from './path'

export const rootRouteId = '__root__' as const
export type RootRouteId = typeof rootRouteId
export type AnyPathParams = {}
export type AnySearchSchema = {}
export type AnyContext = {}
export interface RouteMeta {}
export interface RouteContext {}
export interface RegisterRouteComponent<
  TLoader = unknown,
  TFullSearchSchema extends AnySearchSchema = AnySearchSchema,
  TAllParams extends AnyPathParams = AnyPathParams,
  TRouteContext extends AnyContext = AnyContext,
  TAllContext extends AnyContext = AnyContext,
> {
  // RouteComponent: unknown // This is registered by the framework
}
export interface RegisterErrorRouteComponent<
  TFullSearchSchema extends AnySearchSchema = AnySearchSchema,
  TAllParams extends AnyPathParams = AnyPathParams,
  TRouteContext extends AnyContext = AnyContext,
  TAllContext extends AnyContext = AnyContext,
> {
  // ErrorRouteComponent: unknown // This is registered by the framework
}
export interface RegisterPendingRouteComponent<
  TFullSearchSchema extends AnySearchSchema = AnySearchSchema,
  TAllParams extends AnyPathParams = AnyPathParams,
  TRouteContext extends AnyContext = AnyContext,
  TAllContext extends AnyContext = AnyContext,
> {
  // PendingRouteComponent: unknown // This is registered by the framework
}
export interface RegisterRouteProps<
  TLoader = unknown,
  TFullSearchSchema extends AnySearchSchema = AnySearchSchema,
  TAllParams extends AnyPathParams = AnyPathParams,
  TRouteContext extends AnyContext = AnyContext,
  TAllContext extends AnyContext = AnyContext,
> {
  // RouteProps: unknown // This is registered by the framework
}
export interface RegisterErrorRouteProps<
  TFullSearchSchema extends AnySearchSchema = AnySearchSchema,
  TAllParams extends AnyPathParams = AnyPathParams,
  TRouteContext extends AnyContext = AnyContext,
  TAllContext extends AnyContext = AnyContext,
> {
  // ErrorRouteProps: unknown // This is registered by the framework
}

export interface RegisterPendingRouteProps<
  TFullSearchSchema extends AnySearchSchema = AnySearchSchema,
  TAllParams extends AnyPathParams = AnyPathParams,
  TRouteContext extends AnyContext = AnyContext,
  TAllContext extends AnyContext = AnyContext,
> {
  // PendingRouteProps: unknown // This is registered by the framework
}

export type RegisteredRouteComponent<
  TLoader = unknown,
  TFullSearchSchema extends AnySearchSchema = AnySearchSchema,
  TAllParams extends AnyPathParams = AnyPathParams,
  TRouteContext extends AnyContext = AnyContext,
  TAllContext extends AnyContext = AnyContext,
> = RegisterRouteComponent<
  TLoader,
  TFullSearchSchema,
  TAllParams,
  TRouteContext,
  TAllContext
> extends {
  RouteComponent: infer T
}
  ? T
  : () => unknown

export type RegisteredErrorRouteComponent<
  TFullSearchSchema extends AnySearchSchema = AnySearchSchema,
  TAllParams extends AnyPathParams = AnyPathParams,
  TRouteContext extends AnyContext = AnyContext,
  TAllContext extends AnyContext = AnyContext,
> = RegisterErrorRouteComponent<
  TFullSearchSchema,
  TAllParams,
  TRouteContext,
  TAllContext
> extends {
  ErrorRouteComponent: infer T
}
  ? T
  : () => unknown

export type RegisteredPendingRouteComponent<
  TFullSearchSchema extends AnySearchSchema = AnySearchSchema,
  TAllParams extends AnyPathParams = AnyPathParams,
  TRouteContext extends AnyContext = AnyContext,
  TAllContext extends AnyContext = AnyContext,
> = RegisterPendingRouteComponent<
  TFullSearchSchema,
  TAllParams,
  TRouteContext,
  TAllContext
> extends {
  PendingRouteComponent: infer T
}
  ? T
  : () => unknown

export type RegisteredRouteProps<
  TLoader = unknown,
  TFullSearchSchema extends AnySearchSchema = AnySearchSchema,
  TAllParams extends AnyPathParams = AnyPathParams,
  TRouteContext extends AnyContext = AnyContext,
  TAllContext extends AnyContext = AnyContext,
> = RegisterRouteProps<
  TLoader,
  TFullSearchSchema,
  TAllParams,
  TRouteContext,
  TAllContext
> extends {
  RouteProps: infer T
}
  ? T
  : {}

export type RegisteredErrorRouteProps<
  TFullSearchSchema extends AnySearchSchema = AnySearchSchema,
  TAllParams extends AnyPathParams = AnyPathParams,
  TRouteContext extends AnyContext = AnyContext,
  TAllContext extends AnyContext = AnyContext,
> = RegisterRouteProps<
  TFullSearchSchema,
  TAllParams,
  TRouteContext,
  TAllContext
> extends {
  ErrorRouteProps: infer T
}
  ? T
  : {}

export type RegisteredPendingRouteProps<
  TFullSearchSchema extends AnySearchSchema = AnySearchSchema,
  TAllParams extends AnyPathParams = AnyPathParams,
  TRouteContext extends AnyContext = AnyContext,
  TAllContext extends AnyContext = AnyContext,
> = RegisterRouteProps<
  TFullSearchSchema,
  TAllParams,
  TRouteContext,
  TAllContext
> extends {
  PendingRouteProps: infer T
}
  ? T
  : {}

export type PreloadableObj = { preload?: () => Promise<void> }

export type RoutePathOptions<TCustomId, TPath> =
  | {
      path: TPath
    }
  | {
      id: TCustomId
    }

export type RoutePathOptionsIntersection<TCustomId, TPath> =
  UnionToIntersection<RoutePathOptions<TCustomId, TPath>>

export type MetaOptions = keyof PickRequired<RouteMeta> extends never
  ? {
      meta?: RouteMeta
    }
  : {
      meta: RouteMeta
    }

export type AnyRouteProps = RegisteredRouteProps<any, any, any, any, any>
export type ComponentPropsFromRoute<TRoute> = TRoute extends Route<
  infer TParentRoute,
  infer TPath,
  infer TFullPath,
  infer TCustomId,
  infer TId,
  infer TLoader,
  infer TSearchSchema,
  infer TFullSearchSchema,
  infer TParams,
  infer TAllParams,
  infer TParentContext,
  infer TAllParentContext,
  infer TRouteContext,
  infer TContext,
  infer TRouterContext,
  infer TChildren,
  infer TRouteTree
>
  ? RegisteredRouteProps<
      TLoader,
      TFullSearchSchema,
      TAllParams,
      TRouteContext,
      TContext
    >
  : never

export type ComponentFromRoute<TRoute> = RegisteredRouteComponent<
  ComponentPropsFromRoute<TRoute>
>

export type RouteLoaderFromRoute<TRoute extends AnyRoute> = LoaderFn<
  TRoute['types']['loader'],
  TRoute['types']['searchSchema'],
  TRoute['types']['fullSearchSchema'],
  TRoute['types']['allParams'],
  TRoute['types']['routeContext'],
  TRoute['types']['context']
>

export type RouteOptions<
  TParentRoute extends AnyRoute = AnyRoute,
  TCustomId extends string = string,
  TPath extends string = string,
  TLoader = unknown,
  TParentSearchSchema extends AnySearchSchema = {},
  TSearchSchema extends AnySearchSchema = {},
  TFullSearchSchema extends AnySearchSchema = TSearchSchema,
  TParams extends AnyPathParams = AnyPathParams,
  TAllParams extends AnyPathParams = TParams,
  TParentContext extends AnyContext = AnyContext,
  TAllParentContext extends AnyContext = AnyContext,
  TRouteContext extends RouteContext = RouteContext,
  TAllContext extends AnyContext = AnyContext,
> = BaseRouteOptions<
  TParentRoute,
  TCustomId,
  TPath,
  TLoader,
  TParentSearchSchema,
  TSearchSchema,
  TFullSearchSchema,
  TParams,
  TAllParams,
  TParentContext,
  TAllParentContext,
  TRouteContext,
  TAllContext
> &
  UpdatableRouteOptions<
    TLoader,
    TSearchSchema,
    TFullSearchSchema,
    TAllParams,
    TRouteContext,
    TAllContext
  >

export type ParamsFallback<
  TPath extends string,
  TParams,
> = unknown extends TParams ? Record<ParsePathParams<TPath>, string> : TParams

type Prefix<T extends string, U extends string> = U extends `${T}${infer _}`
  ? U
  : never

export type BaseRouteOptions<
  TParentRoute extends AnyRoute = AnyRoute,
  TCustomId extends string = string,
  TPath extends string = string,
  TLoader = unknown,
  TParentSearchSchema extends AnySearchSchema = {},
  TSearchSchema extends AnySearchSchema = {},
  TFullSearchSchema extends AnySearchSchema = TSearchSchema,
  TParams extends AnyPathParams = {},
  TAllParams = ParamsFallback<TPath, TParams>,
  TParentContext extends AnyContext = AnyContext,
  TAllParentContext extends AnyContext = AnyContext,
  TRouteContext extends RouteContext = RouteContext,
  TAllContext extends AnyContext = AnyContext,
> = RoutePathOptions<TCustomId, TPath> & {
  layoutLimit?: string
  getParentRoute: () => TParentRoute
  validateSearch?: SearchSchemaValidator<TSearchSchema>
  loader?: LoaderFn<
    TLoader,
    TSearchSchema,
    TFullSearchSchema,
    TAllParams,
    NoInfer<TRouteContext>,
    TAllContext
  >
} & ([TLoader] extends [never]
    ? {
        loader: 'Loaders must return a type other than never. If you are throwing a redirect() and not returning anything, return a redirect() instead.'
      }
    : {}) &
  (
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
  ) &
  (keyof PickRequired<RouteContext> extends never
    ? {
        getContext?: GetContextFn<
          TParentRoute,
          TAllParams,
          TFullSearchSchema,
          TParentContext,
          TAllParentContext,
          TRouteContext
        >
      }
    : {
        getContext: GetContextFn<
          TParentRoute,
          TAllParams,
          TFullSearchSchema,
          TParentContext,
          TAllParentContext,
          TRouteContext
        >
      })

type GetContextFn<
  TParentRoute,
  TAllParams,
  TFullSearchSchema,
  TParentContext,
  TAllParentContext,
  TRouteContext,
> = (
  opts: {
    params: TAllParams
    search: TFullSearchSchema
  } & (TParentRoute extends undefined
    ? {
        context?: TAllParentContext
        parentContext?: TParentContext
      }
    : {
        context: TAllParentContext
        parentContext: TParentContext
      }),
) => TRouteContext

export type UpdatableRouteOptions<
  TLoader,
  TSearchSchema extends AnySearchSchema,
  TFullSearchSchema extends AnySearchSchema,
  TAllParams extends AnyPathParams,
  TRouteContext extends AnyContext,
  TAllContext extends AnyContext,
> = MetaOptions & {
  key?: null | false | GetKeyFn<TFullSearchSchema, TAllParams>
  // If true, this route will be matched as case-sensitive
  caseSensitive?: boolean
  // If true, this route will be forcefully wrapped in a suspense boundary
  wrapInSuspense?: boolean
  // The content to be rendered when the route is matched. If no component is provided, defaults to `<Outlet />`
  component?: RegisteredRouteComponent<
    TLoader,
    TFullSearchSchema,
    TAllParams,
    TRouteContext,
    TAllContext
  >
  // The content to be rendered when the route encounters an error
  errorComponent?: RegisteredErrorRouteComponent<
    TFullSearchSchema,
    TAllParams,
    TRouteContext,
    TAllContext
  > //
  // If supported by your framework, the content to be rendered as the fallback content until the route is ready to render
  pendingComponent?: RegisteredPendingRouteComponent<
    TFullSearchSchema,
    TAllParams,
    TRouteContext,
    TAllContext
  >
  // Filter functions that can manipulate search params *before* they are passed to links and navigate
  // calls that match this route.
  preSearchFilters?: SearchFilter<TFullSearchSchema>[]
  // Filter functions that can manipulate search params *after* they are passed to links and navigate
  // calls that match this route.
  postSearchFilters?: SearchFilter<TFullSearchSchema>[]
  // If set, preload matches of this route will be considered fresh for this many milliseconds.
  preloadMaxAge?: number
  // If set, a match of this route will be considered fresh for this many milliseconds.
  maxAge?: number
  // If set, a match of this route that becomes inactive (or unused) will be garbage collected after this many milliseconds
  gcMaxAge?: number
  // This async function is called before a route is loaded.
  // If an error is thrown here, the route's loader will not be called.
  // If thrown during a navigation, the navigation will be cancelled and the error will be passed to the `onError` function.
  // If thrown during a preload event, the error will be logged to the console.
  beforeLoad?: (
    opts: LoaderContext<
      TSearchSchema,
      TFullSearchSchema,
      TAllParams,
      NoInfer<TRouteContext>,
      TAllContext
    >,
  ) => Promise<void> | void
  onError?: (err: any) => void
  // This function is called
  // when moving from an inactive state to an active one. Likewise, when moving from
  // an active to an inactive state, the return function (if provided) is called.
  onLoaded?: (matchContext: {
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
}

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
export type SearchSchemaValidator<TReturn> =
  | SearchSchemaValidatorObj<TReturn>
  | SearchSchemaValidatorFn<TReturn>

export type SearchSchemaValidatorObj<TReturn> = {
  parse?: SearchSchemaValidatorFn<TReturn>
}

export type SearchSchemaValidatorFn<TReturn> = (
  searchObj: Record<string, unknown>,
) => TReturn

export type DefinedPathParamWarning =
  'Path params cannot be redefined by child routes!'

export type ParentParams<TParentParams> = AnyPathParams extends TParentParams
  ? {}
  : {
      [Key in keyof TParentParams]?: DefinedPathParamWarning
    }

export type LoaderFn<
  TLoader = unknown,
  TSearchSchema extends AnySearchSchema = {},
  TFullSearchSchema extends AnySearchSchema = {},
  TAllParams = {},
  TContext extends AnyContext = AnyContext,
  TAllContext extends AnyContext = AnyContext,
> = (
  match: LoaderContext<
    TSearchSchema,
    TFullSearchSchema,
    TAllParams,
    TContext,
    TAllContext
  > & {
    parentMatchPromise?: Promise<void>
  },
) => Promise<TLoader> | TLoader

export type GetKeyFn<
  TFullSearchSchema extends AnySearchSchema = {},
  TAllParams = {},
> = (loaderContext: { params: TAllParams; search: TFullSearchSchema }) => any

export interface LoaderContext<
  TSearchSchema extends AnySearchSchema = {},
  TFullSearchSchema extends AnySearchSchema = {},
  TAllParams = {},
  TContext extends AnyContext = AnyContext,
  TAllContext extends AnyContext = AnyContext,
> {
  params: TAllParams
  routeSearch: TSearchSchema
  search: TFullSearchSchema
  abortController: AbortController
  preload: boolean
  routeContext: TContext
  context: TAllContext
}

export type UnloaderFn<TPath extends string> = (
  routeMatch: RouteMatch<any, Route>,
) => void

export type SearchFilter<T, U = T> = (prev: T) => U

export type ResolveId<
  TParentRoute,
  TCustomId extends string,
  TPath extends string,
> = TParentRoute extends { id: infer TParentId extends string }
  ? RoutePrefix<TParentId, string extends TCustomId ? TPath : TCustomId>
  : RootRouteId

export type InferFullSearchSchema<TRoute> = TRoute extends {
  isRoot: true
  types: {
    searchSchema: infer TSearchSchema
  }
}
  ? TSearchSchema
  : TRoute extends {
      types: {
        fullSearchSchema: infer TFullSearchSchema
      }
    }
  ? TFullSearchSchema
  : {}

export type ResolveFullSearchSchema<TParentRoute, TSearchSchema> =
  InferFullSearchSchema<TParentRoute> & TSearchSchema

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
    any
  > {}

export type MergeParamsFromParent<T, U> = IsAny<T, U, T & U>

export type UseLoaderResult<T> = T
// T extends Record<PropertyKey, infer U>
//   ? {
//       [K in keyof T]: UseLoaderResultPromise<T[K]>
//     }
//   : UseLoaderResultPromise<T>

// export type UseLoaderResultPromise<T> = T extends Promise<infer U>
//   ? StreamedPromise<U>
//   : T

export type StreamedPromise<T> = {
  promise: Promise<T>
  status: 'resolved' | 'pending'
  data: T
  resolve: (value: T) => void
}

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
  TAllParentContext: AnyContext
  TRouteContext: RouteContext
  TAllContext: AnyContext
  TRouterContext: AnyContext
  TChildren: unknown
  TRouteTree: AnyRoute
}

export class Route<
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
  TLoader = unknown,
  TSearchSchema extends RouteConstraints['TSearchSchema'] = {},
  TFullSearchSchema extends RouteConstraints['TFullSearchSchema'] = ResolveFullSearchSchema<
    TParentRoute,
    TSearchSchema
  >,
  TParams extends RouteConstraints['TParams'] = Record<
    ParsePathParams<TPath>,
    string
  >,
  TAllParams extends RouteConstraints['TAllParams'] = MergeParamsFromParent<
    TParentRoute['types']['allParams'],
    TParams
  >,
  TParentContext extends RouteConstraints['TParentContext'] = TParentRoute['types']['routeContext'],
  TAllParentContext extends RouteConstraints['TAllParentContext'] = TParentRoute['types']['context'],
  TRouteContext extends RouteConstraints['TRouteContext'] = RouteContext,
  TAllContext extends RouteConstraints['TAllContext'] = MergeParamsFromParent<
    TParentRoute['types']['context'],
    TRouteContext
  >,
  TRouterContext extends RouteConstraints['TRouterContext'] = AnyContext,
  TChildren extends RouteConstraints['TChildren'] = unknown,
  TRouteTree extends RouteConstraints['TRouteTree'] = AnyRoute,
> {
  types!: {
    parentRoute: TParentRoute
    path: TPath
    to: TrimPathRight<TFullPath>
    fullPath: TFullPath
    customId: TCustomId
    id: TId
    loader: TLoader
    searchSchema: TSearchSchema
    fullSearchSchema: TFullSearchSchema
    params: TParams
    allParams: TAllParams
    parentContext: TParentContext
    allParentContext: TAllParentContext
    routeContext: TRouteContext
    context: TAllContext
    children: TChildren
    routeTree: TRouteTree
    routerContext: TRouterContext
  }
  isRoot: TParentRoute extends Route<any> ? true : false
  options: RouteOptions<
    TParentRoute,
    TCustomId,
    TPath,
    TLoader,
    InferFullSearchSchema<TParentRoute>,
    TSearchSchema,
    TFullSearchSchema,
    TParams,
    TAllParams,
    TParentContext,
    TAllParentContext,
    TRouteContext,
    TAllContext
  > &
    UpdatableRouteOptions<
      TLoader,
      TSearchSchema,
      TFullSearchSchema,
      TAllParams,
      TRouteContext,
      TAllContext
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

  constructor(
    options: RouteOptions<
      TParentRoute,
      TCustomId,
      TPath,
      TLoader,
      InferFullSearchSchema<TParentRoute>,
      TSearchSchema,
      TFullSearchSchema,
      TParams,
      TAllParams,
      TParentContext,
      TAllParentContext,
      TRouteContext,
      TAllContext
    > &
      UpdatableRouteOptions<
        TLoader,
        TSearchSchema,
        TFullSearchSchema,
        TAllParams,
        TRouteContext,
        TAllContext
      >,
  ) {
    this.options = (options as any) || {}
    this.isRoot = !options?.getParentRoute as any
    Route.__onInit(this as any)
  }

  init = (opts: { originalIndex: number; router: AnyRouter }) => {
    this.originalIndex = opts.originalIndex
    this.router = opts.router

    const options = this.options as RouteOptions<
      TParentRoute,
      TCustomId,
      TPath,
      InferFullSearchSchema<TParentRoute>,
      TSearchSchema,
      TParams
    > &
      RoutePathOptionsIntersection<TCustomId, TPath>

    const isRoot = !options?.path && !options?.id

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
      path = trimPath(path)
    }

    const customId = options?.id || path

    // Strip the parentId prefix from the first level of children
    let id = isRoot
      ? rootRouteId
      : joinPaths([
          (this.parentRoute.id as any) === rootRouteId
            ? ''
            : this.parentRoute.id,
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

  addChildren = <TNewChildren extends AnyRoute[]>(
    children: TNewChildren,
  ): Route<
    TParentRoute,
    TPath,
    TFullPath,
    TCustomId,
    TId,
    TLoader,
    TSearchSchema,
    TFullSearchSchema,
    TParams,
    TAllParams,
    TParentContext,
    TAllParentContext,
    TRouteContext,
    TAllContext,
    TRouterContext,
    TNewChildren,
    TRouteTree
  > => {
    this.children = children as any
    return this as any
  }

  update = (
    options: UpdatableRouteOptions<
      TLoader,
      TSearchSchema,
      TFullSearchSchema,
      TAllParams,
      TRouteContext,
      TAllContext
    >,
  ) => {
    Object.assign(this.options, options)
    return this
  }

  static __onInit = (route: typeof this) => {
    // This is a dummy static method that should get
    // replaced by a framework specific implementation if necessary
  }
}

export type AnyRootRoute = RootRoute<any, any, any, any>

export class RouterContext<TRouterContext extends {}> {
  constructor() {}

  createRootRoute = <
    TLoader = unknown,
    TSearchSchema extends AnySearchSchema = {},
    TRouteContext extends RouteContext = RouteContext,
  >(
    options?: Omit<
      RouteOptions<
        AnyRoute,
        RootRouteId,
        '',
        TLoader,
        TSearchSchema,
        TSearchSchema,
        TSearchSchema,
        {},
        {},
        TRouterContext,
        TRouterContext,
        TRouteContext,
        MergeParamsFromParent<TRouterContext, TRouteContext>
      >,
      | 'path'
      | 'id'
      | 'getParentRoute'
      | 'caseSensitive'
      | 'parseParams'
      | 'stringifyParams'
    >,
  ): RootRoute<TLoader, TSearchSchema, TRouteContext, TRouterContext> => {
    return new RootRoute(options) as any
  }
}

export class RootRoute<
  TLoader = unknown,
  TSearchSchema extends AnySearchSchema = {},
  TRouteContext extends RouteContext = RouteContext,
  TRouterContext extends {} = {},
> extends Route<
  any,
  '/',
  '/',
  string,
  RootRouteId,
  TLoader,
  TSearchSchema,
  TSearchSchema,
  {},
  {},
  TRouterContext,
  TRouterContext,
  TRouteContext,
  MergeParamsFromParent<TRouterContext, TRouteContext>,
  TRouterContext,
  any,
  any
> {
  constructor(
    options?: Omit<
      RouteOptions<
        AnyRoute,
        RootRouteId,
        '',
        TLoader,
        TSearchSchema,
        TSearchSchema,
        TSearchSchema,
        {},
        {},
        TRouterContext,
        TRouterContext,
        TRouteContext,
        MergeParamsFromParent<TRouterContext, TRouteContext>
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
