import { createBrowserHistory, createMemoryHistory } from '@tanstack/history'
import { Store } from '@tanstack/react-store'
import invariant from 'tiny-invariant'
import warning from 'tiny-warning'
import { rootRouteId } from './route'
import { defaultParseSearch, defaultStringifySearch } from './searchParams'
import {
  createControlledPromise,
  deepEqual,
  escapeJSON,
  functionalUpdate,
  last,
  pick,
  replaceEqualDeep,
} from './utils'
import { getRouteMatch } from './RouterProvider'
import {
  cleanPath,
  interpolatePath,
  joinPaths,
  matchPathname,
  parsePathname,
  resolvePath,
  trimPath,
  trimPathLeft,
  trimPathRight,
} from './path'
import { isRedirect } from './redirects'
import { isNotFound } from './not-found'
import type * as React from 'react'
import type {
  HistoryLocation,
  HistoryState,
  RouterHistory,
} from '@tanstack/history'

//

import type {
  AnyContext,
  AnyRoute,
  AnySearchSchema,
  ErrorRouteComponent,
  LoaderFnContext,
  NotFoundRouteComponent,
  RouteMask,
} from './route'
import type {
  FullSearchSchema,
  RouteById,
  RoutePaths,
  RoutesById,
  RoutesByPath,
} from './routeInfo'
import type {
  ControlledPromise,
  NonNullableUpdater,
  PickAsRequired,
  Timeout,
  Updater,
} from './utils'
import type { RouteComponent } from './route'
import type {
  AnyRouteMatch,
  MakeRouteMatch,
  MatchRouteOptions,
  RouteMatch,
} from './Matches'
import type { ParsedLocation } from './location'
import type { SearchParser, SearchSerializer } from './searchParams'
import type {
  BuildLocationFn,
  CommitLocationOptions,
  InjectedHtmlEntry,
  NavigateFn,
} from './RouterProvider'

import type { AnyRedirect, ResolvedRedirect } from './redirects'

import type { NotFoundError } from './not-found'
import type { NavigateOptions, ResolveRelativePath, ToOptions } from './link'
import type { NoInfer } from '@tanstack/react-store'
import type { DeferredPromiseState } from './defer'

//

declare global {
  interface Window {
    __TSR_DEHYDRATED__?: { data: string }
    __TSR_ROUTER_CONTEXT__?: React.Context<Router<any, any>>
  }
}

export interface Register {
  // router: Router
}

export type AnyRouter = Router<any, any, any, any>

export type RegisteredRouter = Register extends {
  router: infer TRouter extends AnyRouter
}
  ? TRouter
  : AnyRouter

export type HydrationCtx = {
  router: DehydratedRouter
  payload: Record<string, any>
}

export type RouterContextOptions<TRouteTree extends AnyRoute> =
  AnyContext extends TRouteTree['types']['routerContext']
    ? {
        context?: TRouteTree['types']['routerContext']
      }
    : {
        context: TRouteTree['types']['routerContext']
      }

export type TrailingSlashOption = 'always' | 'never' | 'preserve'

export interface RouterOptions<
  TRouteTree extends AnyRoute,
  TTrailingSlashOption extends TrailingSlashOption,
  TDehydrated extends Record<string, any> = Record<string, any>,
  TSerializedError extends Record<string, any> = Record<string, any>,
> {
  history?: RouterHistory
  stringifySearch?: SearchSerializer
  parseSearch?: SearchParser
  defaultPreload?: false | 'intent'
  defaultPreloadDelay?: number
  defaultComponent?: RouteComponent
  defaultErrorComponent?: ErrorRouteComponent
  defaultPendingComponent?: RouteComponent
  defaultPendingMs?: number
  defaultPendingMinMs?: number
  defaultStaleTime?: number
  defaultPreloadStaleTime?: number
  defaultPreloadGcTime?: number
  defaultViewTransition?: boolean
  notFoundMode?: 'root' | 'fuzzy'
  defaultGcTime?: number
  caseSensitive?: boolean
  routeTree?: TRouteTree
  basepath?: string
  context?: TRouteTree['types']['routerContext']
  dehydrate?: () => TDehydrated
  hydrate?: (dehydrated: TDehydrated) => void
  routeMasks?: Array<RouteMask<TRouteTree>>
  unmaskOnReload?: boolean
  Wrap?: (props: { children: any }) => React.JSX.Element
  InnerWrap?: (props: { children: any }) => React.JSX.Element
  /**
   * @deprecated
   * Use `notFoundComponent` instead.
   * See https://tanstack.com/router/v1/docs/guide/not-found-errors#migrating-from-notfoundroute for more info.
   */
  notFoundRoute?: AnyRoute
  defaultNotFoundComponent?: NotFoundRouteComponent
  transformer?: RouterTransformer
  errorSerializer?: RouterErrorSerializer<TSerializedError>
  trailingSlash?: TTrailingSlashOption
}

export interface RouterTransformer {
  stringify: (obj: unknown) => string
  parse: (str: string) => unknown
}
export interface RouterErrorSerializer<TSerializedError> {
  serialize: (err: unknown) => TSerializedError
  deserialize: (err: TSerializedError) => unknown
}

export interface RouterState<
  TRouteTree extends AnyRoute = AnyRoute,
  TRouteMatch = MakeRouteMatch<TRouteTree>,
> {
  status: 'pending' | 'idle'
  isLoading: boolean
  isTransitioning: boolean
  matches: Array<TRouteMatch>
  pendingMatches?: Array<TRouteMatch>
  cachedMatches: Array<TRouteMatch>
  location: ParsedLocation<FullSearchSchema<TRouteTree>>
  resolvedLocation: ParsedLocation<FullSearchSchema<TRouteTree>>
  statusCode: number
  redirect?: ResolvedRedirect
}

export type ListenerFn<TEvent extends RouterEvent> = (event: TEvent) => void

export interface BuildNextOptions {
  to?: string | number | null
  params?: true | Updater<unknown>
  search?: true | Updater<unknown>
  hash?: true | Updater<string>
  state?: true | NonNullableUpdater<HistoryState>
  mask?: {
    to?: string | number | null
    params?: true | Updater<unknown>
    search?: true | Updater<unknown>
    hash?: true | Updater<string>
    state?: true | NonNullableUpdater<HistoryState>
    unmaskOnReload?: boolean
  }
  from?: string
  fromSearch?: unknown
}

export interface DehydratedRouterState {
  dehydratedMatches: Array<DehydratedRouteMatch>
}

export type DehydratedRouteMatch = Pick<
  MakeRouteMatch,
  'id' | 'status' | 'updatedAt' | 'loaderData'
>

export interface DehydratedRouter {
  state: DehydratedRouterState
}

export type RouterConstructorOptions<
  TRouteTree extends AnyRoute,
  TTrailingSlashOption extends TrailingSlashOption,
  TDehydrated extends Record<string, any>,
  TSerializedError extends Record<string, any>,
> = Omit<
  RouterOptions<
    TRouteTree,
    TTrailingSlashOption,
    TDehydrated,
    TSerializedError
  >,
  'context'
> &
  RouterContextOptions<TRouteTree>

export const componentTypes = [
  'component',
  'errorComponent',
  'pendingComponent',
  'notFoundComponent',
] as const

export type RouterEvents = {
  onBeforeLoad: {
    type: 'onBeforeLoad'
    fromLocation: ParsedLocation
    toLocation: ParsedLocation
    pathChanged: boolean
  }
  onLoad: {
    type: 'onLoad'
    fromLocation: ParsedLocation
    toLocation: ParsedLocation
    pathChanged: boolean
  }
  onResolved: {
    type: 'onResolved'
    fromLocation: ParsedLocation
    toLocation: ParsedLocation
    pathChanged: boolean
  }
}

export type RouterEvent = RouterEvents[keyof RouterEvents]

export type RouterListener<TRouterEvent extends RouterEvent> = {
  eventType: TRouterEvent['type']
  fn: ListenerFn<TRouterEvent>
}

export function createRouter<
  TRouteTree extends AnyRoute,
  TTrailingSlashOption extends TrailingSlashOption,
  TDehydrated extends Record<string, any> = Record<string, any>,
  TSerializedError extends Record<string, any> = Record<string, any>,
>(
  options: RouterConstructorOptions<
    TRouteTree,
    TTrailingSlashOption,
    TDehydrated,
    TSerializedError
  >,
) {
  return new Router<
    TRouteTree,
    TTrailingSlashOption,
    TDehydrated,
    TSerializedError
  >(options)
}

export class Router<
  in out TRouteTree extends AnyRoute,
  in out TTrailingSlashOption extends TrailingSlashOption,
  in out TDehydrated extends Record<string, any> = Record<string, any>,
  in out TSerializedError extends Record<string, any> = Record<string, any>,
> {
  // Option-independent properties
  tempLocationKey: string | undefined = `${Math.round(
    Math.random() * 10000000,
  )}`
  resetNextScroll = true
  shouldViewTransition?: true = undefined
  latestLoadPromise: Promise<void> = Promise.resolve()
  subscribers = new Set<RouterListener<RouterEvent>>()
  injectedHtml: Array<InjectedHtmlEntry> = []
  dehydratedData?: TDehydrated
  viewTransitionPromise?: ControlledPromise<true>

  // Must build in constructor
  __store!: Store<RouterState<TRouteTree>>
  options!: PickAsRequired<
    Omit<
      RouterOptions<
        TRouteTree,
        TTrailingSlashOption,
        TDehydrated,
        TSerializedError
      >,
      'transformer'
    > & {
      transformer: RouterTransformer
    },
    'stringifySearch' | 'parseSearch' | 'context'
  >
  history!: RouterHistory
  latestLocation!: ParsedLocation
  basepath!: string
  routeTree!: TRouteTree
  routesById!: RoutesById<TRouteTree>
  routesByPath!: RoutesByPath<TRouteTree>
  flatRoutes!: Array<AnyRoute>

  /**
   * @deprecated Use the `createRouter` function instead
   */
  constructor(
    options: RouterConstructorOptions<
      TRouteTree,
      TTrailingSlashOption,
      TDehydrated,
      TSerializedError
    >,
  ) {
    this.update({
      defaultPreloadDelay: 50,
      defaultPendingMs: 1000,
      defaultPendingMinMs: 500,
      context: undefined!,
      ...options,
      stringifySearch: options.stringifySearch ?? defaultStringifySearch,
      parseSearch: options.parseSearch ?? defaultParseSearch,
      transformer: options.transformer ?? JSON,
    })

    if (typeof document !== 'undefined') {
      ;(window as any).__TSR__ROUTER__ = this
    }
  }

  isServer = typeof document === 'undefined'

  // These are default implementations that can optionally be overridden
  // by the router provider once rendered. We provide these so that the
  // router can be used in a non-react environment if necessary
  startReactTransition: (fn: () => void) => void = (fn) => fn()

  update = (
    newOptions: RouterConstructorOptions<
      TRouteTree,
      TTrailingSlashOption,
      TDehydrated,
      TSerializedError
    >,
  ) => {
    if (newOptions.notFoundRoute) {
      console.warn(
        'The notFoundRoute API is deprecated and will be removed in the next major version. See https://tanstack.com/router/v1/docs/guide/not-found-errors#migrating-from-notfoundroute for more info.',
      )
    }

    const previousOptions = this.options
    this.options = {
      ...this.options,
      ...newOptions,
    }

    if (
      !this.basepath ||
      (newOptions.basepath && newOptions.basepath !== previousOptions.basepath)
    ) {
      if (
        newOptions.basepath === undefined ||
        newOptions.basepath === '' ||
        newOptions.basepath === '/'
      ) {
        this.basepath = '/'
      } else {
        this.basepath = `/${trimPath(newOptions.basepath)}`
      }
    }

    if (
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      !this.history ||
      (this.options.history && this.options.history !== this.history)
    ) {
      this.history =
        this.options.history ??
        (typeof document !== 'undefined'
          ? createBrowserHistory()
          : createMemoryHistory({
              initialEntries: [this.options.basepath || '/'],
            }))
      this.latestLocation = this.parseLocation()
    }

    if (this.options.routeTree !== this.routeTree) {
      this.routeTree = this.options.routeTree as TRouteTree
      this.buildRouteTree()
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!this.__store) {
      this.__store = new Store(getInitialRouterState(this.latestLocation), {
        onUpdate: () => {
          this.__store.state = {
            ...this.state,
            cachedMatches: this.state.cachedMatches.filter(
              (d) => !['redirected'].includes(d.status),
            ),
          }
        },
      })
    }
  }

  get state() {
    return this.__store.state
  }

  buildRouteTree = () => {
    this.routesById = {} as RoutesById<TRouteTree>
    this.routesByPath = {} as RoutesByPath<TRouteTree>

    const notFoundRoute = this.options.notFoundRoute
    if (notFoundRoute) {
      notFoundRoute.init({ originalIndex: 99999999999 })
      ;(this.routesById as any)[notFoundRoute.id] = notFoundRoute
    }

    const recurseRoutes = (childRoutes: Array<AnyRoute>) => {
      childRoutes.forEach((childRoute, i) => {
        childRoute.init({ originalIndex: i })

        const existingRoute = (this.routesById as any)[childRoute.id]

        invariant(
          !existingRoute,
          `Duplicate routes found with id: ${String(childRoute.id)}`,
        )
        ;(this.routesById as any)[childRoute.id] = childRoute

        if (!childRoute.isRoot && childRoute.path) {
          const trimmedFullPath = trimPathRight(childRoute.fullPath)
          if (
            !(this.routesByPath as any)[trimmedFullPath] ||
            childRoute.fullPath.endsWith('/')
          ) {
            ;(this.routesByPath as any)[trimmedFullPath] = childRoute
          }
        }

        const children = childRoute.children

        if (children?.length) {
          recurseRoutes(children)
        }
      })
    }

    recurseRoutes([this.routeTree])

    const scoredRoutes: Array<{
      child: AnyRoute
      trimmed: string
      parsed: ReturnType<typeof parsePathname>
      index: number
      scores: Array<number>
    }> = []

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    const routes = Object.values(this.routesById) as Array<AnyRoute>

    routes.forEach((d, i) => {
      if (d.isRoot || !d.path) {
        return
      }

      const trimmed = trimPathLeft(d.fullPath)
      const parsed = parsePathname(trimmed)

      while (parsed.length > 1 && parsed[0]?.value === '/') {
        parsed.shift()
      }

      const scores = parsed.map((segment) => {
        if (segment.value === '/') {
          return 0.75
        }

        if (segment.type === 'param') {
          return 0.5
        }

        if (segment.type === 'wildcard') {
          return 0.25
        }

        return 1
      })

      scoredRoutes.push({ child: d, trimmed, parsed, index: i, scores })
    })

    this.flatRoutes = scoredRoutes
      .sort((a, b) => {
        const minLength = Math.min(a.scores.length, b.scores.length)

        // Sort by min available score
        for (let i = 0; i < minLength; i++) {
          if (a.scores[i] !== b.scores[i]) {
            return b.scores[i]! - a.scores[i]!
          }
        }

        // Sort by length of score
        if (a.scores.length !== b.scores.length) {
          return b.scores.length - a.scores.length
        }

        // Sort by min available parsed value
        for (let i = 0; i < minLength; i++) {
          if (a.parsed[i]!.value !== b.parsed[i]!.value) {
            return a.parsed[i]!.value > b.parsed[i]!.value ? 1 : -1
          }
        }

        // Sort by original index
        return a.index - b.index
      })
      .map((d, i) => {
        d.child.rank = i
        return d.child
      })
  }

  subscribe = <TType extends keyof RouterEvents>(
    eventType: TType,
    fn: ListenerFn<RouterEvents[TType]>,
  ) => {
    const listener: RouterListener<any> = {
      eventType,
      fn,
    }

    this.subscribers.add(listener)

    return () => {
      this.subscribers.delete(listener)
    }
  }

  emit = (routerEvent: RouterEvent) => {
    this.subscribers.forEach((listener) => {
      if (listener.eventType === routerEvent.type) {
        listener.fn(routerEvent)
      }
    })
  }

  checkLatest = (promise: Promise<void>): undefined | Promise<void> => {
    return this.latestLoadPromise !== promise
      ? this.latestLoadPromise
      : undefined
  }

  parseLocation = (
    previousLocation?: ParsedLocation,
  ): ParsedLocation<FullSearchSchema<TRouteTree>> => {
    const parse = ({
      pathname,
      search,
      hash,
      state,
    }: HistoryLocation): ParsedLocation<FullSearchSchema<TRouteTree>> => {
      const parsedSearch = this.options.parseSearch(search)
      const searchStr = this.options.stringifySearch(parsedSearch)

      return {
        pathname: pathname,
        searchStr,
        search: replaceEqualDeep(previousLocation?.search, parsedSearch) as any,
        hash: hash.split('#').reverse()[0] ?? '',
        href: `${pathname}${searchStr}${hash}`,
        state: replaceEqualDeep(previousLocation?.state, state),
      }
    }

    const location = parse(this.history.location)

    const { __tempLocation, __tempKey } = location.state

    if (__tempLocation && (!__tempKey || __tempKey === this.tempLocationKey)) {
      // Sync up the location keys
      const parsedTempLocation = parse(__tempLocation) as any
      parsedTempLocation.state.key = location.state.key

      delete parsedTempLocation.state.__tempLocation

      return {
        ...parsedTempLocation,
        maskedLocation: location,
      }
    }

    return location
  }

  resolvePathWithBase = (from: string, path: string) => {
    const resolvedPath = resolvePath({
      basepath: this.basepath,
      base: from,
      to: cleanPath(path),
      trailingSlash: this.options.trailingSlash,
    })
    return resolvedPath
  }

  get looseRoutesById() {
    return this.routesById as Record<string, AnyRoute>
  }

  matchRoutes = (
    pathname: string,
    locationSearch: AnySearchSchema,
    opts?: { preload?: boolean; throwOnError?: boolean },
  ): Array<AnyRouteMatch> => {
    let routeParams: Record<string, string> = {}

    const foundRoute = this.flatRoutes.find((route) => {
      const matchedParams = matchPathname(
        this.basepath,
        trimPathRight(pathname),
        {
          to: route.fullPath,
          caseSensitive:
            route.options.caseSensitive ?? this.options.caseSensitive,
          fuzzy: true,
        },
      )

      if (matchedParams) {
        routeParams = matchedParams
        return true
      }

      return false
    })

    let routeCursor: AnyRoute =
      foundRoute || (this.routesById as any)[rootRouteId]

    const matchedRoutes: Array<AnyRoute> = [routeCursor]

    let isGlobalNotFound = false

    // Check to see if the route needs a 404 entry
    if (
      // If we found a route, and it's not an index route and we have left over path
      foundRoute
        ? foundRoute.path !== '/' && routeParams['**']
        : // Or if we didn't find a route and we have left over path
          trimPathRight(pathname)
    ) {
      // If the user has defined an (old) 404 route, use it
      if (this.options.notFoundRoute) {
        matchedRoutes.push(this.options.notFoundRoute)
      } else {
        // If there is no routes found during path matching
        isGlobalNotFound = true
      }
    }

    while (routeCursor.parentRoute) {
      routeCursor = routeCursor.parentRoute
      matchedRoutes.unshift(routeCursor)
    }

    const globalNotFoundRouteId = (() => {
      if (!isGlobalNotFound) {
        return undefined
      }

      if (this.options.notFoundMode !== 'root') {
        for (let i = matchedRoutes.length - 1; i >= 0; i--) {
          const route = matchedRoutes[i]!
          if (route.children) {
            return route.id
          }
        }
      }

      return rootRouteId
    })()

    // Existing matches are matches that are already loaded along with
    // pending matches that are still loading

    const parseErrors = matchedRoutes.map((route) => {
      let parsedParamsError

      if (route.options.parseParams) {
        try {
          const parsedParams = route.options.parseParams(routeParams)
          // Add the parsed params to the accumulated params bag
          Object.assign(routeParams, parsedParams)
        } catch (err: any) {
          parsedParamsError = new PathParamError(err.message, {
            cause: err,
          })

          if (opts?.throwOnError) {
            throw parsedParamsError
          }

          return parsedParamsError
        }
      }

      return
    })

    const matches: Array<AnyRouteMatch> = []

    matchedRoutes.forEach((route, index) => {
      // Take each matched route and resolve + validate its search params
      // This has to happen serially because each route's search params
      // can depend on the parent route's search params
      // It must also happen before we create the match so that we can
      // pass the search params to the route's potential key function
      // which is used to uniquely identify the route match in state

      const parentMatch = matches[index - 1]

      const [preMatchSearch, searchError]: [Record<string, any>, any] = (() => {
        // Validate the search params and stabilize them
        const parentSearch = parentMatch?.search ?? locationSearch

        try {
          const validator =
            typeof route.options.validateSearch === 'object'
              ? route.options.validateSearch.parse
              : route.options.validateSearch

          const search = validator?.(parentSearch) ?? {}

          return [
            {
              ...parentSearch,
              ...search,
            },
            undefined,
          ]
        } catch (err: any) {
          const searchParamError = new SearchParamError(err.message, {
            cause: err,
          })

          if (opts?.throwOnError) {
            throw searchParamError
          }

          return [parentSearch, searchParamError]
        }
      })()

      // This is where we need to call route.options.loaderDeps() to get any additional
      // deps that the route's loader function might need to run. We need to do this
      // before we create the match so that we can pass the deps to the route's
      // potential key function which is used to uniquely identify the route match in state

      const loaderDeps =
        route.options.loaderDeps?.({
          search: preMatchSearch,
        }) ?? ''

      const loaderDepsHash = loaderDeps ? JSON.stringify(loaderDeps) : ''

      const interpolatedPath = interpolatePath({
        path: route.fullPath,
        params: routeParams,
      })

      const matchId =
        interpolatePath({
          path: route.id,
          params: routeParams,
          leaveWildcards: true,
        }) + loaderDepsHash

      // Waste not, want not. If we already have a match for this route,
      // reuse it. This is important for layout routes, which might stick
      // around between navigation actions that only change leaf routes.
      const existingMatch = getRouteMatch(this.state, matchId)

      const cause = this.state.matches.find((d) => d.id === matchId)
        ? 'stay'
        : 'enter'

      let match: AnyRouteMatch

      if (existingMatch) {
        match = {
          ...existingMatch,
          cause,
          params: routeParams,
        }
      } else {
        const status =
          route.options.loader || route.options.beforeLoad
            ? 'pending'
            : 'success'

        const loadPromise = createControlledPromise<void>()

        // If it's already a success, resolve the load promise
        if (status === 'success') {
          loadPromise.resolve()
        }

        match = {
          id: matchId,
          routeId: route.id,
          params: routeParams,
          pathname: joinPaths([this.basepath, interpolatedPath]),
          updatedAt: Date.now(),
          search: {} as any,
          searchError: undefined,
          status: 'pending',
          isFetching: false,
          error: undefined,
          paramsError: parseErrors[index],
          loaderPromise: Promise.resolve(),
          loadPromise,
          routeContext: undefined!,
          context: undefined!,
          abortController: new AbortController(),
          fetchCount: 0,
          cause,
          loaderDeps,
          invalid: false,
          preload: false,
          links: route.options.links?.(),
          scripts: route.options.scripts?.(),
          staticData: route.options.staticData || {},
        }
      }

      // If it's already a success, update the meta and headers
      // These may get updated again if the match is refreshed
      // due to being stale
      if (match.status === 'success') {
        match.meta = route.options.meta?.({
          params: match.params,
          loaderData: match.loaderData,
        })

        match.headers = route.options.headers?.({
          loaderData: match.loaderData,
        })
      }

      if (!opts?.preload) {
        // If we have a global not found, mark the right match as global not found
        match.globalNotFound = globalNotFoundRouteId === route.id
      }

      // Regardless of whether we're reusing an existing match or creating
      // a new one, we need to update the match's search params
      match.search = replaceEqualDeep(match.search, preMatchSearch)
      // And also update the searchError if there is one
      match.searchError = searchError

      matches.push(match)
    })

    return matches as any
  }

  cancelMatch = (id: string) => {
    getRouteMatch(this.state, id)?.abortController.abort()
  }

  cancelMatches = () => {
    this.state.pendingMatches?.forEach((match) => {
      this.cancelMatch(match.id)
    })
  }

  buildLocation: BuildLocationFn<TRouteTree> = (opts) => {
    const build = (
      dest: BuildNextOptions & {
        unmaskOnReload?: boolean
      } = {},
      matches?: Array<MakeRouteMatch<TRouteTree>>,
    ): ParsedLocation => {
      let fromPath = this.latestLocation.pathname
      let fromSearch = dest.fromSearch || this.latestLocation.search

      const fromMatches = this.matchRoutes(
        this.latestLocation.pathname,
        fromSearch,
      )

      fromPath =
        fromMatches.find((d) => d.id === dest.from)?.pathname || fromPath
      fromSearch = last(fromMatches)?.search || this.latestLocation.search

      const stayingMatches = matches?.filter((d) =>
        fromMatches.find((e) => e.routeId === d.routeId),
      )

      let pathname = dest.to
        ? this.resolvePathWithBase(fromPath, `${dest.to}`)
        : this.resolvePathWithBase(fromPath, fromPath)

      const prevParams = { ...last(fromMatches)?.params }

      let nextParams =
        (dest.params ?? true) === true
          ? prevParams
          : { ...prevParams, ...functionalUpdate(dest.params, prevParams) }

      if (Object.keys(nextParams).length > 0) {
        matches
          ?.map((d) => this.looseRoutesById[d.routeId]!.options.stringifyParams)
          .filter(Boolean)
          .forEach((fn) => {
            nextParams = { ...nextParams!, ...fn!(nextParams) }
          })
      }

      // encode all path params so the generated href is valid and stable
      Object.keys(nextParams).forEach((key) => {
        if (['*', '_splat'].includes(key)) {
          // the splat/catch-all routes shouldn't have the '/' encoded out
          nextParams[key] = encodeURI(nextParams[key])
        } else {
          nextParams[key] = encodeURIComponent(nextParams[key])
        }
      })

      pathname = interpolatePath({
        path: pathname,
        params: nextParams ?? {},
        leaveWildcards: false,
        leaveParams: opts.leaveParams,
      })

      const preSearchFilters =
        stayingMatches
          ?.map(
            (match) =>
              this.looseRoutesById[match.routeId]!.options.preSearchFilters ??
              [],
          )
          .flat()
          .filter(Boolean) ?? []

      const postSearchFilters =
        stayingMatches
          ?.map(
            (match) =>
              this.looseRoutesById[match.routeId]!.options.postSearchFilters ??
              [],
          )
          .flat()
          .filter(Boolean) ?? []

      // Pre filters first
      const preFilteredSearch = preSearchFilters.length
        ? preSearchFilters.reduce((prev, next) => next(prev), fromSearch)
        : fromSearch

      // Then the link/navigate function
      const destSearch =
        dest.search === true
          ? preFilteredSearch // Preserve resolvedFrom true
          : dest.search
            ? functionalUpdate(dest.search, preFilteredSearch) // Updater
            : preSearchFilters.length
              ? preFilteredSearch // Preserve resolvedFrom filters
              : {}

      // Then post filters
      const postFilteredSearch = postSearchFilters.length
        ? postSearchFilters.reduce((prev, next) => next(prev), destSearch)
        : destSearch

      const search = replaceEqualDeep(fromSearch, postFilteredSearch)

      const searchStr = this.options.stringifySearch(search)

      const hash =
        dest.hash === true
          ? this.latestLocation.hash
          : dest.hash
            ? functionalUpdate(dest.hash, this.latestLocation.hash)
            : undefined

      const hashStr = hash ? `#${hash}` : ''

      let nextState =
        dest.state === true
          ? this.latestLocation.state
          : dest.state
            ? functionalUpdate(dest.state, this.latestLocation.state)
            : {}

      nextState = replaceEqualDeep(this.latestLocation.state, nextState)

      return {
        pathname,
        search,
        searchStr,
        state: nextState as any,
        hash: hash ?? '',
        href: `${pathname}${searchStr}${hashStr}`,
        unmaskOnReload: dest.unmaskOnReload,
      }
    }

    const buildWithMatches = (
      dest: BuildNextOptions = {},
      maskedDest?: BuildNextOptions,
    ) => {
      const next = build(dest)
      let maskedNext = maskedDest ? build(maskedDest) : undefined

      if (!maskedNext) {
        let params = {}

        const foundMask = this.options.routeMasks?.find((d) => {
          const match = matchPathname(this.basepath, next.pathname, {
            to: d.from,
            caseSensitive: false,
            fuzzy: false,
          })

          if (match) {
            params = match
            return true
          }

          return false
        })

        if (foundMask) {
          maskedDest = {
            ...pick(opts, ['from']),
            ...foundMask,
            params,
          }
          maskedNext = build(maskedDest)
        }
      }

      const nextMatches = this.matchRoutes(next.pathname, next.search)
      const maskedMatches = maskedNext
        ? this.matchRoutes(maskedNext.pathname, maskedNext.search)
        : undefined
      const maskedFinal = maskedNext
        ? build(maskedDest, maskedMatches)
        : undefined

      const final = build(dest, nextMatches)

      if (maskedFinal) {
        final.maskedLocation = maskedFinal
      }

      return final
    }

    if (opts.mask) {
      return buildWithMatches(opts, {
        ...pick(opts, ['from']),
        ...opts.mask,
      })
    }

    return buildWithMatches(opts)
  }

  commitLocation = async ({
    startTransition,
    viewTransition,
    ...next
  }: ParsedLocation & CommitLocationOptions) => {
    const isSameUrl = this.latestLocation.href === next.href

    // If the next urls are the same and we're not replacing,
    // do nothing
    if (!isSameUrl) {
      // eslint-disable-next-line prefer-const
      let { maskedLocation, ...nextHistory } = next

      if (maskedLocation) {
        nextHistory = {
          ...maskedLocation,
          state: {
            ...maskedLocation.state,
            __tempKey: undefined,
            __tempLocation: {
              ...nextHistory,
              search: nextHistory.searchStr,
              state: {
                ...nextHistory.state,
                __tempKey: undefined!,
                __tempLocation: undefined!,
                key: undefined!,
              },
            },
          },
        }

        if (
          nextHistory.unmaskOnReload ??
          this.options.unmaskOnReload ??
          false
        ) {
          nextHistory.state.__tempKey = this.tempLocationKey
        }
      }

      if (viewTransition) {
        this.shouldViewTransition = true
      }

      this.history[next.replace ? 'replace' : 'push'](
        nextHistory.href,
        nextHistory.state,
      )
    }

    this.resetNextScroll = next.resetScroll ?? true

    return this.latestLoadPromise
  }

  buildAndCommitLocation = ({
    replace,
    resetScroll,
    startTransition,
    ...rest
  }: BuildNextOptions & CommitLocationOptions = {}) => {
    const location = this.buildLocation(rest as any)
    return this.commitLocation({
      ...location,
      startTransition,
      replace,
      resetScroll,
    })
  }

  navigate: NavigateFn = ({ from, to, ...rest }) => {
    // If this link simply reloads the current route,
    // make sure it has a new key so it will trigger a data refresh

    // If this `to` is a valid external URL, return
    // null for LinkUtils
    const toString = String(to)
    // const fromString = from !== undefined ? String(from) : from
    let isExternal

    try {
      new URL(`${toString}`)
      isExternal = true
    } catch (e) {}

    invariant(
      !isExternal,
      'Attempting to navigate to external url with this.navigate!',
    )

    return this.buildAndCommitLocation({
      ...rest,
      from,
      to,
      // to: toString,
    })
  }

  loadMatches = async ({
    checkLatest,
    location,
    matches,
    preload,
  }: {
    checkLatest: () => Promise<void> | undefined
    location: ParsedLocation
    matches: Array<AnyRouteMatch>
    preload?: boolean
  }): Promise<Array<MakeRouteMatch>> => {
    let latestPromise
    let firstBadMatchIndex: number | undefined

    const updateMatch = (
      id: string,
      updater: (match: AnyRouteMatch) => AnyRouteMatch,
      opts?: { remove?: boolean },
    ) => {
      let updated!: AnyRouteMatch
      const isPending = this.state.pendingMatches?.find((d) => d.id === id)
      const isMatched = this.state.matches.find((d) => d.id === id)

      const matchesKey = isPending
        ? 'pendingMatches'
        : isMatched
          ? 'matches'
          : 'cachedMatches'

      this.__store.setState((s) => ({
        ...s,
        [matchesKey]: opts?.remove
          ? s[matchesKey]?.filter((d) => d.id !== id)
          : s[matchesKey]?.map((d) =>
              d.id === id ? (updated = updater(d)) : d,
            ),
      }))

      return updated
    }

    try {
      await new Promise<void>((resolveAll, rejectAll) => {
        ;(async () => {
          try {
            const handleRedirectAndNotFound = (
              match: AnyRouteMatch,
              err: any,
            ) => {
              if (isRedirect(err) || isNotFound(err)) {
                updateMatch(match.id, (prev) => ({
                  ...prev,
                  status: isRedirect(err)
                    ? 'redirected'
                    : isNotFound(err)
                      ? 'notFound'
                      : 'error',
                  isFetching: false,
                  error: err,
                }))

                if (!(err as any).routeId) {
                  ;(err as any).routeId = match.routeId
                }

                if (isRedirect(err)) {
                  err = this.resolveRedirect(err)
                  throw err
                } else if (isNotFound(err)) {
                  this.handleNotFound(matches, err)
                  throw err
                }
              }
            }

            // Check each match middleware to see if the route can be accessed
            // eslint-disable-next-line prefer-const
            for (let [index, match] of matches.entries()) {
              const parentMatch = matches[index - 1]
              const route = this.looseRoutesById[match.routeId]!
              const abortController = new AbortController()
              let loadPromise = match.loadPromise

              if (match.isFetching) {
                continue
              }

              const previousResolve = loadPromise.resolve
              // Create a new one
              loadPromise = createControlledPromise<void>(
                // Resolve the old when we we resolve the new one
                previousResolve,
              )

              // Otherwise, load the route
              matches[index] = match = updateMatch(match.id, (prev) => ({
                ...prev,
                isFetching: 'beforeLoad',
                loadPromise,
              }))

              const handleSerialError = (err: any, routerCode: string) => {
                err.routerCode = routerCode
                firstBadMatchIndex = firstBadMatchIndex ?? index
                handleRedirectAndNotFound(match, err)

                try {
                  route.options.onError?.(err)
                } catch (errorHandlerErr) {
                  err = errorHandlerErr
                  handleRedirectAndNotFound(match, err)
                }

                matches[index] = match = {
                  ...match,
                  error: err,
                  status: 'error',
                  updatedAt: Date.now(),
                  abortController: new AbortController(),
                }
              }

              if (match.paramsError) {
                handleSerialError(match.paramsError, 'PARSE_PARAMS')
              }

              if (match.searchError) {
                handleSerialError(match.searchError, 'VALIDATE_SEARCH')
              }

              // if (match.globalNotFound && !preload) {
              //   handleSerialError(notFound({ _global: true }), 'NOT_FOUND')
              // }

              try {
                const parentContext =
                  parentMatch?.context ?? this.options.context ?? {}

                const pendingMs =
                  route.options.pendingMs ?? this.options.defaultPendingMs
                const pendingPromise =
                  typeof pendingMs !== 'number' || pendingMs <= 0
                    ? Promise.resolve()
                    : new Promise<void>((r) => {
                        if (pendingMs !== Infinity) setTimeout(r, pendingMs)
                      })

                const shouldPending =
                  !this.isServer &&
                  !preload &&
                  (route.options.loader || route.options.beforeLoad) &&
                  typeof pendingMs === 'number' &&
                  (route.options.pendingComponent ??
                    this.options.defaultPendingComponent)

                if (shouldPending) {
                  // If we might show a pending component, we need to wait for the
                  // pending promise to resolve before we start showing that state
                  pendingPromise.then(async () => {
                    if ((latestPromise = checkLatest())) return latestPromise
                    // Update the match and prematurely resolve the loadMatches promise so that
                    // the pending component can start rendering
                    resolveAll()
                  })
                }

                const beforeLoadContext =
                  (await route.options.beforeLoad?.({
                    search: match.search,
                    abortController,
                    params: match.params,
                    preload: !!preload,
                    context: parentContext,
                    location,
                    navigate: (opts: any) =>
                      this.navigate({ ...opts, from: match.pathname }),
                    buildLocation: this.buildLocation,
                    cause: preload ? 'preload' : match.cause,
                  })) ?? ({} as any)

                if ((latestPromise = checkLatest())) return latestPromise

                if (
                  isRedirect(beforeLoadContext) ||
                  isNotFound(beforeLoadContext)
                ) {
                  handleSerialError(beforeLoadContext, 'BEFORE_LOAD')
                }

                const context = {
                  ...parentContext,
                  ...beforeLoadContext,
                }

                matches[index] = match = {
                  ...match,
                  routeContext: replaceEqualDeep(
                    match.routeContext,
                    beforeLoadContext,
                  ),
                  context: replaceEqualDeep(match.context, context),
                  abortController,
                }
              } catch (err) {
                handleSerialError(err, 'BEFORE_LOAD')
                break
              } finally {
                updateMatch(match.id, () => match)
              }
            }

            if ((latestPromise = checkLatest())) return latestPromise

            const validResolvedMatches = matches.slice(0, firstBadMatchIndex)
            const matchPromises: Array<Promise<any>> = []

            await Promise.all(
              validResolvedMatches.map(async (match, index) => {
                const parentMatchPromise = matchPromises[index - 1]
                const route = this.looseRoutesById[match.routeId]!

                const loaderContext: LoaderFnContext = {
                  params: match.params,
                  deps: match.loaderDeps,
                  preload: !!preload,
                  parentMatchPromise,
                  abortController: match.abortController,
                  context: match.context,
                  location,
                  navigate: (opts) =>
                    this.navigate({ ...opts, from: match.pathname } as any),
                  cause: preload ? 'preload' : match.cause,
                  route,
                }

                const fetch = async () => {
                  const existing = getRouteMatch(this.state, match.id)!
                  let lazyPromise = Promise.resolve()
                  let componentsPromise = Promise.resolve() as Promise<any>
                  let loaderPromise = existing.loaderPromise

                  // If the Matches component rendered
                  // the pending component and needs to show it for
                  // a minimum duration, we''ll wait for it to resolve
                  // before committing to the match and resolving
                  // the loadPromise
                  const potentialPendingMinPromise = async () => {
                    const latestMatch = getRouteMatch(this.state, match.id)

                    if (latestMatch?.minPendingPromise) {
                      await latestMatch.minPendingPromise

                      if ((latestPromise = checkLatest()))
                        return await latestPromise

                      updateMatch(latestMatch.id, (prev) => ({
                        ...prev,
                        minPendingPromise: undefined,
                      }))
                    }
                  }

                  try {
                    if (match.isFetching === 'beforeLoad') {
                      // If the user doesn't want the route to reload, just
                      // resolve with the existing loader data

                      // if (match.fetchCount && match.status === 'success') {
                      //   resolve()
                      // }

                      // Otherwise, load the route
                      matches[index] = match = updateMatch(
                        match.id,
                        (prev) => ({
                          ...prev,
                          isFetching: 'loader',
                          fetchCount: match.fetchCount + 1,
                        }),
                      )

                      lazyPromise =
                        route.lazyFn?.().then((lazyRoute) => {
                          Object.assign(route.options, lazyRoute.options)
                        }) || Promise.resolve()

                      // If for some reason lazy resolves more lazy components...
                      // We'll wait for that before pre attempt to preload any
                      // components themselves.
                      componentsPromise = lazyPromise.then(() =>
                        Promise.all(
                          componentTypes.map(async (type) => {
                            const component = route.options[type]

                            if ((component as any)?.preload) {
                              await (component as any).preload()
                            }
                          }),
                        ),
                      )

                      // Lazy option can modify the route options,
                      // so we need to wait for it to resolve before
                      // we can use the options
                      await lazyPromise

                      if ((latestPromise = checkLatest()))
                        return await latestPromise

                      // Kick off the loader!
                      loaderPromise = route.options.loader?.(loaderContext)

                      matches[index] = match = updateMatch(
                        match.id,
                        (prev) => ({
                          ...prev,
                          loaderPromise,
                        }),
                      )
                    }

                    const loaderData = await loaderPromise
                    if ((latestPromise = checkLatest()))
                      return await latestPromise

                    handleRedirectAndNotFound(match, loaderData)

                    if ((latestPromise = checkLatest()))
                      return await latestPromise

                    await potentialPendingMinPromise()
                    if ((latestPromise = checkLatest()))
                      return await latestPromise

                    const meta = route.options.meta?.({
                      params: match.params,
                      loaderData,
                    })

                    const headers = route.options.headers?.({
                      loaderData,
                    })

                    matches[index] = match = updateMatch(match.id, (prev) => ({
                      ...prev,
                      error: undefined,
                      status: 'success',
                      isFetching: false,
                      updatedAt: Date.now(),
                      loaderData,
                      meta,
                      headers,
                    }))
                  } catch (e) {
                    let error = e
                    if ((latestPromise = checkLatest()))
                      return await latestPromise

                    await potentialPendingMinPromise()
                    if ((latestPromise = checkLatest()))
                      return await latestPromise

                    handleRedirectAndNotFound(match, e)

                    try {
                      route.options.onError?.(e)
                    } catch (onErrorError) {
                      error = onErrorError
                      handleRedirectAndNotFound(match, onErrorError)
                    }

                    matches[index] = match = updateMatch(match.id, (prev) => ({
                      ...prev,
                      error,
                      status: 'error',
                      isFetching: false,
                    }))
                  }

                  // Last but not least, wait for the the component
                  // to be preloaded before we resolve the match
                  await componentsPromise

                  if ((latestPromise = checkLatest()))
                    return await latestPromise

                  match.loadPromise.resolve()
                }

                // This is where all of the stale-while-revalidate magic happens
                const age = Date.now() - match.updatedAt

                const staleAge = preload
                  ? route.options.preloadStaleTime ??
                    this.options.defaultPreloadStaleTime ??
                    30_000 // 30 seconds for preloads by default
                  : route.options.staleTime ??
                    this.options.defaultStaleTime ??
                    0

                const shouldReloadOption = route.options.shouldReload

                // Default to reloading the route all the time
                // Allow shouldReload to get the last say,
                // if provided.
                const shouldReload =
                  typeof shouldReloadOption === 'function'
                    ? shouldReloadOption(loaderContext)
                    : shouldReloadOption

                matches[index] = match = {
                  ...match,
                  preload:
                    !!preload &&
                    !this.state.matches.find((d) => d.id === match.id),
                }

                const fetchWithRedirectAndNotFound = async () => {
                  try {
                    await fetch()
                  } catch (err) {
                    if ((latestPromise = checkLatest()))
                      return await latestPromise
                    handleRedirectAndNotFound(match, err)
                  }
                }

                // If the route is successful and still fresh, just resolve
                if (
                  match.status === 'success' &&
                  (match.invalid || (shouldReload ?? age > staleAge))
                ) {
                  fetchWithRedirectAndNotFound()
                  return
                }

                if (match.status !== 'success') {
                  await fetchWithRedirectAndNotFound()
                }
              }),
            )

            if ((latestPromise = checkLatest())) return await latestPromise

            resolveAll()
          } catch (err) {
            rejectAll(err)
          }
        })()
      })
    } catch (err) {
      if (isRedirect(err) || isNotFound(err)) {
        throw err
      }
    }

    return matches
  }

  invalidate = () => {
    const invalidate = (d: MakeRouteMatch<TRouteTree>) => ({
      ...d,
      invalid: true,
      ...(d.status === 'error' ? ({ status: 'pending' } as const) : {}),
    })

    this.__store.setState((s) => ({
      ...s,
      matches: s.matches.map(invalidate),
      cachedMatches: s.cachedMatches.map(invalidate),
      pendingMatches: s.pendingMatches?.map(invalidate),
    }))

    return this.load()
  }

  load = async (): Promise<void> => {
    let resolveLoad!: (value: void) => void
    let rejectLoad!: (reason: any) => void

    const promise = new Promise<void>((resolve, reject) => {
      resolveLoad = resolve
      rejectLoad = reject
    })

    this.latestLoadPromise = promise

    let latestPromise: Promise<void> | undefined | null

    this.startReactTransition(async () => {
      try {
        const next = this.latestLocation
        const prevLocation = this.state.resolvedLocation
        const pathDidChange = prevLocation.href !== next.href

        // Cancel any pending matches
        this.cancelMatches()

        this.emit({
          type: 'onBeforeLoad',
          fromLocation: prevLocation,
          toLocation: next,
          pathChanged: pathDidChange,
        })

        let pendingMatches!: Array<AnyRouteMatch>
        const previousMatches = this.state.matches

        this.__store.batch(() => {
          this.cleanCache()

          // Match the routes
          pendingMatches = this.matchRoutes(next.pathname, next.search)

          // Ingest the new matches
          // If a cached moved to pendingMatches, remove it from cachedMatches
          this.__store.setState((s) => ({
            ...s,
            status: 'pending',
            isLoading: true,
            location: next,
            pendingMatches,
            cachedMatches: s.cachedMatches.filter((d) => {
              return !pendingMatches.find((e) => e.id === d.id)
            }),
          }))
        })

        let redirect: ResolvedRedirect | undefined
        let notFound: NotFoundError | undefined

        const loadMatches = () =>
          this.loadMatches({
            matches: pendingMatches,
            location: next,
            checkLatest: () => this.checkLatest(promise),
          })

        // If we are on the server or non-first load on the client, await
        // the loadMatches before transitioning
        if (previousMatches.length || this.isServer) {
          try {
            await loadMatches()
          } catch (err) {
            if (isRedirect(err)) {
              redirect = err as ResolvedRedirect
            } else if (isNotFound(err)) {
              notFound = err
            }
          }
        } else {
          // For client-only first loads, we need to start the transition
          // immediately and load the matches in the background
          loadMatches().catch((err) => {
            // This also means that we need to handle any redirects
            // that might happen during the load/transition
            if (isRedirect(err)) {
              this.navigate({ ...err, replace: true })
            }
            // Because our history listener isn't guaranteed to be mounted
            // on the first load, we need to manually call load again
            this.load()
          })
        }

        // Only apply the latest transition
        if ((latestPromise = this.checkLatest(promise))) {
          return latestPromise
        }

        const exitingMatches = previousMatches.filter(
          (match) => !pendingMatches.find((d) => d.id === match.id),
        )
        const enteringMatches = pendingMatches.filter(
          (match) => !previousMatches.find((d) => d.id === match.id),
        )
        const stayingMatches = previousMatches.filter((match) =>
          pendingMatches.find((d) => d.id === match.id),
        )

        // Determine if we should start a view transition from the navigation
        // or from the router default
        const shouldViewTransition =
          this.shouldViewTransition ?? this.options.defaultViewTransition

        // Reset the view transition flag
        delete this.shouldViewTransition

        const apply = () => {
          // this.viewTransitionPromise = createControlledPromise<true>()

          // Commit the pending matches. If a previous match was
          // removed, place it in the cachedMatches
          this.__store.batch(() => {
            this.__store.setState((s) => ({
              ...s,
              isLoading: false,
              matches: s.pendingMatches!,
              pendingMatches: undefined,
              cachedMatches: [
                ...s.cachedMatches,
                ...exitingMatches.filter((d) => d.status !== 'error'),
              ],
              statusCode:
                redirect?.statusCode || notFound
                  ? 404
                  : s.matches.some((d) => d.status === 'error')
                    ? 500
                    : 200,
              redirect,
            }))
            this.cleanCache()
          })

          //
          ;(
            [
              [exitingMatches, 'onLeave'],
              [enteringMatches, 'onEnter'],
              [stayingMatches, 'onStay'],
            ] as const
          ).forEach(([matches, hook]) => {
            matches.forEach((match) => {
              this.looseRoutesById[match.routeId]!.options[hook]?.(match)
            })
          })

          resolveLoad()

          // return this.viewTransitionPromise
        }

        // Attempt to start a view transition (or just apply the changes if we can't)
        ;(shouldViewTransition && typeof document !== 'undefined'
          ? document
          : undefined
        )
          // @ts-expect-error
          ?.startViewTransition?.(apply) || apply()
      } catch (err) {
        // Only apply the latest transition
        if ((latestPromise = this.checkLatest(promise))) {
          return latestPromise
        }

        console.error('Load Error', err)

        rejectLoad(err)
      }
    })

    return this.latestLoadPromise
  }

  resolveRedirect = (err: AnyRedirect): ResolvedRedirect => {
    const redirect = err as ResolvedRedirect

    if (!redirect.href) {
      redirect.href = this.buildLocation(redirect as any).href
    }

    return redirect
  }

  cleanCache = () => {
    // This is where all of the garbage collection magic happens
    this.__store.setState((s) => {
      return {
        ...s,
        cachedMatches: s.cachedMatches.filter((d) => {
          const route = this.looseRoutesById[d.routeId]!

          if (!route.options.loader) {
            return false
          }

          // If the route was preloaded, use the preloadGcTime
          // otherwise, use the gcTime
          const gcTime =
            (d.preload
              ? route.options.preloadGcTime ?? this.options.defaultPreloadGcTime
              : route.options.gcTime ?? this.options.defaultGcTime) ??
            5 * 60 * 1000

          return d.status !== 'error' && Date.now() - d.updatedAt < gcTime
        }),
      }
    })
  }

  preloadRoute = async <
    TFrom extends RoutePaths<TRouteTree> | string = string,
    TTo extends string = '',
    TMaskFrom extends RoutePaths<TRouteTree> | string = TFrom,
    TMaskTo extends string = '',
  >(
    opts: NavigateOptions<
      Router<TRouteTree, TTrailingSlashOption, TDehydrated, TSerializedError>,
      TFrom,
      TTo,
      TMaskFrom,
      TMaskTo
    >,
  ): Promise<Array<AnyRouteMatch> | undefined> => {
    const next = this.buildLocation(opts as any)

    let matches = this.matchRoutes(next.pathname, next.search, {
      throwOnError: true,
      preload: true,
    })

    const loadedMatchIds = Object.fromEntries(
      [
        ...this.state.matches,
        ...(this.state.pendingMatches ?? []),
        ...this.state.cachedMatches,
      ].map((d) => [d.id, true]),
    )

    this.__store.batch(() => {
      matches.forEach((match) => {
        if (!loadedMatchIds[match.id]) {
          this.__store.setState((s) => ({
            ...s,
            cachedMatches: [...(s.cachedMatches as any), match],
          }))
        }
      })
    })

    // If the preload leaf match is the same as the current or pending leaf match,
    // do not preload as it could cause a mutation of the current route.
    // The user should specify proper loaderDeps (which are used to uniquely identify a route)
    // to trigger preloads for routes with the same pathname, but different deps

    const leafMatch = last(matches)
    const currentLeafMatch = last(this.state.matches)
    const pendingLeafMatch = last(this.state.pendingMatches ?? [])

    if (
      leafMatch &&
      (currentLeafMatch?.id === leafMatch.id ||
        pendingLeafMatch?.id === leafMatch.id)
    ) {
      return undefined
    }

    try {
      matches = await this.loadMatches({
        matches,
        location: next,
        preload: true,
        checkLatest: () => undefined,
      })

      return matches
    } catch (err) {
      if (isRedirect(err)) {
        return await this.preloadRoute({
          fromSearch: next.search,
          from: next.pathname,
          ...(err as any),
        })
      }
      // Preload errors are not fatal, but we should still log them
      console.error(err)
      return undefined
    }
  }

  matchRoute = <
    TFrom extends RoutePaths<TRouteTree> = '/',
    TTo extends string = '',
    TResolved = ResolveRelativePath<TFrom, NoInfer<TTo>>,
  >(
    location: ToOptions<
      Router<TRouteTree, TTrailingSlashOption, TDehydrated, TSerializedError>,
      TFrom,
      TTo
    >,
    opts?: MatchRouteOptions,
  ): false | RouteById<TRouteTree, TResolved>['types']['allParams'] => {
    const matchLocation = {
      ...location,
      to: location.to
        ? this.resolvePathWithBase((location.from || '') as string, location.to)
        : undefined,
      params: location.params || {},
      leaveParams: true,
    }
    const next = this.buildLocation(matchLocation as any)

    if (opts?.pending && this.state.status !== 'pending') {
      return false
    }

    const baseLocation = opts?.pending
      ? this.latestLocation
      : this.state.resolvedLocation

    const match = matchPathname(this.basepath, baseLocation.pathname, {
      ...opts,
      to: next.pathname,
    }) as any

    if (!match) {
      return false
    }
    if (location.params) {
      if (!deepEqual(match, location.params, true)) {
        return false
      }
    }

    if (match && (opts?.includeSearch ?? true)) {
      return deepEqual(baseLocation.search, next.search, true) ? match : false
    }

    return match
  }

  injectHtml = async (html: string | (() => Promise<string> | string)) => {
    this.injectedHtml.push(html)
  }

  // We use a token -> weak map to keep track of deferred promises
  // that are registered on the server and need to be resolved
  registeredDeferredsIds = new Map<string, {}>()
  registeredDeferreds = new WeakMap<{}, DeferredPromiseState<any>>()

  getDeferred = (uid: string) => {
    const token = this.registeredDeferredsIds.get(uid)

    if (!token) {
      return undefined
    }

    return this.registeredDeferreds.get(token)
  }

  /**
   * @deprecated Please inject your own html using the `injectHtml` method
   */
  dehydrateData = <T>(key: any, getData: T | (() => Promise<T> | T)) => {
    warning(
      false,
      `The dehydrateData method is deprecated. Please use the injectHtml method to inject your own data.`,
    )

    if (typeof document === 'undefined') {
      const strKey = typeof key === 'string' ? key : JSON.stringify(key)

      this.injectHtml(async () => {
        const id = `__TSR_DEHYDRATED__${strKey}`
        const data =
          typeof getData === 'function' ? await (getData as any)() : getData
        return `<script id='${id}' suppressHydrationWarning>
  window["__TSR_DEHYDRATED__${escapeJSON(
    strKey,
  )}"] = ${JSON.stringify(this.options.transformer.stringify(data))}
</script>`
      })

      return () => this.hydrateData<T>(key)
    }

    return () => undefined
  }

  /**
   * @deprecated Please extract your own data from scripts injected using the `injectHtml` method
   */
  hydrateData = <T = unknown>(key: any) => {
    warning(
      false,
      `The hydrateData method is deprecated. Please use the extractHtml method to extract your own data.`,
    )

    if (typeof document !== 'undefined') {
      const strKey = typeof key === 'string' ? key : JSON.stringify(key)

      return this.options.transformer.parse(
        window[`__TSR_DEHYDRATED__${strKey}` as any] as unknown as string,
      ) as T
    }

    return undefined
  }

  dehydrate = (): DehydratedRouter => {
    const pickError =
      this.options.errorSerializer?.serialize ?? defaultSerializeError

    return {
      state: {
        dehydratedMatches: this.state.matches.map((d) => ({
          ...pick(d, ['id', 'status', 'updatedAt', 'loaderData']),
          // If an error occurs server-side during SSRing,
          // send a small subset of the error to the client
          error: d.error
            ? {
                data: pickError(d.error),
                __isServerError: true,
              }
            : undefined,
        })),
      },
    }
  }

  hydrate = async (__do_not_use_server_ctx?: string) => {
    let _ctx = __do_not_use_server_ctx
    // Client hydrates from window
    if (typeof document !== 'undefined') {
      _ctx = window.__TSR_DEHYDRATED__?.data
    }

    invariant(
      _ctx,
      'Expected to find a __TSR_DEHYDRATED__ property on window... but we did not. Did you forget to render <DehydrateRouter /> in your app?',
    )

    const ctx = this.options.transformer.parse(_ctx) as HydrationCtx
    this.dehydratedData = ctx.payload as any
    this.options.hydrate?.(ctx.payload as any)
    const dehydratedState = ctx.router.state

    const matches = this.matchRoutes(
      this.state.location.pathname,
      this.state.location.search,
    ).map((match) => {
      const dehydratedMatch = dehydratedState.dehydratedMatches.find(
        (d) => d.id === match.id,
      )

      invariant(
        dehydratedMatch,
        `Could not find a client-side match for dehydrated match with id: ${match.id}!`,
      )

      const route = this.looseRoutesById[match.routeId]!

      const assets =
        dehydratedMatch.status === 'notFound' ||
        dehydratedMatch.status === 'redirected'
          ? {}
          : {
              meta: route.options.meta?.({
                params: match.params,
                loaderData: dehydratedMatch.loaderData,
              }),
              links: route.options.links?.(),
              scripts: route.options.scripts?.(),
            }

      return {
        ...match,
        ...dehydratedMatch,
        ...assets,
      }
    })

    this.__store.setState((s) => {
      return {
        ...s,
        matches: matches as any,
      }
    })
  }

  handleNotFound = (matches: Array<AnyRouteMatch>, err: NotFoundError) => {
    const matchesByRouteId = Object.fromEntries(
      matches.map((match) => [match.routeId, match]),
    ) as Record<string, AnyRouteMatch>

    // Start at the route that errored or default to the root route
    let routeCursor =
      (err.global
        ? this.looseRoutesById[rootRouteId]
        : this.looseRoutesById[err.routeId]) ||
      this.looseRoutesById[rootRouteId]!

    // Go up the tree until we find a route with a notFoundComponent or we hit the root
    while (
      !routeCursor.options.notFoundComponent &&
      !this.options.defaultNotFoundComponent &&
      routeCursor.id !== rootRouteId
    ) {
      routeCursor = routeCursor.parentRoute

      invariant(
        routeCursor,
        'Found invalid route tree while trying to find not-found handler.',
      )
    }

    const match = matchesByRouteId[routeCursor.id]

    invariant(match, 'Could not find match for route: ' + routeCursor.id)

    // Assign the error to the match
    Object.assign(match, {
      status: 'notFound',
      error: err,
      isFetching: false,
    } as AnyRouteMatch)
  }

  hasNotFoundMatch = () => {
    return this.__store.state.matches.some(
      (d) => d.status === 'notFound' || d.globalNotFound,
    )
  }

  // resolveMatchPromise = (matchId: string, key: string, value: any) => {
  //   state.matches
  //     .find((d) => d.id === matchId)
  //     ?.__promisesByKey[key]?.resolve(value)
  // }
}

// A function that takes an import() argument which is a function and returns a new function that will
// proxy arguments from the caller to the imported function, retaining all type
// information along the way
export function lazyFn<
  T extends Record<string, (...args: Array<any>) => any>,
  TKey extends keyof T = 'default',
>(fn: () => Promise<T>, key?: TKey) {
  return async (
    ...args: Parameters<T[TKey]>
  ): Promise<Awaited<ReturnType<T[TKey]>>> => {
    const imported = await fn()
    return imported[key || 'default'](...args)
  }
}

export class SearchParamError extends Error {}

export class PathParamError extends Error {}

export function getInitialRouterState(
  location: ParsedLocation,
): RouterState<any> {
  return {
    isLoading: false,
    isTransitioning: false,
    status: 'idle',
    resolvedLocation: { ...location },
    location,
    matches: [],
    pendingMatches: [],
    cachedMatches: [],
    statusCode: 200,
  }
}

export function defaultSerializeError(err: unknown) {
  if (err instanceof Error) {
    const obj = {
      name: err.name,
      message: err.message,
    }

    if (process.env.NODE_ENV === 'development') {
      ;(obj as any).stack = err.stack
    }

    return obj
  }

  return {
    data: err,
  }
}
