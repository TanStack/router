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
  NavigateOptions,
  ToOptions,
  ValidFromPath,
  ResolveRelativePath,
} from './link'
import {
  cleanPath,
  interpolatePath,
  joinPaths,
  matchPathname,
  resolvePath,
  trimPath,
} from './path'
import { AnyRoute, createRoute, Route } from './route'
import {
  AnyLoaderData,
  AnyPathParams,
  AnyRouteConfig,
  AnySearchSchema,
  LoaderContext,
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
import { createRouteMatch, RouteMatch, RouteMatchStore } from './routeMatch'
import { defaultParseSearch, defaultStringifySearch } from './searchParams'
import { createStore, batch, SetStoreFunction } from '@solidjs/reactivity'
import {
  functionalUpdate,
  last,
  NoInfer,
  pick,
  PickAsRequired,
  PickRequired,
  Timeout,
  Updater,
} from './utils'
import { sharedClone } from './sharedClone'

export interface RegisterRouter {
  // router: Router
}

export type RegisteredRouter = RegisterRouter extends {
  router: Router<infer TRouteConfig, infer TAllRouteInfo, infer TRouterContext>
}
  ? Router<TRouteConfig, TAllRouteInfo, TRouterContext>
  : Router

export type RegisteredAllRouteInfo = RegisterRouter extends {
  router: Router<infer TRouteConfig, infer TAllRouteInfo, infer TRouterContext>
}
  ? TAllRouteInfo
  : AnyAllRouteInfo

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

export interface RouterOptions<
  TRouteConfig extends AnyRouteConfig,
  TRouterContext,
> {
  history?: BrowserHistory | MemoryHistory | HashHistory
  stringifySearch?: SearchSerializer
  parseSearch?: SearchParser
  filterRoutes?: FilterRoutesFn
  defaultPreload?: false | 'intent'
  defaultPreloadMaxAge?: number
  defaultPreloadGcMaxAge?: number
  defaultPreloadDelay?: number
  defaultComponent?: GetFrameworkGeneric<'Component'>
  defaultErrorComponent?: GetFrameworkGeneric<'ErrorComponent'>
  defaultPendingComponent?: GetFrameworkGeneric<'Component'>
  defaultLoaderMaxAge?: number
  defaultLoaderGcMaxAge?: number
  caseSensitive?: boolean
  routeConfig?: TRouteConfig
  basepath?: string
  useServerData?: boolean
  createRouter?: (router: Router<any, any, any>) => void
  createRoute?: (opts: {
    route: AnyRoute
    router: Router<any, any, any>
  }) => void
  context?: TRouterContext
  loadComponent?: (
    component: GetFrameworkGeneric<'Component'>,
  ) => Promise<GetFrameworkGeneric<'Component'>>
}

export interface Action<
  TPayload = unknown,
  TResponse = unknown,
  // TError = unknown,
> {
  submit: (
    submission?: TPayload,
    actionOpts?: { invalidate?: boolean; multi?: boolean },
  ) => Promise<TResponse>
  current?: ActionState<TPayload, TResponse>
  latest?: ActionState<TPayload, TResponse>
  submissions: ActionState<TPayload, TResponse>[]
}

export interface ActionState<
  TPayload = unknown,
  TResponse = unknown,
  // TError = unknown,
> {
  submittedAt: number
  status: 'idle' | 'pending' | 'success' | 'error'
  submission: TPayload
  isMulti: boolean
  data?: TResponse
  error?: unknown
}

export interface Loader<
  TFullSearchSchema extends AnySearchSchema = {},
  TAllParams extends AnyPathParams = {},
  TRouteLoaderData = AnyLoaderData,
> {
  fetch: keyof PickRequired<TFullSearchSchema> extends never
    ? keyof TAllParams extends never
      ? (loaderContext: { signal?: AbortSignal }) => Promise<TRouteLoaderData>
      : (loaderContext: {
          params: TAllParams
          search?: TFullSearchSchema
          signal?: AbortSignal
        }) => Promise<TRouteLoaderData>
    : keyof TAllParams extends never
    ? (loaderContext: {
        search: TFullSearchSchema
        params: TAllParams
        signal?: AbortSignal
      }) => Promise<TRouteLoaderData>
    : (loaderContext: {
        search: TFullSearchSchema
        signal?: AbortSignal
      }) => Promise<TRouteLoaderData>
  current?: LoaderState<TFullSearchSchema, TAllParams>
  latest?: LoaderState<TFullSearchSchema, TAllParams>
  pending: LoaderState<TFullSearchSchema, TAllParams>[]
}

export interface LoaderState<
  TFullSearchSchema extends AnySearchSchema = {},
  TAllParams extends AnyPathParams = {},
> {
  loadedAt: number
  loaderContext: LoaderContext<TFullSearchSchema, TAllParams>
}

export interface RouterStore<
  TSearchObj extends AnySearchSchema = {},
  TState extends LocationState = LocationState,
> {
  status: 'idle' | 'loading'
  latestLocation: Location<TSearchObj, TState>
  currentMatches: RouteMatch[]
  currentLocation: Location<TSearchObj, TState>
  pendingMatches?: RouteMatch[]
  pendingLocation?: Location<TSearchObj, TState>
  lastUpdated: number
  actions: Record<string, Action>
  loaders: Record<string, Loader>
  isFetching: boolean
  isPreloading: boolean
  matchCache: Record<string, MatchCacheEntry>
}

type Listener = (router: Router<any, any, any>) => void

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
  pending?: boolean
  caseSensitive?: boolean
  fuzzy?: boolean
}

type LinkCurrentTargetElement = {
  preloadTimeout?: null | ReturnType<typeof setTimeout>
}

export interface DehydratedRouterState
  extends Pick<
    RouterStore,
    'status' | 'latestLocation' | 'currentLocation' | 'lastUpdated'
  > {
  currentMatches: DehydratedRouteMatch[]
}

export interface DehydratedRouter<TRouterContext = unknown> {
  // location: Router['__location']
  store: DehydratedRouterState
  context: TRouterContext
}

export type MatchCache = Record<string, MatchCacheEntry>

interface DehydratedRouteMatch {
  matchId: string
  store: Pick<
    RouteMatchStore<any, any>,
    'status' | 'routeLoaderData' | 'isInvalid' | 'invalidAt'
  >
}

export interface RouterContext {}

export interface Router<
  TRouteConfig extends AnyRouteConfig = RouteConfig,
  TAllRouteInfo extends AnyAllRouteInfo = AllRouteInfo<TRouteConfig>,
  TRouterContext = unknown,
> {
  types: {
    // Super secret internal stuff
    RouteConfig: TRouteConfig
    AllRouteInfo: TAllRouteInfo
  }

  // Public API
  history: BrowserHistory | MemoryHistory | HashHistory
  options: PickAsRequired<
    RouterOptions<TRouteConfig, TRouterContext>,
    'stringifySearch' | 'parseSearch' | 'context'
  >
  store: RouterStore<TAllRouteInfo['fullSearchSchema']>
  setStore: SetStoreFunction<RouterStore<TAllRouteInfo['fullSearchSchema']>>
  basepath: string
  // __location: Location<TAllRouteInfo['fullSearchSchema']>
  routeTree: Route<TAllRouteInfo, RouteInfo>
  routesById: RoutesById<TAllRouteInfo>
  reset: () => void
  mount: () => () => void
  update: <
    TRouteConfig extends RouteConfig = RouteConfig,
    TAllRouteInfo extends AnyAllRouteInfo = AllRouteInfo<TRouteConfig>,
    TRouterContext = unknown,
  >(
    opts?: RouterOptions<TRouteConfig, TRouterContext>,
  ) => Router<TRouteConfig, TAllRouteInfo, TRouterContext>

  buildNext: (opts: BuildNextOptions) => Location
  cancelMatches: () => void
  load: (next?: Location) => Promise<void>
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
    loaderOpts?:
      | { preload: true; maxAge: number; gcMaxAge: number }
      | { preload?: false; maxAge?: never; gcMaxAge?: never },
  ) => Promise<void>
  loadMatchData: (
    routeMatch: RouteMatch<any, any>,
  ) => Promise<Record<string, unknown>>
  invalidateRoute: (opts: MatchLocation) => void
  reload: () => Promise<void>
  resolvePath: (from: string, path: string) => string
  navigate: <
    TFrom extends ValidFromPath<TAllRouteInfo> = '/',
    TTo extends string = '.',
  >(
    opts: NavigateOptions<TAllRouteInfo, TFrom, TTo>,
  ) => Promise<void>
  matchRoute: <
    TFrom extends ValidFromPath<TAllRouteInfo> = '/',
    TTo extends string = '.',
  >(
    matchLocation: ToOptions<TAllRouteInfo, TFrom, TTo>,
    opts?: MatchRouteOptions,
  ) =>
    | false
    | TAllRouteInfo['routeInfoById'][ResolveRelativePath<
        TFrom,
        NoInfer<TTo>
      >]['allParams']
  buildLink: <
    TFrom extends ValidFromPath<TAllRouteInfo> = '/',
    TTo extends string = '.',
  >(
    opts: LinkOptions<TAllRouteInfo, TFrom, TTo>,
  ) => LinkInfo
  dehydrate: () => DehydratedRouter<TRouterContext>
  hydrate: (dehydratedRouter: DehydratedRouter<TRouterContext>) => void
}

// Detect if we're in the DOM
const isServer =
  typeof window === 'undefined' || !window.document?.createElement

// This is the default history object if none is defined
const createDefaultHistory = () =>
  isServer ? createMemoryHistory() : createBrowserHistory()

function getInitialRouterState(): RouterStore {
  return {
    status: 'idle',
    latestLocation: null!,
    currentLocation: null!,
    currentMatches: [],
    actions: {},
    loaders: {},
    lastUpdated: Date.now(),
    matchCache: {},
    get isFetching() {
      return (
        this.status === 'loading' ||
        this.currentMatches.some((d) => d.store.isFetching)
      )
    },
    get isPreloading() {
      return Object.values(this.matchCache).some(
        (d) =>
          d.match.store.isFetching &&
          !this.currentMatches.find((dd) => dd.matchId === d.match.matchId),
      )
    },
  }
}

export function createRouter<
  TRouteConfig extends AnyRouteConfig = RouteConfig,
  TAllRouteInfo extends AnyAllRouteInfo = AllRouteInfo<TRouteConfig>,
  TRouterContext = unknown,
>(
  userOptions?: RouterOptions<TRouteConfig, TRouterContext>,
): Router<TRouteConfig, TAllRouteInfo, TRouterContext> {
  const originalOptions = {
    defaultLoaderGcMaxAge: 5 * 60 * 1000,
    defaultLoaderMaxAge: 0,
    defaultPreloadMaxAge: 2000,
    defaultPreloadDelay: 50,
    context: undefined!,
    ...userOptions,
    stringifySearch: userOptions?.stringifySearch ?? defaultStringifySearch,
    parseSearch: userOptions?.parseSearch ?? defaultParseSearch,
  }

  const [store, setStore] = createStore<RouterStore>(getInitialRouterState())

  let navigateTimeout: undefined | Timeout
  let nextAction: undefined | 'push' | 'replace'
  let navigationPromise: undefined | Promise<void>

  let startedLoadingAt = Date.now()
  let resolveNavigation = () => {}

  function onFocus() {
    router.load()
  }

  function buildRouteTree(rootRouteConfig: RouteConfig) {
    const recurseRoutes = (
      routeConfigs: RouteConfig[],
      parent?: Route<TAllRouteInfo, any, any>,
    ): Route<TAllRouteInfo, any, any>[] => {
      return routeConfigs.map((routeConfig, i) => {
        const routeOptions = routeConfig.options
        const route = createRoute(routeConfig, routeOptions, i, parent, router)
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
  }

  function parseLocation(
    location: History['location'],
    previousLocation?: Location,
  ): Location {
    const parsedSearch = router.options.parseSearch(location.search)

    return {
      pathname: location.pathname,
      searchStr: location.search,
      search: sharedClone(previousLocation?.search, parsedSearch),
      hash: location.hash.split('#').reverse()[0] ?? '',
      href: `${location.pathname}${location.search}${location.hash}`,
      state: location.state as LocationState,
      key: location.key,
    }
  }

  function navigate(location: BuildNextOptions & { replace?: boolean }) {
    const next = router.buildNext(location)
    return commitLocation(next, location.replace)
  }

  function buildLocation(dest: BuildNextOptions = {}): Location {
    const fromPathname = dest.fromCurrent
      ? store.latestLocation.pathname
      : dest.from ?? store.latestLocation.pathname

    let pathname = resolvePath(
      router.basepath ?? '/',
      fromPathname,
      `${dest.to ?? '.'}`,
    )

    const fromMatches = router.matchRoutes(store.latestLocation.pathname, {
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
          store.latestLocation.search,
        )
      : store.latestLocation.search

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
      ? dest.__postSearchFilters.reduce((prev, next) => next(prev), destSearch)
      : destSearch

    const search = sharedClone(store.latestLocation.search, postFilteredSearch)

    const searchStr = router.options.stringifySearch(search)
    let hash =
      dest.hash === true
        ? store.latestLocation.hash
        : functionalUpdate(dest.hash!, store.latestLocation.hash)
    hash = hash ? `#${hash}` : ''

    return {
      pathname,
      search,
      searchStr,
      state: store.latestLocation.state,
      hash,
      href: `${pathname}${searchStr}${hash}`,
      key: dest.key,
    }
  }

  function commitLocation(next: Location, replace?: boolean): Promise<void> {
    const id = '' + Date.now() + Math.random()

    if (navigateTimeout) clearTimeout(navigateTimeout)

    let nextAction: 'push' | 'replace' = 'replace'

    if (!replace) {
      nextAction = 'push'
    }

    const isSameUrl = parseLocation(router.history.location).href === next.href

    if (isSameUrl && !next.key) {
      nextAction = 'replace'
    }

    router.history[nextAction](
      {
        pathname: next.pathname,
        hash: next.hash,
        search: next.searchStr,
      },
      {
        id,
        ...next.state,
      },
    )

    return (navigationPromise = new Promise((resolve) => {
      const previousNavigationResolve = resolveNavigation

      resolveNavigation = () => {
        previousNavigationResolve()
        resolve()
      }
    }))
  }

  const router: Router<TRouteConfig, TAllRouteInfo, TRouterContext> = {
    types: undefined!,

    // public api
    history: userOptions?.history || createDefaultHistory(),
    store,
    setStore,
    options: originalOptions,
    basepath: '',
    routeTree: undefined!,
    routesById: {} as any,

    reset: () => {
      setStore((s) => Object.assign(s, getInitialRouterState()))
    },

    getRoute: (id) => {
      return router.routesById[id]
    },

    dehydrate: () => {
      return {
        store: {
          ...pick(store, [
            'latestLocation',
            'currentLocation',
            'status',
            'lastUpdated',
          ]),
          currentMatches: store.currentMatches.map((match) => ({
            matchId: match.matchId,
            store: pick(match.store, [
              'status',
              'routeLoaderData',
              'isInvalid',
              'invalidAt',
            ]),
          })),
        },
        context: router.options.context as TRouterContext,
      }
    },

    hydrate: (dehydratedRouter) => {
      setStore((s) => {
        // Update the context TODO: make this part of state?
        router.options.context = dehydratedRouter.context

        // Match the routes
        const currentMatches = router.matchRoutes(
          dehydratedRouter.store.latestLocation.pathname,
          {
            strictParseParams: true,
          },
        )

        currentMatches.forEach((match, index) => {
          const dehydratedMatch = dehydratedRouter.store.currentMatches[index]
          invariant(
            dehydratedMatch && dehydratedMatch.matchId === match.matchId,
            'Oh no! There was a hydration mismatch when attempting to restore the state of the router! 😬',
          )
          Object.assign(match, dehydratedMatch)
        })

        currentMatches.forEach((match) => match.__.validate())

        Object.assign(s, { ...dehydratedRouter.store, currentMatches })
      })
    },

    mount: () => {
      // Mount only does anything on the client
      if (!isServer) {
        // If the router matches are empty, load the matches
        if (!store.currentMatches.length) {
          router.load()
        }

        const unsub = router.history.listen((event) => {
          router.load(parseLocation(event.location, store.latestLocation))
        })

        // addEventListener does not exist in React Native, but window does
        // In the future, we might need to invert control here for more adapters
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (window.addEventListener) {
          // Listen to visibilitychange and focus
          window.addEventListener('visibilitychange', onFocus, false)
          window.addEventListener('focus', onFocus, false)
        }

        return () => {
          unsub()
          if (window.removeEventListener) {
            // Be sure to unsubscribe if a new handler is set
            window.removeEventListener('visibilitychange', onFocus)
            window.removeEventListener('focus', onFocus)
          }
        }
      }

      return () => {}
    },

    update: (opts) => {
      const newHistory = opts?.history !== router.history
      if (!store.latestLocation || newHistory) {
        if (opts?.history) {
          router.history = opts.history
        }
        setStore((s) => {
          s.latestLocation = parseLocation(router.history.location)
          s.currentLocation = s.latestLocation
        })
      }

      Object.assign(router.options, opts)

      const { basepath, routeConfig } = router.options

      router.basepath = `/${trimPath(basepath ?? '') ?? ''}`

      if (routeConfig) {
        router.routesById = {} as any
        router.routeTree = buildRouteTree(routeConfig)
      }

      return router as any
    },

    cancelMatches: () => {
      ;[...store.currentMatches, ...(store.pendingMatches || [])].forEach(
        (match) => {
          match.cancel()
        },
      )
    },

    load: async (next?: Location) => {
      let now = Date.now()
      const startedAt = now
      startedLoadingAt = startedAt

      // Cancel any pending matches
      router.cancelMatches()

      let matches!: RouteMatch<any, any>[]

      batch(() => {
        if (next) {
          // Ingest the new location
          setStore((s) => {
            s.latestLocation = next
          })
        }

        // Match the routes
        matches = router.matchRoutes(store.latestLocation.pathname, {
          strictParseParams: true,
        })

        console.log('set loading', matches)
        setStore((s) => {
          s.status = 'loading'
          s.pendingMatches = matches
          s.pendingLocation = store.latestLocation
        })
      })

      // Load the matches
      try {
        await router.loadMatches(matches)
      } catch (err: any) {
        console.log(err)
        invariant(
          false,
          'Matches failed to load due to error above ☝️. Navigation cancelled!',
        )
      }

      if (startedLoadingAt !== startedAt) {
        // Ignore side-effects of outdated side-effects
        return navigationPromise
      }

      const previousMatches = store.currentMatches

      const exiting: RouteMatch[] = [],
        staying: RouteMatch[] = []

      previousMatches.forEach((d) => {
        if (matches.find((dd) => dd.matchId === d.matchId)) {
          staying.push(d)
        } else {
          exiting.push(d)
        }
      })

      const entering = matches.filter((d) => {
        return !previousMatches.find((dd) => dd.matchId === d.matchId)
      })

      now = Date.now()

      exiting.forEach((d) => {
        d.__.onExit?.({
          params: d.params,
          search: d.store.routeSearch,
        })

        // Clear idle error states when match leaves
        if (d.store.status === 'error' && !d.store.isFetching) {
          d.store.status = 'idle'
          d.store.error = undefined
        }

        const gc = Math.max(
          d.options.loaderGcMaxAge ?? router.options.defaultLoaderGcMaxAge ?? 0,
          d.options.loaderMaxAge ?? router.options.defaultLoaderMaxAge ?? 0,
        )

        if (gc > 0) {
          store.matchCache[d.matchId] = {
            gc: gc == Infinity ? Number.MAX_SAFE_INTEGER : now + gc,
            match: d,
          }
        }
      })

      staying.forEach((d) => {
        d.options.onTransition?.({
          params: d.params,
          search: d.store.routeSearch,
        })
      })

      entering.forEach((d) => {
        d.__.onExit = d.options.onLoaded?.({
          params: d.params,
          search: d.store.search,
        })
        delete store.matchCache[d.matchId]
      })

      if (startedLoadingAt !== startedAt) {
        // Ignore side-effects of match loading
        return
      }

      matches.forEach((match) => {
        // Clear actions
        if (match.action) {
          // TODO: Check reactivity here
          match.action.current = undefined
          match.action.submissions = []
        }
      })

      setStore((s) => {
        console.log('set', matches)
        Object.assign(s, {
          status: 'idle',
          currentLocation: store.latestLocation,
          currentMatches: matches,
          pendingLocation: undefined,
          pendingMatches: undefined,
        })
      })

      resolveNavigation()
    },

    cleanMatchCache: () => {
      const now = Date.now()

      setStore((s) => {
        Object.keys(s.matchCache).forEach((matchId) => {
          const entry = s.matchCache[matchId]!

          // Don't remove loading matches
          if (entry.match.store.status === 'loading') {
            return
          }

          // Do not remove successful matches that are still valid
          if (entry.gc > 0 && entry.gc > now) {
            return
          }

          // Everything else gets removed
          delete s.matchCache[matchId]
        })
      })
    },

    loadRoute: async (navigateOpts = store.latestLocation) => {
      const next = router.buildNext(navigateOpts)
      const matches = router.matchRoutes(next.pathname, {
        strictParseParams: true,
      })
      await router.loadMatches(matches)
      return matches
    },

    preloadRoute: async (navigateOpts = store.latestLocation, loaderOpts) => {
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
        ...store.currentMatches,
        ...(store.pendingMatches ?? []),
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

            const matchParams = matchPathname(router.basepath, pathname, {
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
            store.matchCache[matchId]?.match ||
            createRouteMatch(router, foundRoute, {
              parentMatch,
              matchId,
              params,
              pathname: joinPaths([router.basepath, interpolatedPath]),
            })

          matches.push(match)
        })

        const foundRoute = last(foundRoutes)!

        if (foundRoute.childRoutes?.length) {
          recurse(foundRoute.childRoutes)
        }
      }

      recurse([router.routeTree])

      linkMatches(matches)

      return matches
    },

    loadMatches: async (resolvedMatches, loaderOpts) => {
      resolvedMatches.forEach(async (match) => {
        // Validate the match (loads search params etc)
        match.__.validate()
      })

      // Check each match middleware to see if the route can be accessed
      await Promise.all(
        resolvedMatches.map(async (match) => {
          try {
            await match.options.beforeLoad?.({
              router: router as any,
              match,
            })
          } catch (err) {
            if (!loaderOpts?.preload) {
              match.options.onLoadError?.(err)
            }

            throw err
          }
        }),
      )

      const matchPromises = resolvedMatches.map(async (match) => {
        const search = match.store.search as { __data?: any }

        if (search.__data?.matchId && search.__data.matchId !== match.matchId) {
          return
        }

        match.load(loaderOpts)

        if (match.store.status !== 'success' && match.__.loadPromise) {
          // Wait for the first sign of activity from the match
          await match.__.loadPromise
        }
      })

      await Promise.all(matchPromises)
    },

    loadMatchData: async (routeMatch) => {
      if (isServer || !router.options.useServerData) {
        return (
          (await routeMatch.options.loader?.({
            // parentLoaderPromise: routeMatch.parentMatch?.__.dataPromise,
            params: routeMatch.params,
            search: routeMatch.store.routeSearch,
            signal: routeMatch.__.abortController.signal,
          })) || {}
        )
      } else {
        const next = router.buildNext({
          to: '.',
          search: (d: any) => ({
            ...(d ?? {}),
            __data: {
              matchId: routeMatch.matchId,
            },
          }),
        })

        // Refresh:
        // '/dashboard'
        // '/dashboard/invoices/'
        // '/dashboard/invoices/123'

        // New:
        // '/dashboard/invoices/456'

        // TODO: batch requests when possible

        const res = await fetch(next.href, {
          method: 'GET',
          // signal: routeMatch.__.abortController.signal,
        })

        if (res.ok) {
          return res.json()
        }

        throw new Error('Failed to fetch match data')
      }
    },

    invalidateRoute: (opts: MatchLocation) => {
      const next = router.buildNext(opts)
      const unloadedMatchIds = router
        .matchRoutes(next.pathname)
        .map((d) => d.matchId)
      ;[...store.currentMatches, ...(store.pendingMatches ?? [])].forEach(
        (match) => {
          if (unloadedMatchIds.includes(match.matchId)) {
            match.invalidate()
          }
        },
      )
    },

    reload: () =>
      navigate({
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
        if (!store.pendingLocation) {
          return false
        }

        return !!matchPathname(
          router.basepath,
          store.pendingLocation.pathname,
          {
            ...opts,
            to: next.pathname,
          },
        )
      }

      return matchPathname(router.basepath, store.currentLocation.pathname, {
        ...opts,
        to: next.pathname,
      }) as any
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

      return navigate({
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
      const pathIsEqual = store.currentLocation.pathname === next.pathname
      const currentPathSplit = store.currentLocation.pathname.split('/')
      const nextPathSplit = next.pathname.split('/')
      const pathIsFuzzyEqual = nextPathSplit.every(
        (d, i) => d === currentPathSplit[i],
      )
      const hashIsEqual = store.currentLocation.hash === next.hash
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

          // All is well? Navigate!
          navigate(nextOpts)
        }
      }

      // The click handler
      const handleFocus = (e: MouseEvent) => {
        if (preload) {
          router
            .preloadRoute(nextOpts, {
              maxAge: userPreloadMaxAge,
              gcMaxAge: userPreloadGcMaxAge,
            })
            .catch((err) => {
              console.log(err)
              console.warn('Error preloading route! ☝️')
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
            router
              .preloadRoute(nextOpts, {
                maxAge: userPreloadMaxAge,
                gcMaxAge: userPreloadGcMaxAge,
              })
              .catch((err) => {
                console.log(err)
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
        isActive,
        disabled,
      }
    },
    buildNext: (opts: BuildNextOptions) => {
      const next = buildLocation(opts)

      const matches = router.matchRoutes(next.pathname)

      const __preSearchFilters = matches
        .map((match) => match.options.preSearchFilters ?? [])
        .flat()
        .filter(Boolean)

      const __postSearchFilters = matches
        .map((match) => match.options.postSearchFilters ?? [])
        .flat()
        .filter(Boolean)

      return buildLocation({
        ...opts,
        __preSearchFilters,
        __postSearchFilters,
      })
    },
  }

  router.update(userOptions)

  // Allow frameworks to hook into the router creation
  router.options.createRouter?.(router)

  return router
}

function isCtrlEvent(e: MouseEvent) {
  return !!(e.metaKey || e.altKey || e.ctrlKey || e.shiftKey)
}

function linkMatches(matches: RouteMatch<any, any>[]) {
  matches.forEach((match, index) => {
    const parent = matches[index - 1]

    if (parent) {
      match.__.setParentMatch(parent)
    } else {
      match.__.setParentMatch(undefined)
    }
  })
}
