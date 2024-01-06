import * as React from 'react'
import invariant from 'tiny-invariant'
import { useLoaderData, useLoaderDeps, useMatch } from './Matches'
import { AnyRouteMatch } from './Matches'
import { NavigateOptions, ParsePathParams, ToSubOptions } from './link'
import { ParsedLocation } from './location'
import { joinPaths, trimPath } from './path'
import { RouteById, RouteIds, RoutePaths } from './routeInfo'
import { AnyRouter, RegisteredRouter } from './router'
import { useParams } from './useParams'
import { useSearch } from './useSearch'
import {
  Assign,
  Expand,
  IsAny,
  NoInfer,
  PickRequired,
  UnionToIntersection,
} from './utils'
import { BuildLocationFn, NavigateFn } from './RouterProvider'

export const rootRouteId = '__root__' as const
export type RootRouteId = typeof rootRouteId
export type AnyPathParams = {}

export type SearchSchemaInput = {
  __TSearchSchemaInput__: 'TSearchSchemaInput'
}

export type AnySearchSchema = {}

export type AnyContext = {}

export interface RouteContext {}

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

export type MetaOptions = keyof PickRequired<RouteMeta> extends never
  ? {
      meta?: RouteMeta
    }
  : {
      meta: RouteMeta
    }

export type RouteOptions<
  TParentRoute extends AnyRoute = AnyRoute,
  TCustomId extends string = string,
  TPath extends string = string,
  TSearchSchemaInput extends Record<string, any> = {},
  TSearchSchema extends Record<string, any> = {},
  TSearchSchemaUsed extends Record<string, any> = {},
  TFullSearchSchemaInput extends Record<string, any> = TSearchSchemaUsed,
  TFullSearchSchema extends Record<string, any> = TSearchSchema,
  TParams extends AnyPathParams = AnyPathParams,
  TAllParams extends AnyPathParams = TParams,
  TRouteContext extends RouteContext = RouteContext,
  TAllContext extends Record<string, any> = AnyContext,
  TLoaderDeps extends Record<string, any> = {},
  TLoaderData extends any = unknown,
> = BaseRouteOptions<
  TParentRoute,
  TCustomId,
  TPath,
  TSearchSchemaInput,
  TSearchSchema,
  TSearchSchemaUsed,
  TFullSearchSchemaInput,
  TFullSearchSchema,
  TParams,
  TAllParams,
  TRouteContext,
  TAllContext,
  TLoaderDeps,
  TLoaderData
> &
  UpdatableRouteOptions<NoInfer<TFullSearchSchema>>

export type ParamsFallback<
  TPath extends string,
  TParams,
> = unknown extends TParams ? Record<ParsePathParams<TPath>, string> : TParams

export type BaseRouteOptions<
  TParentRoute extends AnyRoute = AnyRoute,
  TCustomId extends string = string,
  TPath extends string = string,
  TSearchSchemaInput extends Record<string, any> = {},
  TSearchSchema extends Record<string, any> = {},
  TSearchSchemaUsed extends Record<string, any> = {},
  TFullSearchSchemaInput extends Record<string, any> = TSearchSchemaUsed,
  TFullSearchSchema extends Record<string, any> = TSearchSchema,
  TParams extends AnyPathParams = {},
  TAllParams = ParamsFallback<TPath, TParams>,
  TRouteContext extends RouteContext = RouteContext,
  TAllContext extends Record<string, any> = AnyContext,
  TLoaderDeps extends Record<string, any> = {},
  TLoaderData extends any = unknown,
> = RoutePathOptions<TCustomId, TPath> & {
  getParentRoute: () => TParentRoute
  validateSearch?: SearchSchemaValidator<TSearchSchemaInput, TSearchSchema>
  shouldReload?:
    | boolean
    | ((
        match: LoaderFnContext<
          TAllParams,
          TFullSearchSchema,
          TAllContext,
          TRouteContext
        >,
      ) => any)
} & (keyof PickRequired<RouteContext> extends never
    ? // This async function is called before a route is loaded.
      // If an error is thrown here, the route's loader will not be called.
      // If thrown during a navigation, the navigation will be cancelled and the error will be passed to the `onError` function.
      // If thrown during a preload event, the error will be logged to the console.
      {
        beforeLoad?: BeforeLoadFn<
          TFullSearchSchema,
          TParentRoute,
          TAllParams,
          TRouteContext
        >
      }
    : {
        beforeLoad: BeforeLoadFn<
          TFullSearchSchema,
          TParentRoute,
          TAllParams,
          TRouteContext
        >
      }) & {
    loaderDeps?: (opts: { search: TFullSearchSchema }) => TLoaderDeps
    loader?: RouteLoaderFn<
      TAllParams,
      NoInfer<TLoaderDeps>,
      NoInfer<TAllContext>,
      NoInfer<TRouteContext>,
      TLoaderData
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
  TRouteContext,
> = (opts: {
  search: TFullSearchSchema
  abortController: AbortController
  preload: boolean
  params: TAllParams
  context: TParentRoute['types']['allContext']
  location: ParsedLocation
  navigate: NavigateFn<AnyRoute>
  buildLocation: BuildLocationFn<TParentRoute>
  cause: 'preload' | 'enter' | 'stay'
}) => Promise<TRouteContext> | TRouteContext | void

export type UpdatableRouteOptions<
  TFullSearchSchema extends Record<string, any>,
> = MetaOptions & {
  // test?: (args: TAllContext) => void
  // If true, this route will be matched as case-sensitive
  caseSensitive?: boolean
  // If true, this route will be forcefully wrapped in a suspense boundary
  wrapInSuspense?: boolean
  // The content to be rendered when the route is matched. If no component is provided, defaults to `<Outlet />`
  component?: RouteComponent
  errorComponent?: false | null | ErrorRouteComponent
  pendingComponent?: RouteComponent
  pendingMs?: number
  pendingMinMs?: number
  staleTime?: number
  gcTime?: number
  preloadStaleTime?: number
  preloadGcTime?: number
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
  onStay?: (match: AnyRouteMatch) => void
  onLeave?: (match: AnyRouteMatch) => void
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
export type SearchSchemaValidator<TInput, TReturn> =
  | SearchSchemaValidatorObj<TInput, TReturn>
  | SearchSchemaValidatorFn<TInput, TReturn>

export type SearchSchemaValidatorObj<TInput, TReturn> = {
  parse?: SearchSchemaValidatorFn<TInput, TReturn>
}

export type SearchSchemaValidatorFn<TInput, TReturn> = (
  searchObj: TInput,
) => TReturn

export type DefinedPathParamWarning =
  'Path params cannot be redefined by child routes!'

export type ParentParams<TParentParams> = AnyPathParams extends TParentParams
  ? {}
  : {
      [Key in keyof TParentParams]?: DefinedPathParamWarning
    }

export type RouteLoaderFn<
  TAllParams = {},
  TLoaderDeps extends Record<string, any> = {},
  TAllContext extends Record<string, any> = AnyContext,
  TRouteContext extends Record<string, any> = AnyContext,
  TLoaderData extends any = unknown,
> = (
  match: LoaderFnContext<TAllParams, TLoaderDeps, TAllContext, TRouteContext>,
) => Promise<TLoaderData> | TLoaderData

export interface LoaderFnContext<
  TAllParams = {},
  TLoaderDeps extends Record<string, any> = {},
  TAllContext extends Record<string, any> = AnyContext,
  TRouteContext extends Record<string, any> = AnyContext,
> {
  abortController: AbortController
  preload: boolean
  params: TAllParams
  deps: TLoaderDeps
  context: Expand<Assign<TAllContext, TRouteContext>>
  location: ParsedLocation // Do not supply search schema here so as to demotivate people from trying to shortcut loaderDeps
  navigate: (opts: NavigateOptions<AnyRoute>) => Promise<void>
  parentMatchPromise?: Promise<void>
  cause: 'preload' | 'enter' | 'stay'
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

export type InferFullSearchSchemaInput<TRoute> = TRoute extends {
  types: {
    fullSearchSchemaInput: infer TFullSearchSchemaInput
  }
}
  ? TFullSearchSchemaInput
  : {}

export type ResolveFullSearchSchema<TParentRoute, TSearchSchema> = Expand<
  Assign<
    Omit<InferFullSearchSchema<TParentRoute>, keyof RootSearchSchema>,
    TSearchSchema
  >
>

export type ResolveFullSearchSchemaInput<TParentRoute, TSearchSchemaUsed> =
  Expand<
    Assign<
      Omit<InferFullSearchSchemaInput<TParentRoute>, keyof RootSearchSchema>,
      TSearchSchemaUsed
    >
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
    any,
    any,
    any,
    any
  > {}

export type MergeFromFromParent<T, U> = IsAny<T, U, T & U>

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
  TRouteContext: RouteContext
  TAllContext: AnyContext
  TRouterContext: AnyContext
  TChildren: unknown
  TRouteTree: AnyRoute
}

export class RouteApi<
  TId extends RouteIds<RegisteredRouter['routeTree']>,
  TRoute extends AnyRoute = RouteById<RegisteredRouter['routeTree'], TId>,
  TFullSearchSchema extends Record<
    string,
    any
  > = TRoute['types']['fullSearchSchema'],
  TAllParams extends AnyPathParams = TRoute['types']['allParams'],
  TAllContext extends Record<string, any> = TRoute['types']['allContext'],
  TLoaderDeps extends Record<string, any> = TRoute['types']['loaderDeps'],
  TLoaderData extends any = TRoute['types']['loaderData'],
> {
  id: TId

  constructor({ id }: { id: TId }) {
    this.id = id as any
  }

  useMatch = <TSelected = TAllContext>(opts?: {
    select?: (s: TAllContext) => TSelected
  }): TSelected => {
    return useMatch({ ...opts, from: this.id }) as any
  }

  useRouteContext = <TSelected = TAllContext>(opts?: {
    select?: (s: TAllContext) => TSelected
  }): TSelected => {
    return useMatch({
      ...opts,
      from: this.id,
      select: (d: any) => (opts?.select ? opts.select(d.context) : d.context),
    } as any)
  }

  useSearch = <TSelected = TFullSearchSchema>(opts?: {
    select?: (s: TFullSearchSchema) => TSelected
  }): TSelected => {
    return useSearch({ ...opts, from: this.id } as any)
  }

  useParams = <TSelected = TAllParams>(opts?: {
    select?: (s: TAllParams) => TSelected
  }): TSelected => {
    return useParams({ ...opts, from: this.id } as any)
  }

  useLoaderDeps = <TSelected = TLoaderDeps>(opts?: {
    select?: (s: TLoaderDeps) => TSelected
  }): TSelected => {
    return useLoaderDeps({ ...opts, from: this.id } as any) as any
  }

  useLoaderData = <TSelected = TLoaderData>(opts?: {
    select?: (s: TLoaderData) => TSelected
  }): TSelected => {
    return useLoaderData({ ...opts, from: this.id } as any) as any
  }
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
  TSearchSchemaInput extends RouteConstraints['TSearchSchema'] = {},
  TSearchSchema extends RouteConstraints['TSearchSchema'] = {},
  TSearchSchemaUsed extends Record<
    string,
    any
  > = TSearchSchemaInput extends SearchSchemaInput
    ? Omit<TSearchSchemaInput, keyof SearchSchemaInput>
    : TSearchSchema,
  TFullSearchSchemaInput extends Record<
    string,
    any
  > = ResolveFullSearchSchemaInput<TParentRoute, TSearchSchemaUsed>,
  TFullSearchSchema extends
    RouteConstraints['TFullSearchSchema'] = ResolveFullSearchSchema<
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
  TAllContext extends Expand<
    Assign<IsAny<TParentRoute['types']['allContext'], {}>, TRouteContext>
  > = Expand<
    Assign<IsAny<TParentRoute['types']['allContext'], {}>, TRouteContext>
  >,
  TRouterContext extends RouteConstraints['TRouterContext'] = AnyContext,
  TLoaderDeps extends Record<string, any> = {},
  TLoaderData extends any = unknown,
  TChildren extends RouteConstraints['TChildren'] = unknown,
  TRouteTree extends RouteConstraints['TRouteTree'] = AnyRoute,
> {
  isRoot: TParentRoute extends Route<any> ? true : false
  options: RouteOptions<
    TParentRoute,
    TCustomId,
    TPath,
    TSearchSchemaInput,
    TSearchSchema,
    TSearchSchemaUsed,
    TFullSearchSchemaInput,
    TFullSearchSchema,
    TParams,
    TAllParams,
    TRouteContext,
    TAllContext,
    TLoaderDeps,
    TLoaderData
  >

  test!: Expand<
    Assign<IsAny<TParentRoute['types']['allContext'], {}>, TRouteContext>
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
      TSearchSchemaInput,
      TSearchSchema,
      TSearchSchemaUsed,
      TFullSearchSchemaInput,
      TFullSearchSchema,
      TParams,
      TAllParams,
      TRouteContext,
      TAllContext,
      TLoaderDeps,
      TLoaderData
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
    searchSchema: TSearchSchema
    searchSchemaInput: TSearchSchemaInput
    searchSchemaUsed: TSearchSchemaUsed
    fullSearchSchema: TFullSearchSchema
    fullSearchSchemaInput: TFullSearchSchemaInput
    params: TParams
    allParams: TAllParams
    routeContext: TRouteContext
    allContext: TAllContext
    children: TChildren
    routeTree: TRouteTree
    routerContext: TRouterContext
    loaderData: TLoaderData
    loaderDeps: TLoaderDeps
  }

  init = (opts: { originalIndex: number }) => {
    this.originalIndex = opts.originalIndex

    const options = this.options as RouteOptions<
      TParentRoute,
      TCustomId,
      TPath,
      TSearchSchemaInput,
      TSearchSchema,
      TSearchSchemaUsed,
      TFullSearchSchemaInput,
      TFullSearchSchema,
      TParams,
      TAllParams,
      TRouteContext,
      TAllContext,
      TLoaderDeps,
      TLoaderData
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
    TSearchSchemaInput,
    TSearchSchema,
    TSearchSchemaUsed,
    TFullSearchSchemaInput,
    TFullSearchSchema,
    TParams,
    TAllParams,
    TRouteContext,
    TAllContext,
    TRouterContext,
    TLoaderDeps,
    TLoaderData,
    TNewChildren,
    TRouteTree
  > => {
    this.children = children as any
    return this as any
  }

  updateLoader = <TNewLoaderData extends any = unknown>(options: {
    loader: RouteLoaderFn<
      TAllParams,
      TLoaderDeps,
      TAllContext,
      TRouteContext,
      TNewLoaderData
    >
  }) => {
    Object.assign(this.options, options)
    return this as unknown as Route<
      TParentRoute,
      TPath,
      TFullPath,
      TCustomId,
      TId,
      TSearchSchemaInput,
      TSearchSchema,
      TSearchSchemaUsed,
      TFullSearchSchemaInput,
      TFullSearchSchema,
      TParams,
      TAllParams,
      TRouteContext,
      TAllContext,
      TRouterContext,
      TLoaderDeps,
      TNewLoaderData,
      TChildren,
      TRouteTree
    >
  }

  update = (options: UpdatableRouteOptions<TFullSearchSchema>) => {
    Object.assign(this.options, options)
    return this
  }

  useMatch = <TSelected = TAllContext>(opts?: {
    select?: (search: TAllContext) => TSelected
  }): TSelected => {
    return useMatch({ ...opts, from: this.id }) as any
  }

  useRouteContext = <TSelected = TAllContext>(opts?: {
    select?: (search: TAllContext) => TSelected
  }): TSelected => {
    return useMatch({
      ...opts,
      from: this.id,
      select: (d: any) => (opts?.select ? opts.select(d.context) : d.context),
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

  useLoaderDeps = <TSelected = TLoaderDeps>(opts?: {
    select?: (s: TLoaderDeps) => TSelected
  }): TSelected => {
    return useLoaderDeps({ ...opts, from: this.id } as any) as any
  }

  useLoaderData = <TSelected = TLoaderData>(opts?: {
    select?: (search: TLoaderData) => TSelected
  }): TSelected => {
    return useLoaderData({ ...opts, from: this.id } as any) as any
  }
}

export type AnyRootRoute = RootRoute<any, any, any, any, any, any, any>

export function rootRouteWithContext<TRouterContext extends {}>() {
  return <
    TSearchSchemaInput extends Record<string, any> = RootSearchSchema,
    TSearchSchema extends Record<string, any> = RootSearchSchema,
    TSearchSchemaUsed extends Record<string, any> = RootSearchSchema,
    TRouteContext extends RouteContext = RouteContext,
    TLoaderDeps extends Record<string, any> = {},
    TLoaderData extends any = unknown,
  >(
    options?: Omit<
      RouteOptions<
        AnyRoute, // TParentRoute
        RootRouteId, // TCustomId
        '', // TPath
        TSearchSchemaInput, // TSearchSchemaInput
        TSearchSchema, // TSearchSchema
        TSearchSchemaUsed,
        TSearchSchemaUsed, //TFullSearchSchemaInput
        TSearchSchema, // TFullSearchSchema
        {}, // TParams
        {}, // TAllParams
        TRouteContext, // TRouteContext
        Assign<TRouterContext, TRouteContext>, // TAllContext
        TLoaderDeps,
        TLoaderData // TLoaderData,
      >,
      | 'path'
      | 'id'
      | 'getParentRoute'
      | 'caseSensitive'
      | 'parseParams'
      | 'stringifyParams'
    >,
  ): RootRoute<
    TSearchSchemaInput,
    TSearchSchema,
    TSearchSchemaUsed,
    TRouteContext,
    TRouterContext
  > => {
    return new RootRoute(options) as any
  }
}

export type RootSearchSchema = {
  __TRootSearchSchema__: '__TRootSearchSchema__'
}

export class RootRoute<
  TSearchSchemaInput extends Record<string, any> = RootSearchSchema,
  TSearchSchema extends Record<string, any> = RootSearchSchema,
  TSearchSchemaUsed extends Record<string, any> = RootSearchSchema,
  TRouteContext extends RouteContext = RouteContext,
  TRouterContext extends {} = {},
  TLoaderDeps extends Record<string, any> = {},
  TLoaderData extends any = unknown,
> extends Route<
  any, // TParentRoute
  '/', // TPath
  '/', // TFullPath
  string, // TCustomId
  RootRouteId, // TId
  TSearchSchemaInput, // TSearchSchemaInput
  TSearchSchema, // TSearchSchema
  TSearchSchemaUsed,
  TSearchSchemaUsed, // TFullSearchSchemaInput
  TSearchSchema, // TFullSearchSchema
  {}, // TParams
  {}, // TAllParams
  TRouteContext, // TRouteContext
  Expand<Assign<TRouterContext, TRouteContext>>, // TAllContext
  TRouterContext, // TRouterContext
  TLoaderDeps,
  TLoaderData,
  any, // TChildren
  any // TRouteTree
> {
  constructor(
    options?: Omit<
      RouteOptions<
        AnyRoute, // TParentRoute
        RootRouteId, // TCustomId
        '', // TPath
        TSearchSchemaInput, // TSearchSchemaInput
        TSearchSchema, // TSearchSchema
        TSearchSchemaUsed,
        TSearchSchemaUsed, // TFullSearchSchemaInput
        TSearchSchema, // TFullSearchSchema
        {}, // TParams
        {}, // TAllParams
        TRouteContext, // TRouteContext
        Assign<TRouterContext, TRouteContext>, // TAllContext
        TLoaderDeps,
        TLoaderData
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

export type ErrorRouteProps = {
  error: unknown
  info: { componentStack: string }
}
//

export type ReactNode = any

export type SyncRouteComponent<TProps> =
  | ((props: TProps) => ReactNode)
  | React.LazyExoticComponent<(props: TProps) => ReactNode>

export type AsyncRouteComponent<TProps> = SyncRouteComponent<TProps> & {
  preload?: () => Promise<void>
}

export type RouteComponent<TProps = any> = SyncRouteComponent<TProps> &
  AsyncRouteComponent<TProps>

export type ErrorRouteComponent = RouteComponent<ErrorRouteProps>

export class NotFoundRoute<
  TParentRoute extends AnyRootRoute,
  TSearchSchemaInput extends Record<string, any> = {},
  TSearchSchema extends RouteConstraints['TSearchSchema'] = {},
  TSearchSchemaUsed extends RouteConstraints['TSearchSchema'] = {},
  TFullSearchSchemaInput extends
    RouteConstraints['TFullSearchSchema'] = ResolveFullSearchSchemaInput<
    TParentRoute,
    TSearchSchemaUsed
  >,
  TFullSearchSchema extends
    RouteConstraints['TFullSearchSchema'] = ResolveFullSearchSchema<
    TParentRoute,
    TSearchSchema
  >,
  TRouteContext extends RouteConstraints['TRouteContext'] = RouteContext,
  TAllContext extends Expand<
    Assign<IsAny<TParentRoute['types']['allContext'], {}>, TRouteContext>
  > = Expand<
    Assign<IsAny<TParentRoute['types']['allContext'], {}>, TRouteContext>
  >,
  TRouterContext extends RouteConstraints['TRouterContext'] = AnyContext,
  TLoaderDeps extends Record<string, any> = {},
  TLoaderData extends any = unknown,
  TChildren extends RouteConstraints['TChildren'] = unknown,
  TRouteTree extends RouteConstraints['TRouteTree'] = AnyRoute,
> extends Route<
  TParentRoute,
  '/404',
  '/404',
  '404',
  '404',
  TSearchSchemaInput,
  TSearchSchema,
  TSearchSchemaUsed,
  TFullSearchSchemaInput,
  TFullSearchSchema,
  {},
  {},
  TRouteContext,
  TAllContext,
  TRouterContext,
  TLoaderDeps,
  TLoaderData,
  TChildren,
  TRouteTree
> {
  constructor(
    options: Omit<
      RouteOptions<
        TParentRoute,
        string,
        string,
        TSearchSchemaInput,
        TSearchSchema,
        TSearchSchemaUsed,
        TFullSearchSchemaInput,
        TFullSearchSchema,
        {},
        {},
        TRouteContext,
        TAllContext,
        TLoaderDeps,
        TLoaderData
      >,
      'caseSensitive' | 'parseParams' | 'stringifyParams' | 'path' | 'id'
    >,
  ) {
    super({
      ...(options as any),
      id: '404',
    })
  }
}
