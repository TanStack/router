import { ParsePathParams } from './link'
import { AnyRouter, Router, RouteMatch } from './router'
import { IsAny, NoInfer, PickRequired, UnionToIntersection } from './utils'
import invariant from 'tiny-invariant'
import { joinPaths, trimPath } from './path'
import { AnyRoutesInfo, DefaultRoutesInfo } from './routeInfo'

export const rootRouteId = '__root__' as const
export type RootRouteId = typeof rootRouteId
export type AnyPathParams = {}
export type AnySearchSchema = {}
export type AnyContext = {}
export interface RouteMeta {}
export interface RouteContext {}
export interface RegisterRouteComponent<TProps> {
  // RouteComponent: unknown // This is registered by the framework
}
export interface RegisterRouteErrorComponent<TProps> {
  // RouteErrorComponent: unknown // This is registered by the framework
}

export type RegisteredRouteComponent<TProps> =
  RegisterRouteComponent<TProps> extends {
    RouteComponent: infer T
  }
    ? T
    : (props: TProps) => unknown

export type RegisteredRouteErrorComponent<TProps> =
  RegisterRouteErrorComponent<TProps> extends {
    RouteErrorComponent: infer T
  }
    ? T
    : (props: TProps) => unknown

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

export type AnyRouteProps = RouteProps<any, any, any, any, any>
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
  infer TRoutesInfo
>
  ? RouteProps<TLoader, TFullSearchSchema, TAllParams, TRouteContext, TContext>
  : never

export type ComponentFromRoute<TRoute> = RegisteredRouteComponent<
  ComponentPropsFromRoute<TRoute>
>

export type RouteLoaderFromRoute<TRoute extends AnyRoute> = LoaderFn<
  TRoute['__types']['loader'],
  TRoute['__types']['searchSchema'],
  TRoute['__types']['fullSearchSchema'],
  TRoute['__types']['allParams'],
  TRoute['__types']['routeContext'],
  TRoute['__types']['context']
>

export type RouteProps<
  TLoader = unknown,
  TFullSearchSchema extends AnySearchSchema = AnySearchSchema,
  TAllParams = AnyPathParams,
  TRouteContext = AnyContext,
  TContext = AnyContext,
> = {
  useMatch: () => RouteMatch<AnyRoutesInfo, AnyRoute>
  useLoader: () => UseLoaderResult<TLoader>
  useSearch: <
    TStrict extends boolean = true,
    TSearch = TFullSearchSchema,
    TSelected = TSearch,
  >(opts?: {
    strict?: TStrict
    select?: (search: TSearch) => TSelected
  }) => TStrict extends true ? TSelected : TSelected | undefined
  useParams: <
    TDefaultSelected = TAllParams,
    TSelected = TDefaultSelected,
  >(opts?: {
    select?: (params: TDefaultSelected) => TSelected
  }) => TSelected
  useContext: <
    TDefaultSelected = TContext,
    TSelected = TDefaultSelected,
  >(opts?: {
    select?: (context: TDefaultSelected) => TSelected
  }) => TSelected
  useRouteContext: <
    TDefaultSelected = TRouteContext,
    TSelected = TDefaultSelected,
  >(opts?: {
    select?: (context: TDefaultSelected) => TSelected
  }) => TSelected
}

export type RouteOptions<
  TParentRoute extends AnyRoute = AnyRoute,
  TCustomId extends string = string,
  TPath extends string = string,
  TLoader = unknown,
  TParentSearchSchema extends AnySearchSchema = {},
  TSearchSchema extends AnySearchSchema = {},
  TFullSearchSchema extends AnySearchSchema = TSearchSchema,
  TParentParams extends AnyPathParams = AnyPathParams,
  TParams extends AnyPathParams = Record<ParsePathParams<TPath>, string>,
  TAllParams extends AnyPathParams = TParams,
  TParentContext extends AnyContext = AnyContext,
  TAllParentContext extends IsAny<
    TParentRoute['__types']['allParams'],
    TParentContext,
    TParentRoute['__types']['allParams'] & TParentContext
  > = IsAny<
    TParentRoute['__types']['allParams'],
    TParentContext,
    TParentRoute['__types']['allParams'] & TParentContext
  >,
  TRouteContext extends RouteContext = RouteContext,
  TContext extends MergeParamsFromParent<
    TAllParentContext,
    TRouteContext
  > = MergeParamsFromParent<TAllParentContext, TRouteContext>,
> = BaseRouteOptions<
  TParentRoute,
  TCustomId,
  TPath,
  TLoader,
  TParentSearchSchema,
  TSearchSchema,
  TFullSearchSchema,
  TParentParams,
  TParams,
  TAllParams,
  TParentContext,
  TAllParentContext,
  TRouteContext,
  TContext
> &
  UpdatableRouteOptions<
    TLoader,
    TSearchSchema,
    TFullSearchSchema,
    TAllParams,
    TRouteContext,
    TContext
  >

export type ParamsFallback<
  TPath extends string,
  TParams,
> = unknown extends TParams ? Record<ParsePathParams<TPath>, string> : TParams

export type BaseRouteOptions<
  TParentRoute extends AnyRoute = AnyRoute,
  TCustomId extends string = string,
  TPath extends string = string,
  TLoader = unknown,
  TParentSearchSchema extends AnySearchSchema = {},
  TSearchSchema extends AnySearchSchema = {},
  TFullSearchSchema extends AnySearchSchema = TSearchSchema,
  TParentParams extends AnyPathParams = AnyPathParams,
  TParams = unknown,
  TAllParams = ParamsFallback<TPath, TParams>,
  TParentContext extends AnyContext = AnyContext,
  TAllParentContext extends IsAny<
    TParentRoute['__types']['allParams'],
    TParentContext,
    TParentRoute['__types']['allParams'] & TParentContext
  > = IsAny<
    TParentRoute['__types']['allParams'],
    TParentContext,
    TParentRoute['__types']['allParams'] & TParentContext
  >,
  TRouteContext extends RouteContext = RouteContext,
  TContext extends MergeParamsFromParent<
    TAllParentContext,
    TRouteContext
  > = MergeParamsFromParent<TAllParentContext, TRouteContext>,
> = RoutePathOptions<TCustomId, TPath> & {
  getParentRoute: () => TParentRoute
  validateSearch?: SearchSchemaValidator<TSearchSchema, TParentSearchSchema>
  loader?: LoaderFn<
    TLoader,
    TSearchSchema,
    TFullSearchSchema,
    TAllParams,
    NoInfer<TRouteContext>,
    TContext
  >
} & (
    | {
        // Both or none
        parseParams?: (
          rawParams: IsAny<TPath, any, Record<ParsePathParams<TPath>, string>>,
        ) => TParams extends Record<ParsePathParams<TPath>, any>
          ? TParams
          : 'parseParams must return an object'
        // | {
        //     parse: (
        //       rawParams: IsAny<
        //         TPath,
        //         any,
        //         Record<ParsePathParams<TPath>, string>
        //       >,
        //     ) => TParams extends Record<ParsePathParams<TPath>, any>
        //       ? TParams
        //       : 'parseParams must return an object'
        //   }
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
  TContext extends AnyContext,
> = MetaOptions & {
  key?: null | false | GetKeyFn<TFullSearchSchema, TAllParams>
  // If true, this route will be matched as case-sensitive
  caseSensitive?: boolean
  // If true, this route will be forcefully wrapped in a suspense boundary
  wrapInSuspense?: boolean
  // The content to be rendered when the route is matched. If no component is provided, defaults to `<Outlet />`
  component?: RegisteredRouteComponent<
    RouteProps<TLoader, TFullSearchSchema, TAllParams, TRouteContext, TContext>
  >
  // The content to be rendered when the route encounters an error
  errorComponent?: RegisteredRouteErrorComponent<
    { error: unknown } & Partial<
      RouteProps<
        TLoader,
        TFullSearchSchema,
        TAllParams,
        TRouteContext,
        TContext
      >
    >
  > //
  // If supported by your framework, the content to be rendered as the fallback content until the route is ready to render
  pendingComponent?: RegisteredRouteComponent<
    RouteProps<TLoader, TFullSearchSchema, TAllParams, TRouteContext, TContext>
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
  // If thrown during a navigation, the navigation will be cancelled and the error will be passed to the `onLoadError` function.
  // If thrown during a preload event, the error will be logged to the console.
  beforeLoad?: (
    opts: LoaderContext<
      TSearchSchema,
      TFullSearchSchema,
      TAllParams,
      NoInfer<TRouteContext>,
      TContext
    >,
  ) => Promise<void> | void
  // This function will be called if the route's loader throws an error **during an attempted navigation**.
  // If you want to redirect due to an error, call `router.navigate()` from within this function.
  onBeforeLoadError?: (err: any) => void
  // This function will be called if the route's validateSearch option throws an error **during an attempted validation**.
  // If you want to redirect due to an error, call `router.navigate()` from within this function.
  // If you want to display the errorComponent, rethrow the error
  onValidateSearchError?: (err: any) => void
  onParseParamsError?: (err: any) => void
  onLoadError?: (err: any) => void
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
// | ParseParamsObj<TPath, TParams>

export type ParseParamsFn<TPath extends string, TParams> = (
  rawParams: IsAny<TPath, any, Record<ParsePathParams<TPath>, string>>,
) => TParams extends Record<ParsePathParams<TPath>, any>
  ? TParams
  : 'parseParams must return an object'

export type ParseParamsObj<TPath extends string, TParams> = {
  parse?: ParseParamsFn<TPath, TParams>
}

// The parse type here allows a zod schema to be passed directly to the validator
export type SearchSchemaValidator<TReturn, TParentSchema> =
  | SearchSchemaValidatorObj<TReturn, TParentSchema>
  | SearchSchemaValidatorFn<TReturn, TParentSchema>

export type SearchSchemaValidatorObj<TReturn, TParentSchema> = {
  parse?: SearchSchemaValidatorFn<TReturn, TParentSchema>
}

export type SearchSchemaValidatorFn<TReturn, TParentSchema> = (
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
  __types: {
    searchSchema: infer TSearchSchema
  }
}
  ? TSearchSchema
  : TRoute extends {
      __types: {
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

export type AnyRouteWithRouterContext<TRouterContext extends AnyContext> =
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
    TRouterContext,
    any,
    any
  >

export type MergeParamsFromParent<T, U> = IsAny<T, U, T & U>

export type UseLoaderResult<T> = T extends Record<PropertyKey, infer U>
  ? {
      [K in keyof T]: UseLoaderResultPromise<T[K]>
    }
  : UseLoaderResultPromise<T>

export type UseLoaderResultPromise<T> = T extends Promise<infer U>
  ? StreamedPromise<U>
  : T

export type StreamedPromise<T> = {
  promise: Promise<T>
  status: 'resolved' | 'pending'
  data: T
  resolve: (value: T) => void
}

export class Route<
  TParentRoute extends AnyRoute = AnyRoute,
  TPath extends string = '/',
  TFullPath extends ResolveFullPath<TParentRoute, TPath> = ResolveFullPath<
    TParentRoute,
    TPath
  >,
  TCustomId extends string = string,
  TId extends ResolveId<TParentRoute, TCustomId, TPath> = ResolveId<
    TParentRoute,
    TCustomId,
    TPath
  >,
  TLoader = unknown,
  TSearchSchema extends AnySearchSchema = {},
  TFullSearchSchema extends AnySearchSchema = ResolveFullSearchSchema<
    TParentRoute,
    TSearchSchema
  >,
  TParams extends Record<ParsePathParams<TPath>, any> = Record<
    ParsePathParams<TPath>,
    string
  >,
  TAllParams extends MergeParamsFromParent<
    TParentRoute['__types']['allParams'],
    TParams
  > = MergeParamsFromParent<TParentRoute['__types']['allParams'], TParams>,
  TParentContext extends TParentRoute['__types']['routeContext'] = TParentRoute['__types']['routeContext'],
  TAllParentContext extends TParentRoute['__types']['context'] = TParentRoute['__types']['context'],
  TRouteContext extends RouteContext = RouteContext,
  TContext extends MergeParamsFromParent<
    TParentRoute['__types']['context'],
    TRouteContext
  > = MergeParamsFromParent<TParentRoute['__types']['context'], TRouteContext>,
  TRouterContext extends AnyContext = AnyContext,
  TChildren extends unknown = unknown,
  TRoutesInfo extends DefaultRoutesInfo = DefaultRoutesInfo,
> {
  __types!: {
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
    context: TContext
    children: TChildren
    routesInfo: TRoutesInfo
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
    TParentRoute['__types']['allParams'],
    TParams,
    TAllParams,
    TParentContext,
    TAllParentContext,
    TRouteContext,
    TContext
  > &
    UpdatableRouteOptions<
      TLoader,
      TSearchSchema,
      TFullSearchSchema,
      TAllParams,
      TRouteContext,
      TContext
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
  router?: Router<TRoutesInfo['routeTree'], TRoutesInfo>
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
      TParentRoute['__types']['allParams'],
      TParams,
      TAllParams,
      TParentContext,
      TAllParentContext,
      TRouteContext,
      TContext
    > &
      UpdatableRouteOptions<
        TLoader,
        TSearchSchema,
        TFullSearchSchema,
        TAllParams,
        TRouteContext,
        TContext
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
      TParentRoute['__types']['allParams'],
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
    TContext,
    TRouterContext,
    TNewChildren,
    TRoutesInfo
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
      TContext
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
    TContext extends RouteContext = RouteContext,
  >(
    options?: Omit<
      RouteOptions<AnyRoute, RootRouteId, '', {}, TSearchSchema, {}, {}>,
      | 'path'
      | 'id'
      | 'getParentRoute'
      | 'caseSensitive'
      | 'parseParams'
      | 'stringifyParams'
    >,
  ) => {
    return new RootRoute<TLoader, TSearchSchema, TContext, TRouterContext>(
      options as any,
    )
  }
}

export class RootRoute<
  TLoader = unknown,
  TSearchSchema extends AnySearchSchema = {},
  TContext extends RouteContext = RouteContext,
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
  MergeParamsFromParent<TRouterContext, TContext>,
  MergeParamsFromParent<TRouterContext, TContext>,
  TRouterContext,
  any,
  any
> {
  constructor(
    options?: Omit<
      RouteOptions<AnyRoute, RootRouteId, '', TLoader, TSearchSchema, {}, {}>,
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
  TPrefixed extends RoutePrefix<TParentRoute['fullPath'], TPath> = RoutePrefix<
    TParentRoute['fullPath'],
    TPath
  >,
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
