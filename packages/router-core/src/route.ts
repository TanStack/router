import invariant from 'tiny-invariant'
import { RoutePaths } from './routeInfo'
import { joinPaths, trimPath } from './path'
import { AnyRouter, RouteMatch, AnyRouteMatch } from './router'
import {
  DeepMerge,
  DeepMergeAll,
  Expand,
  IsAny,
  NoInfer,
  PickRequired,
  UnionToIntersection,
} from './utils'
import { ParsePathParams, ToSubOptions } from './link'

export const rootRouteId = '__root__' as const
export type RootRouteId = typeof rootRouteId
export type AnyPathParams = {}
export type AnySearchSchema = {}
export type AnyContext = {}
export interface RouteMeta {}
export interface RouteContext {}
export interface RegisterRouteComponent<
  TLoader = unknown,
  TFullSearchSchema extends Record<string, any> = AnySearchSchema,
  TAllParams extends AnyPathParams = AnyPathParams,
  TRouteContext extends Record<string, any> = AnyContext,
  TAllContext extends Record<string, any> = AnyContext,
> {
  // RouteComponent: unknown // This is registered by the framework
}
export interface RegisterErrorRouteComponent<
  TFullSearchSchema extends Record<string, any> = AnySearchSchema,
  TAllParams extends AnyPathParams = AnyPathParams,
  TRouteContext extends Record<string, any> = AnyContext,
  TAllContext extends Record<string, any> = AnyContext,
> {
  // ErrorRouteComponent: unknown // This is registered by the framework
}
export interface RegisterPendingRouteComponent<
  TFullSearchSchema extends Record<string, any> = AnySearchSchema,
  TAllParams extends AnyPathParams = AnyPathParams,
  TRouteContext extends Record<string, any> = AnyContext,
  TAllContext extends Record<string, any> = AnyContext,
> {
  // PendingRouteComponent: unknown // This is registered by the framework
}

export interface RegisterRouteProps<
  TLoader = unknown,
  TFullSearchSchema extends Record<string, any> = AnySearchSchema,
  TAllParams extends AnyPathParams = AnyPathParams,
  TRouteContext extends Record<string, any> = AnyContext,
  TAllContext extends Record<string, any> = AnyContext,
> {
  // RouteProps: unknown // This is registered by the framework
}
export interface RegisterErrorRouteProps<
  TFullSearchSchema extends Record<string, any> = AnySearchSchema,
  TAllParams extends AnyPathParams = AnyPathParams,
  TRouteContext extends Record<string, any> = AnyContext,
  TAllContext extends Record<string, any> = AnyContext,
> {
  // ErrorRouteProps: unknown // This is registered by the framework
}

export interface RegisterPendingRouteProps<
  TFullSearchSchema extends Record<string, any> = AnySearchSchema,
  TAllParams extends AnyPathParams = AnyPathParams,
  TRouteContext extends Record<string, any> = AnyContext,
  TAllContext extends Record<string, any> = AnyContext,
> {
  // PendingRouteProps: unknown // This is registered by the framework
}

export type RegisteredRouteComponent<
  TLoader = unknown,
  TFullSearchSchema extends Record<string, any> = AnySearchSchema,
  TAllParams extends AnyPathParams = AnyPathParams,
  TRouteContext extends Record<string, any> = AnyContext,
  TAllContext extends Record<string, any> = AnyContext,
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
  TFullSearchSchema extends Record<string, any> = AnySearchSchema,
  TAllParams extends AnyPathParams = AnyPathParams,
  TRouteContext extends Record<string, any> = AnyContext,
  TAllContext extends Record<string, any> = AnyContext,
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
  TFullSearchSchema extends Record<string, any> = AnySearchSchema,
  TAllParams extends AnyPathParams = AnyPathParams,
  TRouteContext extends Record<string, any> = AnyContext,
  TAllContext extends Record<string, any> = AnyContext,
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
  TFullSearchSchema extends Record<string, any> = AnySearchSchema,
  TAllParams extends AnyPathParams = AnyPathParams,
  TRouteContext extends Record<string, any> = AnyContext,
  TAllContext extends Record<string, any> = AnyContext,
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
  TFullSearchSchema extends Record<string, any> = AnySearchSchema,
  TAllParams extends AnyPathParams = AnyPathParams,
  TRouteContext extends Record<string, any> = AnyContext,
  TAllContext extends Record<string, any> = AnyContext,
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
  TFullSearchSchema extends Record<string, any> = AnySearchSchema,
  TAllParams extends AnyPathParams = AnyPathParams,
  TRouteContext extends Record<string, any> = AnyContext,
  TAllContext extends Record<string, any> = AnyContext,
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

export type RouteOptions<
  TParentRoute extends AnyRoute = AnyRoute,
  TCustomId extends string = string,
  TPath extends string = string,
  TLoaderContext extends Record<string, any> = AnyContext,
  TLoader = unknown,
  TSearchSchema extends Record<string, any> = {},
  TFullSearchSchema extends Record<string, any> = TSearchSchema,
  TParams extends AnyPathParams = AnyPathParams,
  TAllParams extends AnyPathParams = TParams,
  TRouteContext extends RouteContext = RouteContext,
  TAllContext extends Record<string, any> = AnyContext,
> = BaseRouteOptions<
  TParentRoute,
  TCustomId,
  TPath,
  TLoaderContext,
  TLoader,
  TSearchSchema,
  TFullSearchSchema,
  TParams,
  TAllParams,
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
  TLoaderContext extends Record<string, any> = AnyContext,
  TLoader = unknown,
  TSearchSchema extends Record<string, any> = {},
  TFullSearchSchema extends Record<string, any> = TSearchSchema,
  TParams extends AnyPathParams = {},
  TAllParams = ParamsFallback<TPath, TParams>,
  TRouteContext extends RouteContext = RouteContext,
  TAllContext extends Record<string, any> = AnyContext,
> = RoutePathOptions<TCustomId, TPath> & {
  getParentRoute: () => TParentRoute
  validateSearch?: SearchSchemaValidator<TSearchSchema>
  loaderContext?: (opts: { search: TFullSearchSchema }) => TLoaderContext
} & (keyof PickRequired<RouteContext> extends never
    ? // This async function is called before a route is loaded.
      // If an error is thrown here, the route's loader will not be called.
      // If thrown during a navigation, the navigation will be cancelled and the error will be passed to the `onError` function.
      // If thrown during a preload event, the error will be logged to the console.
      {
        beforeLoad?: BeforeLoadFn<
          TParentRoute,
          TAllParams,
          NoInfer<TLoaderContext>,
          TRouteContext
        >
      }
    : {
        beforeLoad: BeforeLoadFn<
          TParentRoute,
          TAllParams,
          NoInfer<TLoaderContext>,
          TRouteContext
        >
      }) & {
    loader?: LoaderFn<
      TLoader,
      TAllParams,
      NoInfer<TLoaderContext>,
      NoInfer<TAllContext>,
      NoInfer<TRouteContext>
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
  )

type BeforeLoadFn<
  TParentRoute extends AnyRoute,
  TAllParams,
  TLoaderContext,
  TRouteContext,
> = (opts: {
  abortController: AbortController
  preload: boolean
  params: TAllParams
  context: Expand<TParentRoute['types']['context'] & TLoaderContext>
}) => Promise<TRouteContext> | TRouteContext | void

export type UpdatableRouteOptions<
  TLoader,
  TSearchSchema extends Record<string, any>,
  TFullSearchSchema extends Record<string, any>,
  TAllParams extends AnyPathParams,
  TRouteContext extends Record<string, any>,
  TAllContext extends Record<string, any>,
> = MetaOptions & {
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
  onError?: (err: any) => void
  // These functions are called as route matches are loaded, stick around and leave the active
  // matches
  onEnter?: (match: AnyRouteMatch) => void
  onTransition?: (match: AnyRouteMatch) => void
  onLeave?: (match: AnyRouteMatch) => void
  // Set this to true or false to specifically set whether or not this route should be preloaded. If unset, will
  // default to router.options.reloadOnWindowFocus
  reloadOnWindowFocus?: boolean
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
  TAllParams = {},
  TLoaderContext extends Record<string, any> = AnyContext,
  TAllContext extends Record<string, any> = AnyContext,
  TRouteContext extends Record<string, any> = AnyContext,
> = (
  match: LoaderContext<
    TAllParams,
    TLoaderContext,
    TAllContext,
    TRouteContext
  > & {
    parentMatchPromise?: Promise<void>
  },
) => Promise<TLoader> | TLoader

export interface LoaderContext<
  TAllParams = {},
  TLoaderContext = {},
  TAllContext extends Record<string, any> = AnyContext,
  TRouteContext extends Record<string, any> = AnyContext,
> {
  abortController: AbortController
  preload: boolean
  params: TAllParams
  context: DeepMergeAll<[TAllContext, TLoaderContext, TRouteContext]>
}

export type SearchFilter<T, U = T> = (prev: T) => U

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

export type ResolveFullSearchSchema<TParentRoute, TSearchSchema> = Expand<
  DeepMerge<InferFullSearchSchema<TParentRoute>, TSearchSchema>
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
    any
  > {}

export type MergeFromFromParent<T, U> = IsAny<T, U, T & U>

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

export type ResolveAllParams<
  TParentRoute extends AnyRoute,
  TParams extends AnyPathParams,
> = Record<never, string> extends TParentRoute['types']['allParams']
  ? TParams
  : Expand<
      UnionToIntersection<TParentRoute['types']['allParams'] & TParams> & {}
    >

export type RouteConstraints = {
  TParentRoute: AnyRoute
  TPath: string
  TFullPath: string
  TCustomId: string
  TId: string
  TLoaderContext: Record<string, any>
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
  TLoaderContext extends RouteConstraints['TLoaderContext'] = {},
  TLoader = unknown,
  TSearchSchema extends RouteConstraints['TSearchSchema'] = {},
  TFullSearchSchema extends RouteConstraints['TFullSearchSchema'] = ResolveFullSearchSchema<
    TParentRoute,
    TSearchSchema
  >,
  TParams extends RouteConstraints['TParams'] = Expand<
    Record<ParsePathParams<TPath>, string>
  >,
  TAllParams extends RouteConstraints['TAllParams'] = ResolveAllParams<
    TParentRoute,
    TParams
  >,
  TRouteContext extends RouteConstraints['TRouteContext'] = RouteContext,
  TAllContext extends RouteConstraints['TAllContext'] = Expand<
    DeepMergeAll<
      [
        IsAny<TParentRoute['types']['context'], {}>,
        TLoaderContext,
        TRouteContext,
      ]
    >
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
    TLoaderContext,
    TLoader,
    TSearchSchema,
    TFullSearchSchema,
    TParams,
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
      TLoaderContext,
      TLoader,
      TSearchSchema,
      TFullSearchSchema,
      TParams,
      TAllParams,
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
    Route.__onInit(this)
  }

  init = (opts: { originalIndex: number; router: AnyRouter }) => {
    this.originalIndex = opts.originalIndex
    this.router = opts.router

    const options = this.options as RouteOptions<
      TParentRoute,
      TCustomId,
      TPath,
      TLoaderContext,
      TLoader,
      TSearchSchema,
      TFullSearchSchema,
      TParams,
      TAllParams,
      TRouteContext,
      TAllContext
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
    TLoaderContext,
    TLoader,
    TSearchSchema,
    TFullSearchSchema,
    TParams,
    TAllParams,
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

  static __onInit = (route: any) => {
    // This is a dummy static method that should get
    // replaced by a framework specific implementation if necessary
  }
}

export type AnyRootRoute = RootRoute<any, any, any, any>

export class RouterContext<TRouterContext extends {}> {
  constructor() {}

  createRootRoute = <
    TLoaderContext extends Record<string, any> = AnyContext,
    TLoader = unknown,
    TSearchSchema extends Record<string, any> = {},
    TRouteContext extends RouteContext = RouteContext,
  >(
    options?: Omit<
      RouteOptions<
        AnyRoute, // TParentRoute
        RootRouteId, // TCustomId
        '', // TPath
        TLoaderContext, // TLoaderContext
        TLoader, // TLoader
        TSearchSchema, // TSearchSchema
        TSearchSchema, // TFullSearchSchema
        {}, // TParams
        {}, // TAllParams
        TRouteContext, // TRouteContext
        DeepMergeAll<[TRouterContext, TLoaderContext, TRouteContext]> // TAllContext
      >,
      | 'path'
      | 'id'
      | 'getParentRoute'
      | 'caseSensitive'
      | 'parseParams'
      | 'stringifyParams'
    >,
  ): RootRoute<
    TLoaderContext,
    TLoader,
    TSearchSchema,
    TRouteContext,
    TRouterContext
  > => {
    return new RootRoute(options) as any
  }
}

export class RootRoute<
  TLoaderContext extends Record<string, any> = AnyContext,
  TLoader = unknown,
  TSearchSchema extends Record<string, any> = {},
  TRouteContext extends RouteContext = RouteContext,
  TRouterContext extends {} = {},
> extends Route<
  any, // TParentRoute
  '/', // TPath
  '/', // TFullPath
  string, // TCustomId
  RootRouteId, // TId
  TLoaderContext, // TLoaderContext
  TLoader, // TLoader
  TSearchSchema, // TSearchSchema
  TSearchSchema, // TFullSearchSchema
  {}, // TParams
  {}, // TAllParams
  TRouteContext, // TRouteContext
  DeepMergeAll<[TRouterContext, TLoaderContext, TRouteContext]>, // TAllContext
  TRouterContext, // TRouterContext
  any, // TChildren
  any // TRouteTree
> {
  constructor(
    options?: Omit<
      RouteOptions<
        AnyRoute, // TParentRoute
        RootRouteId, // TCustomId
        '', // TPath
        TLoaderContext, // TLoaderContext
        TLoader, // TLoader
        TSearchSchema, // TSearchSchema
        TSearchSchema, // TFullSearchSchema
        {}, // TParams
        {}, // TAllParams
        TRouteContext, // TRouteContext
        DeepMergeAll<[TRouterContext, TLoaderContext, TRouteContext]> // TAllContext
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
  } & ToSubOptions<TRouteTree, TFrom, TTo>,
): RouteMask<TRouteTree> {
  return opts as any
}
