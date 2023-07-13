import { ParsePathParams } from './link'
import { RouteMatch } from './routeMatch'
import { AnyRouter, RegisteredRoutesInfo, Router } from './router'
import {
  IsAny,
  NoInfer,
  PickRequired,
  PickUnsafe,
  UnionToIntersection,
} from './utils'
import invariant from 'tiny-invariant'
import { joinPaths, trimPath, trimPathRight } from './path'
import { AnyRoutesInfo, DefaultRoutesInfo } from './routeInfo'
import {
  MakeLinkOptions,
  RouteComponent,
  useLoader,
  useMatch,
  useParams,
  useSearch,
} from './react'

export const rootRouteId = '__root__' as const
export type RootRouteId = typeof rootRouteId
export type AnyPathParams = {}
export type AnySearchSchema = {}
export type AnyContext = {}
export interface RouteMeta {}
export interface RouteContext {}

export type RouteOptionsBase<TCustomId, TPath> =
  | {
      path: TPath
    }
  | {
      id: TCustomId
    }

export type RouteOptionsBaseIntersection<TCustomId, TPath> =
  UnionToIntersection<RouteOptionsBase<TCustomId, TPath>>

export type MetaOptions = keyof PickRequired<RouteMeta> extends never
  ? {
      meta?: RouteMeta
    }
  : {
      meta: RouteMeta
    }

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

export type ContextOptions<
  TParentRoute,
  TAllParams,
  TFullSearchSchema,
  TParentContext,
  TAllParentContext,
  TRouteContext,
> = keyof PickRequired<RouteContext> extends never
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
    }

export type RouteProps<
  TParentRoute extends AnyRoute,
  TPath extends string,
  TFullPath extends ResolveFullPath<
    TParentRoute,
    TPath,
    RoutePrefix<TParentRoute['fullPath'], TPath>
  >,
  TCustomId extends string,
  TId extends ResolveId<TParentRoute, TCustomId, TPath>,
  TLoader,
  TSearchSchema extends AnySearchSchema,
  TFullSearchSchema extends AnySearchSchema,
  TAllParams,
  TParentContext,
  TAllParentContext extends IsAny<
    TParentRoute['__types']['allParams'],
    TParentContext,
    TParentRoute['__types']['allParams'] & TParentContext
  >,
  TRouteContext,
  TContext,
  TRouterContext extends AnyContext,
> = {
  useMatch: () => RouteMatch<
    AnyRoutesInfo,
    Route<
      TParentRoute,
      TPath,
      TFullPath,
      TCustomId,
      TId,
      TLoader,
      TSearchSchema,
      TFullSearchSchema,
      TParentContext,
      TAllParentContext,
      TRouteContext,
      TContext,
      TRouterContext,
      any,
      any
    >
  >
  useLoader: () => TLoader
  useSearch: <
    TStrict extends boolean = true,
    TSearch = TFullSearchSchema,
    TSelected = TSearch,
  >(opts?: {
    strict?: TStrict
    track?: (search: TSearch) => TSelected
  }) => TStrict extends true ? TSelected : TSelected | undefined
  useParams: <
    TDefaultSelected = TAllParams,
    TSelected = TDefaultSelected,
  >(opts?: {
    track?: (search: TDefaultSelected) => TSelected
  }) => TSelected
  useContext: () => TContext
  // navigate: <T extends TFullPath, TTo extends string = ''>(
  //   opts?: MakeLinkOptions<T, TTo>,
  // ) => Promise<void>
}

export type RouteOptions<
  TParentRoute extends AnyRoute = AnyRoute,
  TCustomId extends string = string,
  TPath extends string = string,
  TLoader = unknown,
  TParentSearchSchema extends {} = {},
  TSearchSchema extends AnySearchSchema = {},
  TFullSearchSchema extends AnySearchSchema = TSearchSchema,
  TParentParams extends AnyPathParams = {},
  TParams = Record<ParsePathParams<TPath>, string>,
  TAllParams = TParams,
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
  TContext extends MergeFromParent<
    TAllParentContext,
    TRouteContext
  > = MergeFromParent<TAllParentContext, TRouteContext>,
> = RouteOptionsBase<TCustomId, TPath> & {
  getParentRoute: () => TParentRoute
  // Optionally call this function to get a unique key for this route.
  // This is useful for routes that need to be uniquely identified
  // by more than their by search params
  getKey?: OnLoadFnKey<
    TSearchSchema,
    TFullSearchSchema,
    TAllParams,
    NoInfer<TRouteContext>,
    TContext
  >
  // If true, this route will be matched as case-sensitive
  caseSensitive?: boolean
  // Filter functions that can manipulate search params *before* they are passed to links and navigate
  // calls that match this route.
  preSearchFilters?: SearchFilter<TFullSearchSchema>[]
  // Filter functions that can manipulate search params *after* they are passed to links and navigate
  // calls that match this route.
  postSearchFilters?: SearchFilter<TFullSearchSchema>[]
  // The content to be rendered when the route is matched. If no component is provided, defaults to `<Outlet />`
  component?: RouteComponent<
    RouteProps<
      TParentRoute,
      TPath,
      ResolveFullPath<TParentRoute, TPath>,
      TCustomId,
      ResolveId<TParentRoute, TCustomId, TPath>,
      TLoader,
      TSearchSchema,
      TFullSearchSchema,
      TAllParams,
      TParentContext,
      TAllParentContext,
      TRouteContext,
      TContext,
      NoInfer<TRouteContext>
    >
  > //
  // The content to be rendered when the route encounters an error
  errorComponent?: RouteComponent<{
    error: Error
    info: { componentStack: string }
  }> //
  // If supported by your framework, the content to be rendered as the fallback content until the route is ready to render
  pendingComponent?: RouteComponent<
    RouteProps<
      TParentRoute,
      TPath,
      ResolveFullPath<TParentRoute, TPath>,
      TCustomId,
      ResolveId<TParentRoute, TCustomId, TPath>,
      TLoader,
      TSearchSchema,
      TFullSearchSchema,
      TAllParams,
      TParentContext,
      TAllParentContext,
      TRouteContext,
      TContext,
      NoInfer<TRouteContext>
    >
  > //
  wrapInSuspense?: boolean

  // This async function is called before a route is loaded.
  // If an error is thrown here, the route's loader will not be called.
  // If thrown during a navigation, the navigation will be cancelled and the error will be passed to the `onLoadError` function.
  // If thrown during a preload event, the error will be logged to the console.
  beforeLoad?: (opts: {
    router: AnyRouter
    match: RouteMatch
  }) => Promise<void> | void
  // This function will be called if the route's loader throws an error **during an attempted navigation**.
  // If you want to redirect due to an error, call `router.navigate()` from within this function.
  onBeforeLoadError?: (err: any) => void
  validateSearch?: SearchSchemaValidator<TSearchSchema, TParentSearchSchema>
  // This function will be called if the route's validateSearch option throws an error **during an attempted validation**.
  // If you want to redirect due to an error, call `router.navigate()` from within this function.
  // If you want to display the errorComponent, rethrow the error
  onValidateSearchError?: (err: any) => void
  // An asynchronous function responsible for preparing or fetching data for the route before it is rendered
  loader?: OnLoadFn<
    TLoader,
    TSearchSchema,
    TFullSearchSchema,
    TAllParams,
    NoInfer<TRouteContext>,
    TContext
  >
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
} & MetaOptions &
  ContextOptions<
    TParentRoute,
    TAllParams,
    TFullSearchSchema,
    TParentContext,
    TAllParentContext,
    TRouteContext
  > &
  (
    | {
        // Parse params optionally receives path params as strings and returns them in a parsed format (like a number or boolean)
        parseParams?: (
          rawParams: IsAny<TPath, any, Record<ParsePathParams<TPath>, string>>,
        ) => TParams extends Record<ParsePathParams<TPath>, any>
          ? TParams
          : 'parseParams must return an object'
        stringifyParams?: (
          params: NoInfer<TParams>,
        ) => Record<ParsePathParams<TPath>, string>
      }
    | {
        stringifyParams?: never
        parseParams?: never
      }
  ) &
  (PickUnsafe<TParentParams, ParsePathParams<TPath>> extends never // Detect if an existing path param is being redefined
    ? { test?: PickUnsafe<TParentParams, ParsePathParams<TPath>> }
    : 'Cannot redefined path params in child routes!')

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

export type OnLoadFn<
  TLoader = unknown,
  TSearchSchema extends AnySearchSchema = {},
  TFullSearchSchema extends AnySearchSchema = {},
  TAllParams = {},
  TContext extends AnyContext = AnyContext,
  TAllContext extends AnyContext = AnyContext,
> = (
  loaderContext: LoaderContext<
    TSearchSchema,
    TFullSearchSchema,
    TAllParams,
    TContext,
    TAllContext
  >,
) => Promise<TLoader> | TLoader

export type OnLoadFnKey<
  TSearchSchema extends AnySearchSchema = {},
  TFullSearchSchema extends AnySearchSchema = {},
  TAllParams = {},
  TContext extends AnyContext = AnyContext,
  TAllContext extends AnyContext = AnyContext,
> = (
  loaderContext: {
    params: TAllParams
    search: TFullSearchSchema
  },
  // loaderContext: LoaderContext<
  //   TSearchSchema,
  //   TFullSearchSchema,
  //   TAllParams,
  //   TContext,
  //   TAllContext
  // >,
) => any

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
  signal?: AbortSignal
  preload: boolean
  routeContext: TContext
  context: TAllContext
  // serverOnly: <
  //   TServer extends object | (() => object),
  //   TClient extends object | (() => object),
  // >(
  //   server: TServer,
  //   client: TClient,
  // ) => (TServer extends () => infer TReturn ? TReturn : TServer) &
  //   (TClient extends () => infer TReturn ? TReturn : TClient)
}

export type UnloaderFn<TPath extends string> = (
  routeMatch: RouteMatch<any, Route>,
) => void

export type SearchFilter<T, U = T> = (prev: T) => U

type ResolveId<
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

type MergeFromParent<T, U> = IsAny<T, U, T & U>

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
  TAllParams extends MergeFromParent<
    TParentRoute['__types']['allParams'],
    TParams
  > = MergeFromParent<TParentRoute['__types']['allParams'], TParams>,
  TParentContext extends TParentRoute['__types']['routeContext'] = TParentRoute['__types']['routeContext'],
  TAllParentContext extends TParentRoute['__types']['context'] = TParentRoute['__types']['context'],
  TRouteContext extends RouteContext = RouteContext,
  TContext extends MergeFromParent<
    TParentRoute['__types']['context'],
    TRouteContext
  > = MergeFromParent<TParentRoute['__types']['context'], TRouteContext>,
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
    InferFullSearchSchema<TParentRoute> & TSearchSchema,
    TParentRoute['__types']['allParams'],
    TParams,
    TAllParams,
    TParentContext,
    TAllParentContext,
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
    >,
  ) {
    this.options = (options as any) || {}
    this.isRoot = !options?.getParentRoute as any
  }

  init = (opts: { originalIndex: number; router: AnyRouter }) => {
    this.originalIndex = opts.originalIndex
    this.router = opts.router

    const allOptions = this.options as RouteOptions<
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
      RouteOptionsBaseIntersection<TCustomId, TPath>

    const isRoot = !allOptions?.path && !allOptions?.id

    this.parentRoute = this.options?.getParentRoute?.()

    if (isRoot) {
      this.path = rootRouteId as TPath
    } else {
      invariant(
        this.parentRoute,
        `Child Route instances must pass a 'getParentRoute: () => ParentRoute' option that returns a Route instance.`,
      )
    }

    let path: undefined | string = isRoot ? rootRouteId : allOptions.path

    // If the path is anything other than an index path, trim it up
    if (path && path !== '/') {
      path = trimPath(path)
    }

    const customId = allOptions?.id || path

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

  useMatch = <TStrict extends boolean = true, TSelected = TContext>(opts?: {
    strict?: TStrict
    track?: (search: TContext) => TSelected
  }): TStrict extends true ? TSelected : TSelected | undefined => {
    return useMatch({ ...opts, from: this.id }) as any
  }

  useLoader = <TStrict extends boolean = true, TSelected = TLoader>(opts?: {
    strict?: TStrict
    track?: (search: TLoader) => TSelected
  }): TStrict extends true ? TSelected : TSelected | undefined => {
    return useLoader({ ...opts, from: this.id }) as any
  }

  useContext = <TStrict extends boolean = true, TSelected = TContext>(opts?: {
    strict?: TStrict
    track?: (search: TContext) => TSelected
  }): TStrict extends true ? TSelected : TSelected | undefined => {
    return useMatch({ ...opts, from: this.id }).context
  }

  useSearch = <
    TStrict extends boolean = true,
    TSelected = TFullSearchSchema,
  >(opts?: {
    strict?: TStrict
    track?: (search: TFullSearchSchema) => TSelected
  }): TStrict extends true ? TSelected : TSelected | undefined => {
    return useSearch({ ...opts, from: this.id })
  }

  useParams = <TStrict extends boolean = true, TSelected = TAllParams>(opts?: {
    strict?: TStrict
    track?: (search: TAllParams) => TSelected
  }): TStrict extends true ? TSelected : TSelected | undefined => {
    return useParams({ ...opts, from: this.id })
  }
}

export type AnyRootRoute = RootRoute<any, any, any, any>

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
  MergeFromParent<TRouterContext, TContext>,
  MergeFromParent<TRouterContext, TContext>,
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
        {},
        TSearchSchema,
        NoInfer<TSearchSchema>,
        {},
        TRouterContext,
        TRouterContext,
        TContext,
        NoInfer<TContext>
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

  static withRouterContext = <TRouterContext extends {}>() => {
    return <
      TLoader = unknown,
      TSearchSchema extends AnySearchSchema = {},
      TContext extends {} = {},
    >(
      options?: Omit<
        RouteOptions<
          AnyRoute,
          RootRouteId,
          '',
          TLoader,
          {},
          TSearchSchema,
          NoInfer<TSearchSchema>,
          {},
          TRouterContext,
          TRouterContext,
          TContext,
          TRouterContext & TContext
        >,
        'path' | 'id' | 'getParentRoute' | 'caseSensitive'
      >,
    ) =>
      new RootRoute<TLoader, TSearchSchema, TContext, TRouterContext>(
        options as any,
      )
  }
}

type ResolveFullPath<
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

// const rootRoute = new RootRoute({
//   validateSearch: () => null as unknown as { root?: boolean },
// })

// const aRoute = new Route({
//   getParentRoute: () => rootRoute,
//   path: 'a',
//   validateSearch: () => null as unknown as { a?: string },
// })

// const bRoute = new Route({
//   getParentRoute: () => aRoute,
//   path: 'b',
// })

// const rootIsRoot = rootRoute.isRoot
// //    ^?
// const aIsRoot = aRoute.isRoot
// //    ^?

// const rId = rootRoute.id
// //    ^?
// const aId = aRoute.id
// //    ^?
// const bId = bRoute.id
// //    ^?

// const rPath = rootRoute.fullPath
// //    ^?
// const aPath = aRoute.fullPath
// //    ^?
// const bPath = bRoute.fullPath
// //    ^?

// const rSearch = rootRoute.__types.fullSearchSchema
// //    ^?
// const aSearch = aRoute.__types.fullSearchSchema
// //    ^?
// const bSearch = bRoute.__types.fullSearchSchema
// //    ^?

// const config = rootRoute.addChildren([aRoute.addChildren([bRoute])])
// //    ^?
