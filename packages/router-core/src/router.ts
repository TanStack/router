import {
  BrowserHistory,
  createBrowserHistory,
  createMemoryHistory,
  HashHistory,
  History,
  MemoryHistory,
} from 'history'
import invariant from 'tiny-invariant'
import { GetFrameworkGeneric } from './frameworks'

import {
  LinkInfo,
  LinkOptions,
  NavigateOptionsAbsolute,
  ToOptions,
  ValidFromPath,
} from './link'
import {
  cleanPath,
  interpolatePath,
  joinPaths,
  matchPathname,
  resolvePath,
} from './path'
import { AnyRoute, cascadeLoaderData, createRoute, Route } from './route'
import {
  AnyRouteConfig,
  AnySearchSchema,
  RouteConfig,
  SearchFilter,
} from './routeConfig'
import {
  AllRouteInfo,
  AnyAllRouteInfo,
  AnyRouteInfo,
  RouteInfo,
  RoutesById,
} from './routeInfo'
import { createRouteMatch, RouteMatch } from './routeMatch'
import { defaultParseSearch, defaultStringifySearch } from './searchParams'
import {
  functionalUpdate,
  last,
  PickAsRequired,
  replaceEqualDeep,
  Timeout,
  Updater,
} from './utils'

export interface LocationState {}

export interface Location<
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
export type FilterRoutesFn = <TRoute extends Route<any, RouteInfo>>(
  routeConfigs: TRoute[],
) => TRoute[]

export interface RouterOptions<TRouteConfig extends AnyRouteConfig> {
  history?: BrowserHistory | MemoryHistory | HashHistory
  stringifySearch?: SearchSerializer
  parseSearch?: SearchParser
  filterRoutes?: FilterRoutesFn
  defaultPreload?: false | 'intent'
  defaultPreloadMaxAge?: number
  defaultPreloadGcMaxAge?: number
  defaultPreloadDelay?: number
  useErrorBoundary?: boolean
  defaultElement?: GetFrameworkGeneric<'Element'>
  defaultErrorElement?: GetFrameworkGeneric<'Element'>
  defaultCatchElement?: GetFrameworkGeneric<'Element'>
  defaultPendingElement?: GetFrameworkGeneric<'Element'>
  defaultPendingMs?: number
  defaultPendingMinMs?: number
  defaultLoaderMaxAge?: number
  defaultLoaderGcMaxAge?: number
  caseSensitive?: boolean
  routeConfig?: TRouteConfig
  basepath?: string
  createRouter?: (router: Router<any, any>) => void
  createRoute?: (opts: { route: AnyRoute; router: Router<any, any> }) => void
}

export interface Action<
  TPayload = unknown,
  TResponse = unknown,
  // TError = unknown,
> {
  submit: (submission?: TPayload) => Promise<TResponse>
  current?: ActionState<TPayload, TResponse>
  latest?: ActionState<TPayload, TResponse>
  pending: ActionState<TPayload, TResponse>[]
}

export interface ActionState<
  TPayload = unknown,
  TResponse = unknown,
  // TError = unknown,
> {
  submittedAt: number
  status: 'idle' | 'pending' | 'success' | 'error'
  submission: TPayload
  data?: TResponse
  error?: unknown
}

export interface RouterState {
  status: 'idle' | 'loading'
  location: Location
  matches: RouteMatch[]
  lastUpdated: number
  loaderData: unknown
  currentAction?: ActionState
  latestAction?: ActionState
  actions: Record<string, Action>
  pending?: PendingState
  isFetching: boolean
  isPreloading: boolean
}

export interface PendingState {
  location: Location
  matches: RouteMatch[]
}

type Listener = () => void

export type ListenerFn = () => void

export interface BuildNextOptions {
  to?: string | number | null
  params?: true | Updater<Record<string, any>>
  search?: true | Updater<unknown>
  hash?: true | Updater<string>
  key?: string
  from?: string
  fromCurrent?: boolean
  __preSearchFilters?: SearchFilter<any>[]
  __postSearchFilters?: SearchFilter<any>[]
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
  pending: boolean
  caseSensitive?: boolean
}

type LinkCurrentTargetElement = {
  preloadTimeout?: null | ReturnType<typeof setTimeout>
}

export interface Router<
  TRouteConfig extends AnyRouteConfig = RouteConfig,
  TAllRouteInfo extends AnyAllRouteInfo = AllRouteInfo<TRouteConfig>,
> {
  options: PickAsRequired<
    RouterOptions<TRouteConfig>,
    'stringifySearch' | 'parseSearch'
  >
  // Computed in this.update()
  basepath: string
  // Internal:
  allRouteInfo: TAllRouteInfo
  listeners: Listener[]
  location: Location
  navigateTimeout?: Timeout
  nextAction?: 'push' | 'replace'
  state: RouterState
  routeTree: Route<TAllRouteInfo, RouteInfo>
  routesById: RoutesById<TAllRouteInfo>
  navigationPromise: Promise<void>
  removeActionQueue: { action: Action; actionState: ActionState }[]
  startedLoadingAt: number
  resolveNavigation: () => void
  subscribe: (listener: Listener) => () => void
  notify: () => void
  mount: () => () => void
  onFocus: () => void
  update: <TRouteConfig extends RouteConfig = RouteConfig>(
    opts?: RouterOptions<TRouteConfig>,
  ) => Router<TRouteConfig>
  buildRouteTree: (
    routeConfig: RouteConfig,
  ) => Route<TAllRouteInfo, AnyRouteInfo>
  parseLocation: (
    location: History['location'],
    previousLocation?: Location,
  ) => Location
  buildLocation: (dest: BuildNextOptions) => Location
  commitLocation: (next: Location, replace?: boolean) => Promise<void>
  buildNext: (opts: BuildNextOptions) => Location
  cancelMatches: () => void
  loadLocation: (next?: Location) => Promise<void>
  matchCache: Record<string, MatchCacheEntry>
  cleanMatchCache: () => void
  getRoute: <TId extends keyof TAllRouteInfo['routeInfoById']>(
    id: TId,
  ) => Route<TAllRouteInfo, TAllRouteInfo['routeInfoById'][TId]>
  loadRoute: (navigateOpts: BuildNextOptions) => Promise<RouteMatch[]>
  preloadRoute: (
    navigateOpts: BuildNextOptions,
    loaderOpts: { maxAge?: number; gcMaxAge?: number },
  ) => Promise<RouteMatch[]>
  matchRoutes: (
    pathname: string,
    opts?: { strictParseParams?: boolean },
  ) => RouteMatch[]
  loadMatches: (
    resolvedMatches: RouteMatch[],
    loaderOpts?: { withPending?: boolean } & (
      | { preload: true; maxAge: number; gcMaxAge: number }
      | { preload?: false; maxAge?: never; gcMaxAge?: never }
    ),
  ) => Promise<void>
  invalidateRoute: (opts: MatchLocation) => void
  reload: () => Promise<void>
  resolvePath: (from: string, path: string) => string
  _navigate: (
    location: BuildNextOptions & { replace?: boolean },
  ) => Promise<void>
  navigate: <
    TFrom extends ValidFromPath<TAllRouteInfo> = '/',
    TTo extends string = '.',
  >(
    opts: NavigateOptionsAbsolute<TAllRouteInfo, TFrom, TTo>,
  ) => Promise<void>
  matchRoute: <
    TFrom extends ValidFromPath<TAllRouteInfo> = '/',
    TTo extends string = '.',
  >(
    matchLocation: ToOptions<TAllRouteInfo, TFrom, TTo>,
    opts?: MatchRouteOptions,
  ) => boolean
  buildLink: <
    TFrom extends ValidFromPath<TAllRouteInfo> = '/',
    TTo extends string = '.',
  >(
    opts: LinkOptions<TAllRouteInfo, TFrom, TTo>,
  ) => LinkInfo
}

// Detect if we're in the DOM
const isServer = Boolean(
  typeof window === 'undefined' || !window.document?.createElement,
)

// This is the default history object if none is defined
const createDefaultHistory = () =>
  !isServer ? createBrowserHistory() : createMemoryHistory()

export function createRouter<
  TRouteConfig extends AnyRouteConfig = RouteConfig,
  TAllRouteInfo extends AnyAllRouteInfo = AllRouteInfo<TRouteConfig>,
>(
  userOptions?: RouterOptions<TRouteConfig>,
): Router<TRouteConfig, TAllRouteInfo> {
  const history = userOptions?.history || createDefaultHistory()

  const originalOptions = {
    defaultLoaderGcMaxAge: 5 * 60 * 1000,
    defaultLoaderMaxAge: 0,
    defaultPreloadMaxAge: 2000,
    defaultPreloadDelay: 50,
    ...userOptions,
    stringifySearch: userOptions?.stringifySearch ?? defaultStringifySearch,
    parseSearch: userOptions?.parseSearch ?? defaultParseSearch,
  }

  let router: Router<TRouteConfig, TAllRouteInfo> = {
    options: originalOptions,
    listeners: [],
    removeActionQueue: [],
    // Resolved after construction
    basepath: '',
    routeTree: undefined!,
    routesById: {} as any,
    location: undefined!,
    allRouteInfo: undefined!,
    //
    navigationPromise: Promise.resolve(),
    resolveNavigation: () => {},
    matchCache: {},
    state: {
      status: 'idle',
      location: null!,
      matches: [],
      actions: {},
      loaderData: {} as any,
      lastUpdated: Date.now(),
      isFetching: false,
      isPreloading: false,
    },
    startedLoadingAt: Date.now(),
    subscribe: (listener: Listener): (() => void) => {
      router.listeners.push(listener as Listener)
      return () => {
        router.listeners = router.listeners.filter((x) => x !== listener)
      }
    },
    getRoute: (id) => {
      return router.routesById[id]
    },
    notify: (): void => {
      router.state = {
        ...router.state,
        isFetching:
          router.state.status === 'loading' ||
          router.state.matches.some((d) => d.isFetching),
        isPreloading: Object.values(router.matchCache).some(
          (d) =>
            d.match.isFetching &&
            !router.state.matches.find((dd) => dd.matchId === d.match.matchId),
        ),
      }

      cascadeLoaderData(router.state.matches)
      router.listeners.forEach((listener) => listener())
    },

    mount: () => {
      const next = router.buildLocation({
        to: '.',
        search: true,
        hash: true,
      })

      // If the current location isn't updated, trigger a navigation
      // to the current location. Otherwise, load the current location.
      if (next.href !== router.location.href) {
        router.commitLocation(next, true)
      } else {
        router.loadLocation()
      }

      const unsub = history.listen((event) => {
        router.loadLocation(
          router.parseLocation(event.location, router.location),
        )
      })

      // addEventListener does not exist in React Native, but window does
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!isServer && window.addEventListener) {
        // Listen to visibillitychange and focus
        window.addEventListener('visibilitychange', router.onFocus, false)
        window.addEventListener('focus', router.onFocus, false)
      }

      return () => {
        unsub()
        // Be sure to unsubscribe if a new handler is set
        window.removeEventListener('visibilitychange', router.onFocus)
        window.removeEventListener('focus', router.onFocus)
      }
    },

    onFocus: () => {
      router.loadLocation()
    },

    update: (opts) => {
      Object.assign(router.options, opts)

      const { basepath, routeConfig } = router.options

      router.basepath = cleanPath(`/${basepath ?? ''}`)

      if (routeConfig) {
        router.routesById = {} as any
        router.routeTree = router.buildRouteTree(routeConfig)
      }

      return router as any
    },

    buildRouteTree: (rootRouteConfig: RouteConfig) => {
      const recurseRoutes = (
        routeConfigs: RouteConfig[],
        parent?: Route<TAllRouteInfo, any>,
      ): Route<TAllRouteInfo, any>[] => {
        return routeConfigs.map((routeConfig) => {
          const routeOptions = routeConfig.options
          const route = createRoute(routeConfig, routeOptions, parent, router)

          // {
          //   pendingMs: routeOptions.pendingMs ?? router.defaultPendingMs,
          //   pendingMinMs: routeOptions.pendingMinMs ?? router.defaultPendingMinMs,
          // }

          const existingRoute = (router.routesById as any)[route.routeId]

          if (existingRoute) {
            if (process.env.NODE_ENV !== 'production') {
              console.warn(
                `Duplicate routes found with id: ${String(route.routeId)}`,
                router.routesById,
                route,
              )
            }
            throw new Error()
          }

          ;(router.routesById as any)[route.routeId] = route

          const children = routeConfig.children as RouteConfig[]

          route.childRoutes = children?.length
            ? recurseRoutes(children, route)
            : undefined

          return route
        })
      }

      const routes = recurseRoutes([rootRouteConfig])

      return routes[0]!
    },

    parseLocation: (
      location: History['location'],
      previousLocation?: Location,
    ): Location => {
      const parsedSearch = router.options.parseSearch(location.search)

      return {
        pathname: location.pathname,
        searchStr: location.search,
        search: replaceEqualDeep(previousLocation?.search, parsedSearch),
        hash: location.hash.split('#').reverse()[0] ?? '',
        href: `${location.pathname}${location.search}${location.hash}`,
        state: location.state as LocationState,
        key: location.key,
      }
    },

    buildLocation: (dest: BuildNextOptions = {}): Location => {
      // const resolvedFrom: Location = {
      //   ...router.location,
      const fromPathname = dest.fromCurrent
        ? router.location.pathname
        : dest.from ?? router.location.pathname

      let pathname = resolvePath(
        router.basepath ?? '/',
        fromPathname,
        `${dest.to ?? '.'}`,
      )

      const fromMatches = router.matchRoutes(router.location.pathname, {
        strictParseParams: true,
      })

      const toMatches = router.matchRoutes(pathname)

      const prevParams = { ...last(fromMatches)?.params }

      let nextParams =
        (dest.params ?? true) === true
          ? prevParams
          : functionalUpdate(dest.params!, prevParams)

      if (nextParams) {
        toMatches
          .map((d) => d.options.stringifyParams)
          .filter(Boolean)
          .forEach((fn) => {
            Object.assign({}, nextParams!, fn!(nextParams!))
          })
      }

      pathname = interpolatePath(pathname, nextParams ?? {})

      // Pre filters first
      const preFilteredSearch = dest.__preSearchFilters?.length
        ? dest.__preSearchFilters.reduce(
            (prev, next) => next(prev),
            router.location.search,
          )
        : router.location.search

      // Then the link/navigate function
      const destSearch =
        dest.search === true
          ? preFilteredSearch // Preserve resolvedFrom true
          : dest.search
          ? functionalUpdate(dest.search, preFilteredSearch) ?? {} // Updater
          : dest.__preSearchFilters?.length
          ? preFilteredSearch // Preserve resolvedFrom filters
          : {}

      // Then post filters
      const postFilteredSearch = dest.__postSearchFilters?.length
        ? dest.__postSearchFilters.reduce(
            (prev, next) => next(prev),
            destSearch,
          )
        : destSearch

      const search = replaceEqualDeep(
        router.location.search,
        postFilteredSearch,
      )

      const searchStr = router.options.stringifySearch(search)
      let hash =
        dest.hash === true
          ? router.location.hash
          : functionalUpdate(dest.hash!, router.location.hash)
      hash = hash ? `#${hash}` : ''

      return {
        pathname,
        search,
        searchStr,
        state: router.location.state,
        hash,
        href: `${pathname}${searchStr}${hash}`,
        key: dest.key,
      }
    },

    commitLocation: (next: Location, replace?: boolean): Promise<void> => {
      const id = '' + Date.now() + Math.random()

      if (router.navigateTimeout) clearTimeout(router.navigateTimeout)

      let nextAction: 'push' | 'replace' = 'replace'

      if (!replace) {
        nextAction = 'push'
      }

      const isSameUrl =
        router.parseLocation(history.location).href === next.href

      if (isSameUrl && !next.key) {
        nextAction = 'replace'
      }

      if (nextAction === 'replace') {
        history.replace(
          {
            pathname: next.pathname,
            hash: next.hash,
            search: next.searchStr,
          },
          {
            id,
          },
        )
      } else {
        history.push(
          {
            pathname: next.pathname,
            hash: next.hash,
            search: next.searchStr,
          },
          {
            id,
          },
        )
      }

      router.navigationPromise = new Promise((resolve) => {
        const previousNavigationResolve = router.resolveNavigation

        router.resolveNavigation = () => {
          previousNavigationResolve()
          resolve()
        }
      })

      return router.navigationPromise
    },

    buildNext: (opts: BuildNextOptions) => {
      const next = router.buildLocation(opts)

      const matches = router.matchRoutes(next.pathname)

      const __preSearchFilters = matches
        .map((match) => match.options.preSearchFilters ?? [])
        .flat()
        .filter(Boolean)

      const __postSearchFilters = matches
        .map((match) => match.options.postSearchFilters ?? [])
        .flat()
        .filter(Boolean)

      return router.buildLocation({
        ...opts,
        __preSearchFilters,
        __postSearchFilters,
      })
    },

    cancelMatches: () => {
      ;[
        ...router.state.matches,
        ...(router.state.pending?.matches ?? []),
      ].forEach((match) => {
        match.cancel()
      })
    },

    loadLocation: async (next?: Location) => {
      const id = Math.random()
      router.startedLoadingAt = id

      if (next) {
        // Ingest the new location
        router.location = next
      }

      // Clear out old actions
      router.removeActionQueue.forEach(({ action, actionState }) => {
        if (router.state.currentAction === actionState) {
          router.state.currentAction = undefined
        }
        if (action.current === actionState) {
          action.current = undefined
        }
      })
      router.removeActionQueue = []

      // Cancel any pending matches
      router.cancelMatches()

      // Match the routes
      const matches = router.matchRoutes(location.pathname, {
        strictParseParams: true,
      })

      router.state = {
        ...router.state,
        pending: {
          matches: matches,
          location: router.location,
        },
        status: 'loading',
      }

      router.notify()

      // Load the matches
      await router.loadMatches(matches, {
        withPending: true,
      })

      if (router.startedLoadingAt !== id) {
        // Ignore side-effects of match loading
        return router.navigationPromise
      }

      const previousMatches = router.state.matches

      const exiting: RouteMatch[] = [],
        staying: RouteMatch[] = []

      previousMatches.forEach((d) => {
        if (matches.find((dd) => dd.matchId === d.matchId)) {
          staying.push(d)
        } else {
          exiting.push(d)
        }
      })

      const now = Date.now()

      exiting.forEach((d) => {
        d.__.onExit?.({
          params: d.params,
          search: d.routeSearch,
        })
        // Clear idle error states when match leaves
        if (d.status === 'error' && !d.isFetching) {
          d.status = 'idle'
          d.error = undefined
        }
        const gc = Math.max(
          d.options.loaderGcMaxAge ?? router.options.defaultLoaderGcMaxAge ?? 0,
          d.options.loaderMaxAge ?? router.options.defaultLoaderMaxAge ?? 0,
        )
        if (gc > 0) {
          router.matchCache[d.matchId] = {
            gc: gc == Infinity ? Number.MAX_SAFE_INTEGER : now + gc,
            match: d,
          }
        }
      })

      staying.forEach((d) => {
        d.options.onTransition?.({
          params: d.params,
          search: d.routeSearch,
        })
      })

      const entering = matches.filter((d) => {
        return !previousMatches.find((dd) => dd.matchId === d.matchId)
      })

      entering.forEach((d) => {
        d.__.onExit = d.options.onMatch?.({
          params: d.params,
          search: d.search,
        })
      })

      if (matches.some((d) => d.status === 'loading')) {
        router.notify()
        await Promise.all(
          matches.map((d) => d.__.loaderPromise || Promise.resolve()),
        )
      }
      if (router.startedLoadingAt !== id) {
        // Ignore side-effects of match loading
        return
      }

      router.state = {
        ...router.state,
        location: router.location,
        matches,
        pending: undefined,
        status: 'idle',
      }

      router.notify()
      router.resolveNavigation()
    },

    cleanMatchCache: () => {
      const now = Date.now()

      Object.keys(router.matchCache).forEach((matchId) => {
        const entry = router.matchCache[matchId]!

        // Don't remove loading matches
        if (entry.match.status === 'loading') {
          return
        }

        // Do not remove successful matches that are still valid
        if (entry.gc > 0 && entry.gc > now) {
          return
        }

        // Everything else gets removed
        delete router.matchCache[matchId]
      })
    },

    loadRoute: async (navigateOpts = router.location) => {
      const next = router.buildNext(navigateOpts)
      const matches = router.matchRoutes(next.pathname, {
        strictParseParams: true,
      })
      await router.loadMatches(matches)
      return matches
    },

    preloadRoute: async (navigateOpts = router.location, loaderOpts) => {
      const next = router.buildNext(navigateOpts)
      const matches = router.matchRoutes(next.pathname, {
        strictParseParams: true,
      })
      await router.loadMatches(matches, {
        preload: true,
        maxAge:
          loaderOpts.maxAge ??
          router.options.defaultPreloadMaxAge ??
          router.options.defaultLoaderMaxAge ??
          0,
        gcMaxAge:
          loaderOpts.gcMaxAge ??
          router.options.defaultPreloadGcMaxAge ??
          router.options.defaultLoaderGcMaxAge ??
          0,
      })
      return matches
    },

    matchRoutes: (pathname, opts) => {
      router.cleanMatchCache()

      const matches: RouteMatch[] = []

      if (!router.routeTree) {
        return matches
      }

      const existingMatches = [
        ...router.state.matches,
        ...(router.state.pending?.matches ?? []),
      ]

      const recurse = async (routes: Route<any, any>[]): Promise<void> => {
        const parentMatch = last(matches)
        let params = parentMatch?.params ?? {}

        const filteredRoutes = router.options.filterRoutes?.(routes) ?? routes

        let foundRoutes: Route[] = []

        const findMatchInRoutes = (parentRoutes: Route[], routes: Route[]) => {
          routes.some((route) => {
            if (!route.routePath && route.childRoutes?.length) {
              return findMatchInRoutes(
                [...foundRoutes, route],
                route.childRoutes,
              )
            }

            const fuzzy = !!(
              route.routePath !== '/' || route.childRoutes?.length
            )

            const matchParams = matchPathname(pathname, {
              to: route.fullPath,
              fuzzy,
              caseSensitive:
                route.options.caseSensitive ?? router.options.caseSensitive,
            })

            if (matchParams) {
              let parsedParams

              try {
                parsedParams =
                  route.options.parseParams?.(matchParams!) ?? matchParams
              } catch (err) {
                if (opts?.strictParseParams) {
                  throw err
                }
              }

              params = {
                ...params,
                ...parsedParams,
              }
            }

            if (!!matchParams) {
              foundRoutes = [...parentRoutes, route]
            }

            return !!foundRoutes.length
          })

          return !!foundRoutes.length
        }

        findMatchInRoutes([], filteredRoutes)

        if (!foundRoutes.length) {
          return
        }

        foundRoutes.forEach((foundRoute) => {
          const interpolatedPath = interpolatePath(foundRoute.routePath, params)
          const matchId = interpolatePath(foundRoute.routeId, params, true)

          const match =
            existingMatches.find((d) => d.matchId === matchId) ||
            router.matchCache[matchId]?.match ||
            createRouteMatch(router, foundRoute, {
              matchId,
              params,
              pathname: joinPaths([pathname, interpolatedPath]),
            })

          matches.push(match)
        })

        const foundRoute = last(foundRoutes)!

        if (foundRoute.childRoutes?.length) {
          recurse(foundRoute.childRoutes)
        }
      }

      recurse([router.routeTree])

      cascadeLoaderData(matches)

      return matches
    },

    loadMatches: async (resolvedMatches, loaderOpts) => {
      const now = Date.now()
      const minMaxAge = loaderOpts?.preload
        ? Math.max(loaderOpts?.maxAge, loaderOpts?.gcMaxAge)
        : 0

      const matchPromises = resolvedMatches.map(async (match) => {
        // Validate the match (loads search params etc)
        match.__.validate()

        // If this is a preload, add it to the preload cache
        if (loaderOpts?.preload && minMaxAge > 0) {
          // If the match is currently active, don't preload it
          if (router.state.matches.find((d) => d.matchId === match.matchId)) {
            return
          }

          router.matchCache[match.matchId] = {
            gc: now + loaderOpts.gcMaxAge,
            match,
          }
        }

        // If the match is invalid, errored or idle, trigger it to load
        if (
          (match.status === 'success' && match.getIsInvalid()) ||
          match.status === 'error' ||
          match.status === 'idle'
        ) {
          const maxAge = loaderOpts?.preload ? loaderOpts?.maxAge : undefined

          match.load({ maxAge })
        }

        if (match.status === 'loading') {
          // If requested, start the pending timers
          if (loaderOpts?.withPending) match.__.startPending()

          // Wait for the first sign of activity from the match
          // This might be completion, error, or a pending state
          await match.__.loadPromise
        }
      })

      router.notify()

      await Promise.all(matchPromises)
    },

    invalidateRoute: (opts: MatchLocation) => {
      const next = router.buildNext(opts)
      const unloadedMatchIds = router
        .matchRoutes(next.pathname)
        .map((d) => d.matchId)
      ;[
        ...router.state.matches,
        ...(router.state.pending?.matches ?? []),
      ].forEach((match) => {
        if (unloadedMatchIds.includes(match.matchId)) {
          match.invalidate()
        }
      })
    },

    reload: () =>
      router._navigate({
        fromCurrent: true,
        replace: true,
        search: true,
      }),

    resolvePath: (from: string, path: string) => {
      return resolvePath(router.basepath!, from, cleanPath(path))
    },

    matchRoute: (location, opts) => {
      // const location = router.buildNext(opts)

      location = {
        ...location,
        to: location.to
          ? router.resolvePath(location.from ?? '', location.to)
          : undefined,
      }

      const next = router.buildNext(location)

      if (opts?.pending) {
        if (!router.state.pending?.location) {
          return false
        }
        return !!matchPathname(router.state.pending.location.pathname, {
          ...opts,
          to: next.pathname,
        })
      }

      return !!matchPathname(router.state.location.pathname, {
        ...opts,
        to: next.pathname,
      })
    },

    _navigate: (location: BuildNextOptions & { replace?: boolean }) => {
      const next = router.buildNext(location)
      return router.commitLocation(next, location.replace)
    },

    navigate: async ({ from, to = '.', search, hash, replace, params }) => {
      // If this link simply reloads the current route,
      // make sure it has a new key so it will trigger a data refresh

      // If this `to` is a valid external URL, return
      // null for LinkUtils
      const toString = String(to)
      const fromString = String(from)

      let isExternal

      try {
        new URL(`${toString}`)
        isExternal = true
      } catch (e) {}

      invariant(
        !isExternal,
        'Attempting to navigate to external url with router.navigate!',
      )

      return router._navigate({
        from: fromString,
        to: toString,
        search,
        hash,
        replace,
        params,
      })
    },

    buildLink: ({
      from,
      to = '.',
      search,
      params,
      hash,
      target,
      replace,
      activeOptions,
      preload,
      preloadMaxAge: userPreloadMaxAge,
      preloadGcMaxAge: userPreloadGcMaxAge,
      preloadDelay: userPreloadDelay,
      disabled,
    }) => {
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

      const next = router.buildNext(nextOpts)

      preload = preload ?? router.options.defaultPreload
      const preloadDelay =
        userPreloadDelay ?? router.options.defaultPreloadDelay ?? 0

      // Compare path/hash for matches
      const pathIsEqual = router.state.location.pathname === next.pathname
      const currentPathSplit = router.state.location.pathname.split('/')
      const nextPathSplit = next.pathname.split('/')
      const pathIsFuzzyEqual = nextPathSplit.every(
        (d, i) => d === currentPathSplit[i],
      )
      const hashIsEqual = router.state.location.hash === next.hash
      // Combine the matches based on user options
      const pathTest = activeOptions?.exact ? pathIsEqual : pathIsFuzzyEqual
      const hashTest = activeOptions?.includeHash ? hashIsEqual : true

      // The final "active" test
      const isActive = pathTest && hashTest

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
          if (pathIsEqual && !search && !hash) {
            router.invalidateRoute(nextOpts)
          }

          // All is well? Navigate!)
          router._navigate(nextOpts)
        }
      }

      // The click handler
      const handleFocus = (e: MouseEvent) => {
        if (preload) {
          router.preloadRoute(nextOpts, {
            maxAge: userPreloadMaxAge,
            gcMaxAge: userPreloadGcMaxAge,
          })
        }
      }

      const handleEnter = (e: MouseEvent) => {
        const target = (e.target || {}) as LinkCurrentTargetElement

        if (preload) {
          if (target.preloadTimeout) {
            return
          }

          target.preloadTimeout = setTimeout(() => {
            target.preloadTimeout = null
            router.preloadRoute(nextOpts, {
              maxAge: userPreloadMaxAge,
              gcMaxAge: userPreloadGcMaxAge,
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
        isActive,
        disabled,
      }
    },
  }

  router.location = router.parseLocation(history.location)
  router.state.location = router.location

  router.update(userOptions)

  // Allow frameworks to hook into the router creation
  router.options.createRouter?.(router)

  return router
}

function isCtrlEvent(e: MouseEvent) {
  return !!(e.metaKey || e.altKey || e.ctrlKey || e.shiftKey)
}
