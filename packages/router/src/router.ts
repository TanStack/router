import { Store } from '@tanstack/react-store'
import invariant from 'tiny-invariant'

//

import {
  LinkInfo,
  LinkOptions,
  NavigateOptions,
  ToOptions,
  ResolveRelativePath,
} from './link'
import {
  cleanPath,
  interpolatePath,
  joinPaths,
  matchPathname,
  parsePathname,
  resolvePath,
  trimPath,
  trimPathLeft,
} from './path'
import {
  Route,
  AnySearchSchema,
  AnyRoute,
  RootRoute,
  AnyContext,
  AnyRootRoute,
  AnyPathParams,
} from './route'
import { RoutesInfo, AnyRoutesInfo, RoutesById } from './routeInfo'
import { AnyRouteMatch, RouteMatch, RouteMatchState } from './routeMatch'
import { defaultParseSearch, defaultStringifySearch } from './searchParams'
import {
  functionalUpdate,
  last,
  NoInfer,
  pick,
  PickAsRequired,
  Timeout,
  Updater,
  replaceEqualDeep,
  partialDeepEqual,
} from './utils'
import {
  createBrowserHistory,
  createMemoryHistory,
  RouterHistory,
} from './history'
import { RouteComponent } from './react'

//

declare global {
  interface Window {
    __TSR_DEHYDRATED__?: HydrationCtx
  }
}

export interface Register {
  // router: Router
}

export type AnyRouter = Router<any, any, any>

export type RegisteredRouter = Register extends {
  router: Router<infer TRoute, infer TRoutesInfo>
}
  ? Router<TRoute, TRoutesInfo>
  : Router

export type RegisteredRoutesInfo = Register extends {
  router: Router<infer TRoute, infer TRoutesInfo>
}
  ? TRoutesInfo
  : AnyRoutesInfo

export interface LocationState {}

export interface ParsedLocation<
  TSearchObj extends AnySearchSchema = {},
  TState extends LocationState = LocationState,
> {
  href: string
  pathname: string
  search: TSearchObj
  searchStr: string
  state: TState
  hash: string
  key?: string
}

export interface FromLocation {
  pathname: string
  search?: unknown
  key?: string
  hash?: string
}

export type SearchSerializer = (searchObj: Record<string, any>) => string
export type SearchParser = (searchStr: string) => Record<string, any>

export type HydrationCtx = {
  router: DehydratedRouter
  payload: Record<string, any>
}

type RouterContextOptions<TRouteTree extends AnyRoute> =
  AnyContext extends TRouteTree['__types']['routerContext']
    ? {
        context?: TRouteTree['__types']['routerContext']
      }
    : {
        context: TRouteTree['__types']['routerContext']
      }

export interface RouterOptions<
  TRouteTree extends AnyRoute,
  TDehydrated extends Record<string, any>,
> {
  history?: RouterHistory
  stringifySearch?: SearchSerializer
  parseSearch?: SearchParser
  defaultPreload?: false | 'intent'
  defaultPreloadDelay?: number
  defaultComponent?: RouteComponent
  defaultErrorComponent?: RouteComponent<{
    error: Error
    info: { componentStack: string }
  }>
  defaultPendingComponent?: RouteComponent
  defaultLoaderMaxAge?: number
  defaultLoaderGcMaxAge?: number
  caseSensitive?: boolean
  routeTree?: TRouteTree
  basepath?: string
  createRoute?: (opts: { route: AnyRoute; router: AnyRouter }) => void
  onRouteChange?: () => void
  fetchServerDataFn?: FetchServerDataFn
  context?: TRouteTree['__types']['routerContext']
  Wrap?: React.ComponentType<{ children: React.ReactNode }>
  dehydrate?: () => TDehydrated
  hydrate?: (dehydrated: TDehydrated) => void
}

type FetchServerDataFn = (ctx: {
  router: AnyRouter
  routeMatch: RouteMatch
}) => Promise<any>

export interface RouterState<
  TRoutesInfo extends AnyRoutesInfo = AnyRoutesInfo,
  TState extends LocationState = LocationState,
> {
  status: 'idle' | 'pending'
  matches: RouteMatch<TRoutesInfo, TRoutesInfo['routeIntersection']>[]
  location: ParsedLocation<TRoutesInfo['fullSearchSchema'], TState>
  currentLocation: ParsedLocation<TRoutesInfo['fullSearchSchema'], TState>
  lastUpdated: number
}

export type ListenerFn = () => void

export interface BuildNextOptions {
  to?: string | number | null
  params?: true | Updater<unknown>
  search?: true | Updater<unknown>
  hash?: true | Updater<string>
  state?: LocationState
  key?: string
  from?: string
  fromCurrent?: boolean
  __matches?: RouteMatch[]
}

export type MatchCacheEntry = {
  gc: number
  match: RouteMatch
}

export interface MatchLocation {
  to?: string | number | null
  fuzzy?: boolean
  caseSensitive?: boolean
  from?: string
  fromCurrent?: boolean
}

export interface MatchRouteOptions {
  pending?: boolean
  caseSensitive?: boolean
  includeSearch?: boolean
  fuzzy?: boolean
}

type LinkCurrentTargetElement = {
  preloadTimeout?: null | ReturnType<typeof setTimeout>
}

export interface DehydratedRouterState
  extends Pick<RouterState, 'status' | 'location' | 'lastUpdated'> {
  // matches: DehydratedRouteMatch[]
}

export interface DehydratedRouter {
  state: DehydratedRouterState
}

export type MatchCache = Record<string, MatchCacheEntry>

interface DehydratedRouteMatch {
  id: string
  promiseKeys: string[]
  // state: Pick<RouteMatchState<any, any>, 'status'>
}

export const defaultFetchServerDataFn: FetchServerDataFn = async ({
  router,
  routeMatch,
}) => {
  const next = router.buildNext({
    to: '.',
    search: (d: any) => ({
      ...(d ?? {}),
      __data: {
        matchId: routeMatch.id,
      },
    }),
  })

  const res = await fetch(next.href, {
    method: 'GET',
    signal: routeMatch.abortController.signal,
  })

  if (res.ok) {
    return res.json()
  }

  throw new Error('Failed to fetch match data')
}

export type RouterConstructorOptions<
  TRouteTree extends AnyRoute,
  TDehydrated extends Record<string, any>,
> = Omit<RouterOptions<TRouteTree, TDehydrated>, 'context'> &
  RouterContextOptions<TRouteTree>

export class Router<
  TRouteTree extends AnyRoute = AnyRoute,
  TRoutesInfo extends AnyRoutesInfo = RoutesInfo<TRouteTree>,
  TDehydrated extends Record<string, any> = Record<string, any>,
> {
  types!: {
    // Super secret internal stuff
    RootRoute: TRouteTree
    RoutesInfo: TRoutesInfo
  }

  options: PickAsRequired<
    RouterOptions<TRouteTree, TDehydrated>,
    'stringifySearch' | 'parseSearch' | 'context'
  >
  context!: NonNullable<TRouteTree['__types']['routerContext']>
  history!: RouterHistory
  #unsubHistory?: () => void
  basepath!: string
  // __location: Location<TRoutesInfo['fullSearchSchema']>
  routeTree!: RootRoute
  routesById!: RoutesById<TRoutesInfo>
  navigateTimeout: undefined | Timeout
  nextAction: undefined | 'push' | 'replace'
  navigationPromise: undefined | Promise<void>

  __store: Store<RouterState<TRoutesInfo>>
  state: RouterState<TRoutesInfo>
  startedLoadingAt = Date.now()
  resolveNavigation: () => void = () => {}

  constructor(options?: RouterConstructorOptions<TRouteTree, TDehydrated>) {
    this.options = {
      defaultPreloadDelay: 50,
      context: undefined!,
      ...options,
      stringifySearch: options?.stringifySearch ?? defaultStringifySearch,
      parseSearch: options?.parseSearch ?? defaultParseSearch,
      fetchServerDataFn: options?.fetchServerDataFn ?? defaultFetchServerDataFn,
    }

    this.__store = new Store<RouterState<TRoutesInfo>>(
      getInitialRouterState(),
      {
        onUpdate: () => {
          this.state = this.__store.state
        },
      },
    )
    this.state = this.__store.state

    this.update(options)

    const next = this.buildNext({
      hash: true,
      fromCurrent: true,
      search: true,
      state: true,
    })

    if (this.state.location.href !== next.href) {
      this.#commitLocation({ ...next, replace: true })
    }

    if (typeof document !== 'undefined') {
      this.hydrate()
    }
  }

  reset = () => {
    this.__store.setState((s) => Object.assign(s, getInitialRouterState()))
  }

  mount = () => {
    // Mount only does anything on the client
    if (!isServer) {
      // If the router matches are empty, start loading the matches
      if (!this.state.matches.length) {
        this.safeLoad()
      }
    }

    return () => {}
  }

  update = (opts?: RouterOptions<any, any>): this => {
    Object.assign(this.options, opts)

    this.context = this.options.context

    if (
      !this.history ||
      (this.options.history && this.options.history !== this.history)
    ) {
      if (this.#unsubHistory) {
        this.#unsubHistory()
      }

      this.history =
        this.options.history ??
        (isServer ? createMemoryHistory() : createBrowserHistory()!)

      const parsedLocation = this.#parseLocation()

      this.__store.setState((s) => ({
        ...s,
        currentLocation: parsedLocation,
        location: parsedLocation,
      }))

      this.#unsubHistory = this.history.listen(() => {
        this.safeLoad({
          next: this.#parseLocation(this.state.location),
        })
      })
    }

    const { basepath, routeTree } = this.options

    this.basepath = `/${trimPath(basepath ?? '') ?? ''}`

    if (routeTree) {
      this.routesById = {} as any
      this.routeTree = this.#buildRouteTree(routeTree) as RootRoute
    }

    return this
  }

  buildNext = (opts: BuildNextOptions): ParsedLocation => {
    const next = this.#buildLocation(opts)

    const __matches = this.matchRoutes(next.pathname, next.search)

    return this.#buildLocation({
      ...opts,
      __matches,
    })
  }

  cancelMatches = () => {
    ;[...this.state.matches].forEach((match) => {
      match.cancel()
    })
  }

  safeLoad = (opts?: { next?: ParsedLocation }) => {
    this.load(opts).catch((err) => {
      console.warn(err)
      invariant(false, 'Encountered an error during router.load()! ☝️.')
    })
  }

  load = async (opts?: { next?: ParsedLocation }): Promise<void> => {
    this.#createNavigationPromise()

    let now = Date.now()
    const startedAt = now
    this.startedLoadingAt = startedAt

    // Cancel any pending matches
    this.cancelMatches()

    let matches!: RouteMatch<any, any>[]

    this.__store.batch(() => {
      if (opts?.next) {
        // Ingest the new location
        this.__store.setState((s) => ({
          ...s,
          location: opts.next!,
        }))
      }

      // Match the routes
      matches = this.matchRoutes(
        this.state.location.pathname,
        this.state.location.search,
        {
          strictParseParams: true,
          debug: true,
        },
      )

      this.__store.setState((s) => ({
        ...s,
        status: 'pending',
        matches: matches,
      }))
    })

    // Load the matches
    await this.loadMatches(matches, this.state.location)

    if (this.startedLoadingAt !== startedAt) {
      // Ignore side-effects of outdated side-effects
      return this.navigationPromise
    }

    const previousMatches = this.state.matches

    const exiting: AnyRouteMatch[] = [],
      staying: AnyRouteMatch[] = []

    previousMatches.forEach((d) => {
      if (matches.find((dd) => dd.id === d.id)) {
        staying.push(d)
      } else {
        exiting.push(d)
      }
    })

    const entering = matches.filter((d) => {
      return !previousMatches.find((dd) => dd.id === d.id)
    })

    now = Date.now()

    exiting.forEach((d) => {
      d.__onExit?.({
        params: d.params,
        search: d.state.routeSearch,
      })

      // Clear non-loading error states when match leaves
      if (d.state.status === 'error') {
        this.__store.setState((s) => ({
          ...s,
          status: 'idle',
          error: undefined,
        }))
      }
    })

    staying.forEach((d) => {
      d.route.options.onTransition?.({
        params: d.params,
        search: d.state.routeSearch,
      })
    })

    entering.forEach((d) => {
      d.__onExit = d.route.options.onLoaded?.({
        params: d.params,
        search: d.state.search,
      })
    })

    const prevLocation = this.state.location

    this.__store.setState((s) => ({
      ...s,
      status: 'idle',
      currentLocation: s.location,
      matches: matches,
    }))

    matches.forEach((match) => {
      match.__commit()
    })

    if (prevLocation!.href !== this.state.location.href) {
      this.options.onRouteChange?.()
    }

    this.resolveNavigation()
  }

  getRoute = <TId extends keyof TRoutesInfo['routesById']>(
    id: TId,
  ): TRoutesInfo['routesById'][TId] => {
    const route = this.routesById[id]

    invariant(route, `Route with id "${id as string}" not found`)

    return route
  }

  loadRoute = async (
    navigateOpts: BuildNextOptions = this.state.location,
  ): Promise<RouteMatch[]> => {
    const next = this.buildNext(navigateOpts)
    const matches = this.matchRoutes(next.pathname, next.search, {
      strictParseParams: true,
    })
    await this.loadMatches(matches, next)
    return matches
  }

  preloadRoute = async (
    navigateOpts: BuildNextOptions = this.state.location,
  ) => {
    const next = this.buildNext(navigateOpts)
    const matches = this.matchRoutes(next.pathname, next.search, {
      strictParseParams: true,
    })

    await this.loadMatches(matches, next, {
      preload: true,
    })
    return matches
  }

  matchRoutes = (
    pathname: string,
    search: AnySearchSchema,
    opts?: { strictParseParams?: boolean; debug?: boolean },
  ): RouteMatch[] => {
    // If there's no route tree, we can't match anything
    if (!this.routeTree) {
      return []
    }

    // Existing matches are matches that are already loaded along with
    // pending matches that are still loading
    const existingMatches = [...this.state.matches]

    // We need to "flatten" layout routes, but only process as many
    // routes as we need to in order to find the best match
    // This mean no looping over all of the routes for the best perf.
    // Time to bust out the recursion... As we iterate over the routes,
    // we'll keep track of the best match thus far by pushing or popping
    // it onto the `matchingRoutes` array. In the case of a layout route,
    // we'll assume that it matches and just recurse into its children.
    // If we come up with nothing, we'll pop it off and try the next route.
    // This way the user can have as many routes, including layout routes,
    // as they want without worrying about performance.
    // It does make one assumption though: that route branches are ordered from
    // most specific to least specific. This is a good assumption to make IMO.
    // For now, we also auto-rank routes like Remix and React Router which is a neat trick
    // that unfortunately requires looping over all of the routes when we build the route
    // tree, but we only do that once. For the matching that will be happening more often,
    // I'd rather err on the side of performance here and be able to walk the tree and
    // exit early as soon as possible with as little looping/mapping as possible.

    let matchingRoutesAndParams: { route: AnyRoute; params?: AnyPathParams }[] =
      []

    // For any given array of branching routes, find the best route match
    // and push it onto the `matchingRoutes` array
    const findRoutes = (
      routes: AnyRoute[],
      layoutRoutes: AnyRoute[] = [],
    ): undefined | Route => {
      let foundRoute: undefined | Route
      let foundParams: undefined | AnyPathParams
      // Given a list of routes, find the first route that matches
      routes.some((route) => {
        const children = route.children as undefined | Route[]
        // If there is no path, but there are children,
        // this is a layout route, so recurse again
        if (!route.path && children?.length) {
          const childMatch = findRoutes(children, [...layoutRoutes, route])
          // If we found a child match, mark it as found
          // and return true to stop the loop
          if (childMatch) {
            foundRoute = childMatch
            foundParams = undefined
            return true
          }
          return false
        }

        // If the route isn't an index route or it has children,
        // fuzzy match the path
        const fuzzy = route.path !== '/' || !!children?.length

        const matchedParams = matchPathname(this.basepath, pathname, {
          to: route.fullPath,
          fuzzy,
          caseSensitive:
            route.options.caseSensitive ?? this.options.caseSensitive,
        })

        // This was a match!
        if (matchedParams) {
          // Let's parse the params using the route's `parseParams` function
          let parsedParams
          try {
            parsedParams =
              route.options.parseParams?.(matchedParams!) ?? matchedParams
          } catch (err) {
            if (opts?.strictParseParams) {
              throw err
            }
          }

          foundRoute = route
          foundParams = parsedParams
          return true
        }

        return false
      })

      // If we didn't find a match in this route branch
      // return early.
      if (!foundRoute) {
        return undefined
      }

      matchingRoutesAndParams.push(...layoutRoutes.map((d) => ({ route: d })), {
        route: foundRoute,
        params: foundParams,
      })

      // If the found route has children, recurse again
      const foundChildren = foundRoute.children as any
      if (foundChildren?.length) {
        return findRoutes(foundChildren)
      }

      return foundRoute
    }

    findRoutes([this.routeTree as any])

    // Alright, by now we should have all of our
    // matching routes and their param pairs, let's
    // Turn them into actual `Match` objects and
    // accumulate the params into a single params bag
    let allParams = {}

    const matches = matchingRoutesAndParams
      .map(({ route, params }) => {
        // Add the parsed params to the accumulated params bag
        Object.assign(allParams, params)

        const interpolatedPath = interpolatePath(route.path, allParams)
        const matchId =
          interpolatePath(route.id, allParams, true) +
          (route.options.getKey?.({
            params: allParams,
            search,
          }) ?? '')

        // Waste not, want not. If we already have a match for this route,
        // reuse it. This is important for layout routes, which might stick
        // around between navigation actions that only change leaf routes.
        return (existingMatches.find((d) => d.id === matchId) ||
          new RouteMatch(this, route, {
            id: matchId,
            params: allParams,
            pathname: joinPaths([this.basepath, interpolatedPath]),
          })) as RouteMatch
      })
      .filter((d, i, all) => {
        // Filter out any duplicate matches
        // I honesty don't know why this is necessary, but it is and it's safe for now
        // Someday someone will figure out why my logic is wrong and fix it to just
        // not create duplicate matches in the first place
        return all.findIndex((dd) => dd.id === d.id) === i
      })

    return matches
  }

  loadMatches = async (
    resolvedMatches: RouteMatch[],
    location: ParsedLocation,
    opts?: {
      preload?: boolean
      // filter?: (match: RouteMatch<any, any>) => any
    },
  ) => {
    let firstBadMatchIndex: number | undefined

    // Check each match middleware to see if the route can be accessed
    try {
      await Promise.all(
        resolvedMatches.map(async (match, index) => {
          try {
            await match.route.options.beforeLoad?.({
              router: this as any,
              match,
            })
          } catch (err) {
            if (isRedirect(err)) {
              throw err
            }

            firstBadMatchIndex = firstBadMatchIndex ?? index

            const errorHandler =
              match.route.options.onBeforeLoadError ??
              match.route.options.onError
            try {
              errorHandler?.(err)
            } catch (errorHandlerErr) {
              if (isRedirect(errorHandlerErr)) {
                throw errorHandlerErr
              }

              match.__store.setState((s) => ({
                ...s,
                error: errorHandlerErr,
                status: 'error',
                updatedAt: Date.now(),
              }))
              return
            }

            match.__store.setState((s) => ({
              ...s,
              error: err,
              status: 'error',
              updatedAt: Date.now(),
            }))
          }
        }),
      )
    } catch (err) {
      if (isRedirect(err)) {
        if (!opts?.preload) {
          this.navigate(err as any)
        }
        return
      }

      throw err // we should never end up here
    }

    const validResolvedMatches = resolvedMatches.slice(0, firstBadMatchIndex)
    const matchPromises = validResolvedMatches.map(async (match, index) => {
      const parentMatch = validResolvedMatches[index - 1]

      match.__load({ preload: opts?.preload, location, parentMatch })

      await match.__loadPromise

      if (parentMatch) {
        await parentMatch.__loadPromise
      }
    })

    await Promise.all(matchPromises)
  }

  reload = () => {
    this.navigate({
      fromCurrent: true,
      replace: true,
      search: true,
    } as any)
  }

  resolvePath = (from: string, path: string) => {
    return resolvePath(this.basepath!, from, cleanPath(path))
  }

  navigate = async <TFrom extends string = '/', TTo extends string = ''>({
    from,
    to = '' as any,
    search,
    hash,
    replace,
    params,
  }: NavigateOptions<TRoutesInfo, TFrom, TTo>) => {
    // If this link simply reloads the current route,
    // make sure it has a new key so it will trigger a data refresh

    // If this `to` is a valid external URL, return
    // null for LinkUtils
    const toString = String(to)
    const fromString = typeof from === 'undefined' ? from : String(from)
    let isExternal

    try {
      new URL(`${toString}`)
      isExternal = true
    } catch (e) {}

    invariant(
      !isExternal,
      'Attempting to navigate to external url with this.navigate!',
    )

    return this.#commitLocation({
      from: fromString,
      to: toString,
      search,
      hash,
      replace,
      params,
    })
  }

  matchRoute = <
    TFrom extends string = '/',
    TTo extends string = '',
    TResolved extends string = ResolveRelativePath<TFrom, NoInfer<TTo>>,
  >(
    location: ToOptions<TRoutesInfo, TFrom, TTo>,
    opts?: MatchRouteOptions,
  ): false | TRoutesInfo['routesById'][TResolved]['__types']['allParams'] => {
    location = {
      ...location,
      to: location.to
        ? this.resolvePath(location.from ?? '', location.to)
        : undefined,
    } as any

    const next = this.buildNext(location)
    if (opts?.pending && this.state.status !== 'pending') {
      return false
    }

    const baseLocation = opts?.pending
      ? this.state.location
      : this.state.currentLocation

    if (!baseLocation) {
      return false
    }

    const match = matchPathname(this.basepath, baseLocation.pathname, {
      ...opts,
      to: next.pathname,
    }) as any

    if (!match) {
      return false
    }

    if (opts?.includeSearch ?? true) {
      return partialDeepEqual(baseLocation.search, next.search) ? match : false
    }

    return match
  }

  buildLink = <TFrom extends string = '/', TTo extends string = ''>({
    from,
    to = '.' as any,
    search,
    params,
    hash,
    target,
    replace,
    activeOptions,
    preload,
    preloadDelay: userPreloadDelay,
    disabled,
  }: LinkOptions<TRoutesInfo, TFrom, TTo>): LinkInfo => {
    // If this link simply reloads the current route,
    // make sure it has a new key so it will trigger a data refresh

    // If this `to` is a valid external URL, return
    // null for LinkUtils

    try {
      new URL(`${to}`)
      return {
        type: 'external',
        href: to,
      }
    } catch (e) {}

    const nextOpts = {
      from,
      to,
      search,
      params,
      hash,
      replace,
    }

    const next = this.buildNext(nextOpts)

    preload = preload ?? this.options.defaultPreload
    const preloadDelay =
      userPreloadDelay ?? this.options.defaultPreloadDelay ?? 0

    // Compare path/hash for matches
    const currentPathSplit = this.state.location.pathname.split('/')
    const nextPathSplit = next.pathname.split('/')
    const pathIsFuzzyEqual = nextPathSplit.every(
      (d, i) => d === currentPathSplit[i],
    )
    // Combine the matches based on user options
    const pathTest = activeOptions?.exact
      ? this.state.location.pathname === next.pathname
      : pathIsFuzzyEqual
    const hashTest = activeOptions?.includeHash
      ? this.state.location.hash === next.hash
      : true
    const searchTest =
      activeOptions?.includeSearch ?? true
        ? partialDeepEqual(this.state.location.search, next.search)
        : true

    // The final "active" test
    const isActive = pathTest && hashTest && searchTest

    // The click handler
    const handleClick = (e: MouseEvent) => {
      if (
        !disabled &&
        !isCtrlEvent(e) &&
        !e.defaultPrevented &&
        (!target || target === '_self') &&
        e.button === 0
      ) {
        e.preventDefault()

        // All is well? Navigate!
        this.#commitLocation(nextOpts as any)
      }
    }

    // The click handler
    const handleFocus = (e: MouseEvent) => {
      if (preload) {
        this.preloadRoute(nextOpts).catch((err) => {
          console.warn(err)
          console.warn('Error preloading route! ☝️')
        })
      }
    }

    const handleTouchStart = (e: TouchEvent) => {
      this.preloadRoute(nextOpts).catch((err) => {
        console.warn(err)
        console.warn('Error preloading route! ☝️')
      })
    }

    const handleEnter = (e: MouseEvent) => {
      const target = (e.target || {}) as LinkCurrentTargetElement

      if (preload) {
        if (target.preloadTimeout) {
          return
        }

        target.preloadTimeout = setTimeout(() => {
          target.preloadTimeout = null
          this.preloadRoute(nextOpts).catch((err) => {
            console.warn(err)
            console.warn('Error preloading route! ☝️')
          })
        }, preloadDelay)
      }
    }

    const handleLeave = (e: MouseEvent) => {
      const target = (e.target || {}) as LinkCurrentTargetElement

      if (target.preloadTimeout) {
        clearTimeout(target.preloadTimeout)
        target.preloadTimeout = null
      }
    }

    return {
      type: 'internal',
      next,
      handleFocus,
      handleClick,
      handleEnter,
      handleLeave,
      handleTouchStart,
      isActive,
      disabled,
    }
  }

  dehydrate = (): DehydratedRouter => {
    return {
      state: {
        ...pick(this.state, ['location', 'status', 'lastUpdated']),
        // matches: this.state.matches.map((m) => ({
        //   id: m.id,
        //   promiseKeys: Object.keys(m.__promisesByKey),
        // })),
      },
    }
  }

  hydrate = async (__do_not_use_server_ctx?: HydrationCtx) => {
    let _ctx = __do_not_use_server_ctx
    // Client hydrates from window
    if (typeof document !== 'undefined') {
      _ctx = window.__TSR_DEHYDRATED__
    }

    invariant(
      _ctx,
      'Expected to find a __TSR_DEHYDRATED__ property on window... but we did not. Did you forget to render <DehydrateRouter /> in your app?',
    )

    const ctx = _ctx

    this.options.hydrate?.(ctx.payload as any)

    this.__store.setState((s) => {
      return {
        ...s,
        ...ctx.router.state,
        matches: s.matches,
        currentLocation: ctx.router.state.location,
      }
    })

    await this.load()

    // this.state.matches.forEach((m) => {
    //   m.__promiseKeys =
    //     ctx.router.state.matches.find((d) => d.id === m.id)?.promiseKeys ?? []
    // })

    return
  }

  injectedHtml: (string | (() => Promise<string> | string))[] = []

  injectHtml = async (html: string | (() => Promise<string> | string)) => {
    this.injectedHtml.push(html)
  }

  dehydrateData = <T>(key: any, getData: T | (() => Promise<T> | T)) => {
    if (typeof document === 'undefined') {
      const strKey = typeof key === 'string' ? key : JSON.stringify(key)

      this.injectHtml(async () => {
        const data =
          typeof getData === 'function' ? await (getData as any)() : getData
        return `<script>window["__TSR__DEHYRATED__${escapeJSON(
          strKey,
        )}"] = ${JSON.stringify(data)}</script>`
      })

      return () => this.hydrateData<T>(key)
    }

    return () => undefined
  }

  hydrateData = <T = unknown>(key: any) => {
    if (typeof document !== 'undefined') {
      const strKey = typeof key === 'string' ? key : JSON.stringify(key)

      return window[`__TSR__DEHYRATED__${strKey}` as any] as T
    }

    return undefined
  }

  // resolveMatchPromise = (matchId: string, key: string, value: any) => {
  //   this.state.matches
  //     .find((d) => d.id === matchId)
  //     ?.__promisesByKey[key]?.resolve(value)
  // }

  #buildRouteTree = (routeTree: AnyRoute) => {
    const recurseRoutes = (routes: Route[], parentRoute: Route | undefined) => {
      routes.forEach((route, i) => {
        route.init({ originalIndex: i, router: this })

        const existingRoute = (this.routesById as any)[route.id]

        invariant(
          !existingRoute,
          `Duplicate routes found with id: ${String(route.id)}`,
        )
        ;(this.routesById as any)[route.id] = route

        const children = route.children as Route[]

        if (children?.length) {
          recurseRoutes(children, route)

          const range = 1 / children!.length

          route.children = children
            .map((d, i) => {
              const cleaned = trimPathLeft(cleanPath(d.path ?? '/'))
              const parsed = parsePathname(cleaned)

              while (parsed.length > 1 && parsed[0]?.value === '/') {
                parsed.shift()
              }

              const score = parsed.map((d) => {
                if (d.type === 'param') {
                  return 0.5
                }
                if (d.type === 'wildcard') {
                  return 0.25
                }
                return 1
              })

              return { child: d, cleaned, parsed, index: i, score }
            })
            .sort((a, b) => {
              const length = Math.min(a.score.length, b.score.length)
              // Sort by min available score
              for (let i = 0; i < length; i++) {
                if (a.score[i] !== b.score[i]) {
                  return b.score[i]! - a.score[i]!
                }
              }

              // Sort by min available parsed value
              for (let i = 0; i < length; i++) {
                if (a.parsed[i]!.value !== b.parsed[i]!.value) {
                  return a.parsed[i]!.value! > b.parsed[i]!.value! ? 1 : -1
                }
              }

              // Sort by length of score
              if (a.score.length !== b.score.length) {
                return b.score.length - a.score.length
              }

              // Sort by length of cleaned full path
              if (a.cleaned !== b.cleaned) {
                return a.cleaned > b.cleaned ? 1 : -1
              }

              // Sort by original index
              return a.index - b.index
            })
            .map((d) => {
              return d.child
            })
        }
      })
    }

    recurseRoutes([routeTree] as Route[], undefined)

    const recurceCheckRoutes = (
      routes: Route[],
      parentRoute: Route | undefined,
    ) => {
      routes.forEach((route) => {
        if (route.isRoot) {
          invariant(
            !parentRoute,
            'Root routes can only be used as the root of a route tree.',
          )
        } else {
          invariant(
            parentRoute ? route.parentRoute === parentRoute : true,
            `Expected a route with path "${route.path}" to be passed to its parent route "${route.parentRoute?.id}" in an addChildren() call, but was instead passed as a child of the "${parentRoute?.id}" route.`,
          )
        }

        if (route.children) {
          recurceCheckRoutes(route.children as Route[], route)
        }
      })
    }

    recurceCheckRoutes([routeTree] as Route[], undefined)

    return routeTree
  }

  #parseLocation = (previousLocation?: ParsedLocation): ParsedLocation => {
    let { pathname, search, hash, state } = this.history.location

    const parsedSearch = this.options.parseSearch(search)

    return {
      pathname: pathname,
      searchStr: search,
      search: replaceEqualDeep(previousLocation?.search, parsedSearch),
      hash: hash.split('#').reverse()[0] ?? '',
      href: `${pathname}${search}${hash}`,
      state: state as LocationState,
      key: state?.key || '__init__',
    }
  }

  #buildLocation = (dest: BuildNextOptions = {}): ParsedLocation => {
    dest.fromCurrent = dest.fromCurrent ?? dest.to === ''

    const fromPathname = dest.fromCurrent
      ? this.state.location.pathname
      : dest.from ?? this.state.location.pathname

    let pathname = resolvePath(
      this.basepath ?? '/',
      fromPathname,
      `${dest.to ?? ''}`,
    )

    const fromMatches = this.matchRoutes(
      this.state.location.pathname,
      this.state.location.search,
      {
        strictParseParams: true,
      },
    )

    const prevParams = { ...last(fromMatches)?.params }

    let nextParams =
      (dest.params ?? true) === true
        ? prevParams
        : functionalUpdate(dest.params!, prevParams)

    if (nextParams) {
      dest.__matches
        ?.map((d) => d.route.options.stringifyParams)
        .filter(Boolean)
        .forEach((fn) => {
          nextParams = { ...nextParams!, ...fn!(nextParams!) }
        })
    }

    pathname = interpolatePath(pathname, nextParams ?? {})

    const preSearchFilters =
      dest.__matches
        ?.map((match) => match.route.options.preSearchFilters ?? [])
        .flat()
        .filter(Boolean) ?? []

    const postSearchFilters =
      dest.__matches
        ?.map((match) => match.route.options.postSearchFilters ?? [])
        .flat()
        .filter(Boolean) ?? []

    // Pre filters first
    const preFilteredSearch = preSearchFilters?.length
      ? preSearchFilters?.reduce(
          (prev, next) => next(prev),
          this.state.location.search,
        )
      : this.state.location.search

    // Then the link/navigate function
    const destSearch =
      dest.search === true
        ? preFilteredSearch // Preserve resolvedFrom true
        : dest.search
        ? functionalUpdate(dest.search, preFilteredSearch) ?? {} // Updater
        : preSearchFilters?.length
        ? preFilteredSearch // Preserve resolvedFrom filters
        : {}

    // Then post filters
    const postFilteredSearch = postSearchFilters?.length
      ? postSearchFilters.reduce((prev, next) => next(prev), destSearch)
      : destSearch

    const search = replaceEqualDeep(
      this.state.location.search,
      postFilteredSearch,
    )

    const searchStr = this.options.stringifySearch(search)

    const hash =
      dest.hash === true
        ? this.state.location.hash
        : functionalUpdate(dest.hash!, this.state.location.hash)

    const hashStr = hash ? `#${hash}` : ''

    const nextState =
      dest.state === true
        ? this.state.location.state
        : functionalUpdate(dest.state, this.state.location.state)!

    return {
      pathname,
      search,
      searchStr,
      state: nextState,
      hash,
      href: this.history.createHref(`${pathname}${searchStr}${hashStr}`),
      key: dest.key,
    }
  }

  #commitLocation = async (
    location: BuildNextOptions & { replace?: boolean },
  ) => {
    const next = this.buildNext(location)
    const id = '' + Date.now() + Math.random()

    if (this.navigateTimeout) clearTimeout(this.navigateTimeout)

    let nextAction: 'push' | 'replace' = 'replace'

    if (!location.replace) {
      nextAction = 'push'
    }

    const isSameUrl = this.state.location.href === next.href

    if (isSameUrl && !next.key) {
      nextAction = 'replace'
    }

    const href = `${next.pathname}${next.searchStr}${
      next.hash ? `#${next.hash}` : ''
    }`

    this.history[nextAction === 'push' ? 'push' : 'replace'](href, {
      id,
      ...next.state,
    })

    return this.#createNavigationPromise()
  }

  #createNavigationPromise = () => {
    const previousNavigationResolve = this.resolveNavigation

    this.navigationPromise = new Promise((resolve) => {
      this.resolveNavigation = () => {
        resolve()
        previousNavigationResolve()
      }
    })

    return this.navigationPromise
  }
}

// Detect if we're in the DOM
const isServer = typeof window === 'undefined' || !window.document.createElement

function getInitialRouterState(): RouterState<any, any> {
  return {
    status: 'idle',
    currentLocation: null!,
    location: null!,
    matches: [],
    lastUpdated: Date.now(),
  }
}

function isCtrlEvent(e: MouseEvent) {
  return !!(e.metaKey || e.altKey || e.ctrlKey || e.shiftKey)
}

export type AnyRedirect = Redirect<any, any, any>

export type Redirect<
  TRoutesInfo extends AnyRoutesInfo = RegisteredRoutesInfo,
  TFrom extends TRoutesInfo['routePaths'] = '/',
  TTo extends string = '',
> = NavigateOptions<TRoutesInfo, TFrom, TTo> & {
  code?: number
}

export function redirect<
  TRoutesInfo extends AnyRoutesInfo = RegisteredRoutesInfo,
  TFrom extends TRoutesInfo['routePaths'] = '/',
  TTo extends string = '',
>(opts: Redirect<TRoutesInfo, TFrom, TTo>): Redirect<TRoutesInfo, TFrom, TTo> {
  ;(opts as any).isRedirect = true
  return opts
}

export function isRedirect(obj: any): obj is AnyRedirect {
  return !!obj?.isRedirect
}

function escapeJSON(jsonString: string) {
  return jsonString
    .replace(/\\/g, '\\\\') // Escape backslashes
    .replace(/'/g, "\\'") // Escape single quotes
    .replace(/"/g, '\\"') // Escape double quotes
}
