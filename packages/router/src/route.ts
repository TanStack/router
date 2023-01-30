import { GetFrameworkGeneric } from './frameworks'
import { ParsePathParams } from './link'
import { RouteMatch } from './routeMatch'
import { AnyRouter, RegisteredRouter, Router } from './router'
import {
  Expand,
  IsAny,
  NoInfer,
  PickUnsafe,
  UnionToIntersection,
} from './utils'
import invariant from 'tiny-invariant'
import { joinPaths, trimPath, trimPathRight } from './path'
import { AnyRoutesInfo, DefaultRoutesInfo } from './routeInfo'

export const rootRouteId = '__root__' as const
export type RootRouteId = typeof rootRouteId

export type AnyLoaderData = {}
export type AnyPathParams = {}
export type AnySearchSchema = {}
export type AnyContext = {}
export interface RouteMeta {}

export type RouteOptionsBase<TCustomId, TPath> =
  | {
      path: TPath
    }
  | {
      id: TCustomId
    }

export type RouteOptionsBaseIntersection<TCustomId, TPath> =
  UnionToIntersection<RouteOptionsBase<TCustomId, TPath>>

export interface FrameworkRouteOptions {}

export type RouteOptions<
  TParentRoute extends AnyRoute = AnyRoute,
  TCustomId extends string = string,
  TPath extends string = string,
  TParentSearchSchema extends {} = {},
  TSearchSchema extends AnySearchSchema = {},
  TFullSearchSchema extends AnySearchSchema = TSearchSchema,
  TParentParams extends AnyPathParams = {},
  TParams extends Record<ParsePathParams<TPath>, unknown> = Record<
    ParsePathParams<TPath>,
    string
  >,
  TAllParams extends AnyPathParams = {},
  TParentContext extends AnyContext = AnyContext,
  TAllParentContext extends AnyContext = AnyContext,
  TRouteContext extends AnyContext = AnyContext,
  TContext extends AnyContext = TRouteContext,
> = RouteOptionsBase<TCustomId, TPath> &
  FrameworkRouteOptions & {
    getParentRoute: () => TParentRoute
    // If true, this route will be matched as case-sensitive
    caseSensitive?: boolean
    validateSearch?: SearchSchemaValidator<TSearchSchema, TParentSearchSchema>
    // Filter functions that can manipulate search params *before* they are passed to links and navigate
    // calls that match this route.
    preSearchFilters?: SearchFilter<TFullSearchSchema>[]
    // Filter functions that can manipulate search params *after* they are passed to links and navigate
    // calls that match this route.
    postSearchFilters?: SearchFilter<TFullSearchSchema>[]
    // The content to be rendered when the route is matched. If no component is provided, defaults to `<Outlet />`
    component?: GetFrameworkGeneric<'Component'> // , NoInfer<TParentAllLoaderData>>
    // The content to be rendered when the route encounters an error
    errorComponent?: GetFrameworkGeneric<'ErrorComponent'> // , NoInfer<TParentAllLoaderData>>
    // If supported by your framework, the content to be rendered as the fallback content until the route is ready to render
    pendingComponent?: GetFrameworkGeneric<'Component'> //, NoInfer<TParentAllLoaderData>>
    // This async function is called before a route is loaded.
    // If an error is thrown here, the route's loader will not be called.
    // If thrown during a navigation, the navigation will be cancelled and the error will be passed to the `onLoadError` function.
    // If thrown during a preload event, the error will be logged to the console.
    beforeLoad?: (opts: {
      router: AnyRouter
      match: RouteMatch
    }) => Promise<void> | void

    // An asynchronous function responsible for preparing or fetching data for the route before it is rendered
    onLoad?: OnLoadFn<TFullSearchSchema, TAllParams, TRouteContext, TContext>

    // This function will be called if the route's loader throws an error **during an attempted navigation**.
    // If you want to redirect due to an error, call `router.navigate()` from within this function.
    onLoadError?: (err: any) => void
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
    // An object of whatever you want! This object is accessible anywhere matches are.
    getContext?: (
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
  } & (
    | {
        parseParams?: never
        stringifyParams?: never
      }
    | {
        // Parse params optionally receives path params as strings and returns them in a parsed format (like a number or boolean)
        parseParams: (
          rawParams: IsAny<TPath, any, Record<ParsePathParams<TPath>, string>>,
        ) => TParams
        stringifyParams: (
          params: TParams,
        ) => Record<ParsePathParams<TPath>, string>
      }
  ) &
  (PickUnsafe<TParentParams, ParsePathParams<TPath>> extends never // Detect if an existing path param is being redefined
    ? {}
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
  TFullSearchSchema extends AnySearchSchema = {},
  TAllParams extends AnyPathParams = {},
  TContext extends AnyContext = AnyContext,
  TAllContext extends AnyContext = AnyContext,
> = (
  loaderContext: LoaderContext<
    TFullSearchSchema,
    TAllParams,
    TContext,
    TAllContext
  >,
) => Promise<any> | void

export interface LoaderContext<
  TFullSearchSchema extends AnySearchSchema = {},
  TAllParams extends AnyPathParams = {},
  TContext extends AnyContext = AnyContext,
  TAllContext extends AnyContext = AnyContext,
> {
  params: TAllParams
  search: TFullSearchSchema
  signal?: AbortSignal
  preload: boolean
  routeContext: TContext
  context: TAllContext
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
    any
  > {}

type MergeFromParent<T, U> = IsAny<T, U, T & U>

export class Route<
  TParentRoute extends AnyRoute = AnyRoute,
  TPath extends string = string,
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
  TSearchSchema extends AnySearchSchema = {},
  TFullSearchSchema extends AnySearchSchema = ResolveFullSearchSchema<
    TParentRoute,
    TSearchSchema
  >,
  TParams extends Record<ParsePathParams<TPath>, unknown> = Record<
    ParsePathParams<TPath>,
    string
  >,
  TAllParams extends MergeFromParent<
    TParentRoute['__types']['allParams'],
    TParams
  > = MergeFromParent<TParentRoute['__types']['allParams'], TParams>,
  TParentContext extends TParentRoute['__types']['routeContext'] = TParentRoute['__types']['routeContext'],
  TAllParentContext extends TParentRoute['__types']['context'] = TParentRoute['__types']['context'],
  TRouteContext extends AnyContext = AnyContext,
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
    fullPath: TFullPath
    customId: TCustomId
    id: TId
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

  // Optional
  children?: TChildren
  originalIndex?: number
  router?: Router<TRoutesInfo['routeTree'], TRoutesInfo>

  constructor(
    options: RouteOptions<
      TParentRoute,
      TCustomId,
      TPath,
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

    const parent = this.options?.getParentRoute?.()

    if (isRoot) {
      this.path = rootRouteId as TPath
    } else {
      invariant(
        parent,
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
          (parent.id as any) === rootRouteId ? '' : parent.id,
          customId,
        ])

    if (path === rootRouteId) {
      path = '/'
    }

    if (id !== rootRouteId) {
      id = joinPaths(['/', id])
    }

    const fullPath =
      id === rootRouteId
        ? '/'
        : trimPathRight(joinPaths([parent.fullPath, path]))

    this.path = path as TPath
    this.id = id as TId
    // this.customId = customId as TCustomId
    this.fullPath = fullPath as TFullPath
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

  generate = (
    options: Omit<
      RouteOptions<
        TParentRoute,
        TCustomId,
        TPath,
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
      'path'
    >,
  ) => {
    invariant(
      false,
      `route.generate() is used by TanStack Router's file-based routing code generation and should not actually be called during runtime. `,
    )
  }
}

export type AnyRootRoute = RootRoute<any, any, any>

export class RootRoute<
  TSearchSchema extends AnySearchSchema = {},
  TContext extends AnyContext = AnyContext,
  TRouterContext extends AnyContext = AnyContext,
> extends Route<
  any,
  '/',
  '/',
  string,
  RootRouteId,
  TSearchSchema,
  TSearchSchema,
  {},
  {},
  TRouterContext,
  TRouterContext,
  TContext,
  MergeFromParent<TRouterContext, TContext>,
  TRouterContext
> {
  constructor(
    options?: Omit<
      RouteOptions<
        AnyRoute,
        RootRouteId,
        '',
        {},
        TSearchSchema,
        NoInfer<TSearchSchema>,
        {},
        TRouterContext,
        TRouterContext,
        TContext,
        NoInfer<TContext>
      >,
      'path' | 'id' | 'getParentRoute' | 'caseSensitive'
    >,
  ) {
    super(options as any)
  }

  static withRouterContext = <TRouterContext extends AnyContext>() => {
    return <
      TSearchSchema extends AnySearchSchema = {},
      TContext extends AnyContext = AnyContext,
    >(
      options?: Omit<
        RouteOptions<
          AnyRoute,
          RootRouteId,
          '',
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
    ) => new RootRoute<TSearchSchema, TContext, TRouterContext>(options as any)
  }
}

type ResolveFullPath<
  TParentRoute extends AnyRoute,
  TPath extends string,
  TPrefixed extends RoutePrefix<TParentRoute['fullPath'], TPath> = RoutePrefix<
    TParentRoute['fullPath'],
    TPath
  >,
> = TPrefixed extends RootRouteId ? '/' : TrimPathRight<`${TPrefixed}`>

type RoutePrefix<
  TPrefix extends string,
  TId extends string,
> = string extends TId
  ? RootRouteId
  : TId extends string
  ? TPrefix extends RootRouteId
    ? TId extends '/'
      ? '/'
      : `/${TrimPath<TId>}`
    : `${TPrefix}/${TId}` extends '/'
    ? '/'
    : `/${TrimPathLeft<`${TrimPathRight<TPrefix>}/${TrimPath<TId>}`>}`
  : never

type TrimPath<T extends string> = '' extends T
  ? ''
  : TrimPathRight<TrimPathLeft<T>>

type TrimPathLeft<T extends string> = T extends `${RootRouteId}/${infer U}`
  ? TrimPathLeft<U>
  : T extends `/${infer U}`
  ? TrimPathLeft<U>
  : T
type TrimPathRight<T extends string> = T extends '/'
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
