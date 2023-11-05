import invariant from 'tiny-invariant'
import { RoutePaths } from './routeInfo'
import { joinPaths, trimPath } from './path'
import { AnyRouter } from './router'
import { AnyRouteMatch } from './RouteMatch'
import {
  Expand,
  IsAny,
  NoInfer,
  PickRequired,
  UnionToIntersection,
  Assign,
} from './utils'
import { ParsePathParams, ToSubOptions } from './link'
import {
  ErrorRouteComponent,
  PendingRouteComponent,
  RouteComponent,
  RouteProps,
  useMatch,
  useParams,
  useSearch,
} from './react'
import { HistoryLocation } from '@tanstack/history'
import { ParsedLocation } from './location'

export const rootRouteId = '__root__' as const
export type RootRouteId = typeof rootRouteId
export type AnyPathParams = {}
export type AnySearchSchema = {}
export type AnyContext = {}
export interface RouteMeta {}

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

// export type MetaOptions = keyof PickRequired<RouteMeta> extends never
//   ? {
//       meta?: RouteMeta
//     }
//   : {
//       meta: RouteMeta
//     }

export type RouteOptions<
  TParentRoute extends AnyRoute = AnyRoute,
  TCustomId extends string = string,
  TPath extends string = string,
  TSearchSchema extends Record<string, any> = {},
  TFullSearchSchema extends Record<string, any> = TSearchSchema,
  TParams extends AnyPathParams = AnyPathParams,
  TAllParams extends AnyPathParams = TParams,
  TRouteMeta extends RouteMeta = RouteMeta,
  TAllMeta extends Record<string, any> = AnyContext,
> = BaseRouteOptions<
  TParentRoute,
  TCustomId,
  TPath,
  TSearchSchema,
  TFullSearchSchema,
  TParams,
  TAllParams,
  TRouteMeta,
  TAllMeta
> &
  NoInfer<UpdatableRouteOptions<TFullSearchSchema, TAllParams, TAllMeta>>

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
  TSearchSchema extends Record<string, any> = {},
  TFullSearchSchema extends Record<string, any> = TSearchSchema,
  TParams extends AnyPathParams = {},
  TAllParams = ParamsFallback<TPath, TParams>,
  TRouteMeta extends RouteMeta = RouteMeta,
  TAllContext extends Record<string, any> = AnyContext,
> = RoutePathOptions<TCustomId, TPath> & {
  getParentRoute: () => TParentRoute
  validateSearch?: SearchSchemaValidator<TSearchSchema>
} & (keyof PickRequired<RouteMeta> extends never
    ? // This async function is called before a route is loaded.
      // If an error is thrown here, the route's loader will not be called.
      // If thrown during a navigation, the navigation will be cancelled and the error will be passed to the `onError` function.
      // If thrown during a preload event, the error will be logged to the console.
      {
        beforeLoad?: BeforeLoadFn<
          TFullSearchSchema,
          TParentRoute,
          TAllParams,
          TRouteMeta
        >
      }
    : {
        beforeLoad: BeforeLoadFn<
          TFullSearchSchema,
          TParentRoute,
          TAllParams,
          TRouteMeta
        >
      }) & {
    load?: LoadFn<
      TAllParams,
      TFullSearchSchema,
      NoInfer<TAllContext>,
      NoInfer<TRouteMeta>
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

type BeforeLoadFn<
  TFullSearchSchema extends Record<string, any>,
  TParentRoute extends AnyRoute,
  TAllParams,
  TRouteMeta,
> = (opts: {
  search: TFullSearchSchema
  abortController: AbortController
  preload: boolean
  params: TAllParams
  meta: TParentRoute['types']['allMeta']
  location: ParsedLocation
}) => Promise<TRouteMeta> | TRouteMeta | void

export type UpdatableRouteOptions<
  TFullSearchSchema extends Record<string, any>,
  TAllParams extends AnyPathParams,
  TAllContext extends AnyContext,
> =
  // MetaOptions &
  {
    // test?: (args: TAllContext) => void
    // If true, this route will be matched as case-sensitive
    caseSensitive?: boolean
    // If true, this route will be forcefully wrapped in a suspense boundary
    wrapInSuspense?: boolean
    // The content to be rendered when the route is matched. If no component is provided, defaults to `<Outlet />`
    component?: RouteComponent<TFullSearchSchema, TAllParams, TAllContext>
    // The content to be rendered when the route encounters an error
    errorComponent?: ErrorRouteComponent<
      TFullSearchSchema,
      TAllParams,
      {}
      // TAllContext // TODO: I have no idea why this breaks the universe,
      // so we'll come back to it later.
    > //
    // If supported by your framework, the content to be rendered as the fallback content until the route is ready to render
    pendingComponent?: PendingRouteComponent<
      TFullSearchSchema,
      TAllParams,
      TAllContext
    >
    // Filter functions that can manipulate search params *before* they are passed to links and navigate
    // calls that match this route.
    preSearchFilters?: SearchFilter<TFullSearchSchema>[]
    // Filter functions that can manipulate search params *after* they are passed to links and navigate
    // calls that match this route.
    postSearchFilters?: SearchFilter<TFullSearchSchema>[]
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

export type LoadFn<
  TAllParams = {},
  TFullSearchSchema extends Record<string, any> = {},
  TAllContext extends Record<string, any> = AnyContext,
  TRouteMeta extends Record<string, any> = AnyContext,
> = (
  match: LoadFnContext<
    TAllParams,
    TFullSearchSchema,
    TAllContext,
    TRouteMeta
  > & {
    parentMatchPromise?: Promise<void>
  },
) => any

export interface LoadFnContext<
  TAllParams = {},
  TFullSearchSchema extends Record<string, any> = {},
  TAllContext extends Record<string, any> = AnyContext,
  TRouteMeta extends Record<string, any> = AnyContext,
> {
  abortController: AbortController
  preload: boolean
  params: TAllParams
  search: TFullSearchSchema
  meta: Expand<Assign<TAllContext, TRouteMeta>>
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
  Assign<InferFullSearchSchema<TParentRoute>, TSearchSchema>
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
    any
  > {}

export type MergeFromFromParent<T, U> = IsAny<T, U, T & U>

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
  TSearchSchema: AnySearchSchema
  TFullSearchSchema: AnySearchSchema
  TParams: Record<string, any>
  TAllParams: Record<string, any>
  TParentContext: AnyContext
  TRouteMeta: RouteMeta
  TAllContext: AnyContext
  TRouterMeta: AnyContext
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
  TRouteMeta extends RouteConstraints['TRouteMeta'] = RouteMeta,
  TAllMeta extends Expand<
    Assign<IsAny<TParentRoute['types']['allMeta'], {}>, TRouteMeta>
  > = Expand<Assign<IsAny<TParentRoute['types']['allMeta'], {}>, TRouteMeta>>,
  TRouterMeta extends RouteConstraints['TRouterMeta'] = AnyContext,
  TChildren extends RouteConstraints['TChildren'] = unknown,
  TRouteTree extends RouteConstraints['TRouteTree'] = AnyRoute,
> {
  isRoot: TParentRoute extends Route<any> ? true : false
  options: RouteOptions<
    TParentRoute,
    TCustomId,
    TPath,
    TSearchSchema,
    TFullSearchSchema,
    TParams,
    TAllParams,
    TRouteMeta,
    TAllMeta
  >

  test!: Expand<Assign<IsAny<TParentRoute['types']['allMeta'], {}>, TRouteMeta>>

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
      TSearchSchema,
      TFullSearchSchema,
      TParams,
      TAllParams,
      TRouteMeta,
      TAllMeta
    >,
  ) {
    this.options = (options as any) || {}
    this.isRoot = !options?.getParentRoute as any
    Route.__onInit(this)
  }

  types!: {
    parentRoute: TParentRoute
    path: TPath
    to: TrimPathRight<TFullPath>
    fullPath: TFullPath
    customId: TCustomId
    id: TId
    searchSchema: TSearchSchema
    fullSearchSchema: TFullSearchSchema
    params: TParams
    allParams: TAllParams
    routeMeta: TRouteMeta
    allMeta: TAllMeta
    children: TChildren
    routeTree: TRouteTree
    routerMeta: TRouterMeta
  }

  init = (opts: { originalIndex: number }) => {
    this.originalIndex = opts.originalIndex

    const options = this.options as RouteOptions<
      TParentRoute,
      TCustomId,
      TPath,
      TSearchSchema,
      TFullSearchSchema,
      TParams,
      TAllParams,
      TRouteMeta,
      TAllMeta
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
    TSearchSchema,
    TFullSearchSchema,
    TParams,
    TAllParams,
    TRouteMeta,
    TAllMeta,
    TRouterMeta,
    TNewChildren,
    TRouteTree
  > => {
    this.children = children as any
    return this as any
  }

  update = (
    options: UpdatableRouteOptions<
      TFullSearchSchema,
      TAllParams,
      Expand<Assign<IsAny<TParentRoute['types']['allMeta'], {}>, TRouteMeta>>
    >,
  ) => {
    Object.assign(this.options, options)
    return this
  }

  static __onInit = (route: any) => {
    // This is a dummy static method that should get
    // replaced by a framework specific implementation if necessary
  }

  useMatch = <TSelected = TAllMeta>(opts?: {
    select?: (search: TAllMeta) => TSelected
  }): TSelected => {
    return useMatch({ ...opts, from: this.id }) as any
  }
  useRouteMeta = <TSelected = TAllMeta>(opts?: {
    select?: (search: TAllMeta) => TSelected
  }): TSelected => {
    return useMatch({
      ...opts,
      from: this.id,
      select: (d: any) => (opts?.select ? opts.select(d.meta) : d.meta),
    } as any)
  }
  useSearch = <TSelected = TFullSearchSchema>(opts?: {
    select?: (search: TFullSearchSchema) => TSelected
  }): TSelected => {
    return useSearch({ ...opts, from: this.id } as any)
  }
  useParams = <TSelected = TAllParams>(opts?: {
    select?: (search: TAllParams) => TSelected
  }): TSelected => {
    return useParams({ ...opts, from: this.id } as any)
  }
}

export type AnyRootRoute = RootRoute<any, any, any>

export class RouterMeta<TRouterMeta extends {}> {
  constructor() {}

  createRootRoute = <
    TSearchSchema extends Record<string, any> = {},
    TRouteMeta extends RouteMeta = RouteMeta,
  >(
    options?: Omit<
      RouteOptions<
        AnyRoute, // TParentRoute
        RootRouteId, // TCustomId
        '', // TPath
        TSearchSchema, // TSearchSchema
        TSearchSchema, // TFullSearchSchema
        {}, // TParams
        {}, // TAllParams
        TRouteMeta, // TRouteMeta
        Assign<TRouterMeta, TRouteMeta> // TAllContext
      >,
      | 'path'
      | 'id'
      | 'getParentRoute'
      | 'caseSensitive'
      | 'parseParams'
      | 'stringifyParams'
    >,
  ): RootRoute<TSearchSchema, TRouteMeta, TRouterMeta> => {
    return new RootRoute(options) as any
  }
}

export class RootRoute<
  TSearchSchema extends Record<string, any> = {},
  TRouteMeta extends RouteMeta = RouteMeta,
  TRouterMeta extends {} = {},
> extends Route<
  any, // TParentRoute
  '/', // TPath
  '/', // TFullPath
  string, // TCustomId
  RootRouteId, // TId
  TSearchSchema, // TSearchSchema
  TSearchSchema, // TFullSearchSchema
  {}, // TParams
  {}, // TAllParams
  TRouteMeta, // TRouteMeta
  Expand<Assign<TRouterMeta, TRouteMeta>>, // TAllContext
  TRouterMeta, // TRouterMeta
  any, // TChildren
  any // TRouteTree
> {
  constructor(
    options?: Omit<
      RouteOptions<
        AnyRoute, // TParentRoute
        RootRouteId, // TCustomId
        '', // TPath
        TSearchSchema, // TSearchSchema
        TSearchSchema, // TFullSearchSchema
        {}, // TParams
        {}, // TAllParams
        TRouteMeta, // TRouteMeta
        Assign<TRouterMeta, TRouteMeta> // TAllContext
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
