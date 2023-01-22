import { Store } from '@tanstack/store'
import invariant from 'tiny-invariant'

//

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
import { AnyRoute, Route } from './route'
import {
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
  RouteInfo,
  RoutesById,
} from './routeInfo'
import { RouteMatch, RouteMatchStore } from './routeMatch'
import { defaultParseSearch, defaultStringifySearch } from './searchParams'
import {
  functionalUpdate,
  last,
  NoInfer,
  pick,
  PickAsRequired,
  PickRequired,
  Timeout,
  Updater,
  replaceEqualDeep,
} from './utils'
import {
  createBrowserHistory,
  createMemoryHistory,
  RouterHistory,
} from './history'

export interface RegisterRouter {
  // router: Router
}

export type AnyRouter = Router<any, any, any>

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
export type FilterRoutesFn = <TRoute extends Route<any, RouteInfo>>(
  routeConfigs: TRoute[],
) => TRoute[]

export interface RouterOptions<
  TRouteConfig extends AnyRouteConfig,
  TRouterContext,
> {
  history?: RouterHistory
  stringifySearch?: SearchSerializer
  parseSearch?: SearchParser
  filterRoutes?: FilterRoutesFn
  defaultPreload?: false | 'intent'
  defaultPreloadDelay?: number
  defaultComponent?: GetFrameworkGeneric<'Component'>
  defaultErrorComponent?: GetFrameworkGeneric<'ErrorComponent'>
  defaultPendingComponent?: GetFrameworkGeneric<'Component'>
  defaultLoaderMaxAge?: number
  defaultLoaderGcMaxAge?: number
  caseSensitive?: boolean
  routeConfig?: TRouteConfig
  basepath?: string
  Router?: (router: AnyRouter) => void
  createRoute?: (opts: { route: AnyRoute; router: AnyRouter }) => void
  context?: TRouterContext
  loadComponent?: (
    component: GetFrameworkGeneric<'Component'>,
  ) => Promise<GetFrameworkGeneric<'Component'>>
  onRouteChange?: () => void
  fetchServerDataFn?: FetchServerDataFn
}

type FetchServerDataFn = (ctx: {
  router: AnyRouter
  routeMatch: RouteMatch
}) => Promise<any>

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
  status: 'idle' | 'pending'
  latestLocation: ParsedLocation<TSearchObj, TState>
  currentMatches: RouteMatch[]
  currentLocation: ParsedLocation<TSearchObj, TState>
  pendingMatches?: RouteMatch[]
  pendingLocation?: ParsedLocation<TSearchObj, TState>
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
  state: DehydratedRouterState
  context: TRouterContext
}

export type MatchCache = Record<string, MatchCacheEntry>

interface DehydratedRouteMatch {
  id: string
  state: Pick<RouteMatchStore<any, any>, 'status'>
}

export interface RouterContext {}

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

export class Router<
  TRouteConfig extends AnyRouteConfig = RouteConfig,
  TAllRouteInfo extends AnyAllRouteInfo = AllRouteInfo<TRouteConfig>,
  TRouterContext = unknown,
> {
  types!: {
    // Super secret internal stuff
    RouteConfig: TRouteConfig
    AllRouteInfo: TAllRouteInfo
  }

  options: PickAsRequired<
    RouterOptions<TRouteConfig, TRouterContext>,
    'stringifySearch' | 'parseSearch' | 'context'
  >
  history!: RouterHistory
  #unsubHistory?: () => void
  basepath: string
  // __location: Location<TAllRouteInfo['fullSearchSchema']>
  routeTree!: Route<TAllRouteInfo, RouteInfo>
  routesById!: RoutesById<TAllRouteInfo>
  navigateTimeout: undefined | Timeout
  nextAction: undefined | 'push' | 'replace'
  navigationPromise: undefined | Promise<void>

  store: Store<RouterStore<TAllRouteInfo['fullSearchSchema']>>
  startedLoadingAt = Date.now()
  resolveNavigation = () => {}

  constructor(options?: RouterOptions<TRouteConfig, TRouterContext>) {
    this.options = {
      defaultPreloadDelay: 50,
      context: undefined!,
      ...options,
      stringifySearch: options?.stringifySearch ?? defaultStringifySearch,
      parseSearch: options?.parseSearch ?? defaultParseSearch,
      fetchServerDataFn: options?.fetchServerDataFn ?? defaultFetchServerDataFn,
    }

    this.store = new Store(getInitialRouterState())
    this.basepath = ''

    this.update(options)

    // Allow frameworks to hook into the router creation
    this.options.Router?.(this)
  }

  reset = () => {
    this.store.setState((s) => Object.assign(s, getInitialRouterState()))
  }

  mount = () => {
    // Mount only does anything on the client
    if (!isServer) {
      // If the router matches are empty, load the matches
      if (!this.store.state.currentMatches.length) {
        this.load()
      }

      const visibilityChangeEvent = 'visibilitychange'
      const focusEvent = 'focus'

      // addEventListener does not exist in React Native, but window does
      // In the future, we might need to invert control here for more adapters
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (window.addEventListener) {
        // Listen to visibilitychange and focus
        window.addEventListener(visibilityChangeEvent, this.#onFocus, false)
        window.addEventListener(focusEvent, this.#onFocus, false)
      }

      return () => {
        if (window.removeEventListener) {
          // Be sure to unsubscribe if a new handler is set

          window.removeEventListener(visibilityChangeEvent, this.#onFocus)
          window.removeEventListener(focusEvent, this.#onFocus)
        }
      }
    }

    return () => {}
  }

  update = <
    TRouteConfig extends RouteConfig = RouteConfig,
    TAllRouteInfo extends AnyAllRouteInfo = AllRouteInfo<TRouteConfig>,
    TRouterContext = unknown,
  >(
    opts?: RouterOptions<TRouteConfig, TRouterContext>,
  ): Router<TRouteConfig, TAllRouteInfo, TRouterContext> => {
    Object.assign(this.options, opts)

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

      this.store.setState((s) => ({
        ...s,
        latestLocation: this.#parseLocation(),
        currentLocation: s.latestLocation,
      }))

      this.#unsubHistory = this.history.listen(() => {
        this.load(this.#parseLocation(this.store.state.latestLocation))
      })
    }

    const { basepath, routeConfig } = this.options

    this.basepath = `/${trimPath(basepath ?? '') ?? ''}`

    if (routeConfig) {
      this.routesById = {} as any
      this.routeTree = this.#buildRouteTree(routeConfig)
    }

    return this as any
  }

  buildNext = (opts: BuildNextOptions) => {
    const next = this.#buildLocation(opts)

    const matches = this.matchRoutes(next.pathname)

    const __preSearchFilters = matches
      .map((match) => match.route.options.preSearchFilters ?? [])
      .flat()
      .filter(Boolean)

    const __postSearchFilters = matches
      .map((match) => match.route.options.postSearchFilters ?? [])
      .flat()
      .filter(Boolean)

    return this.#buildLocation({
      ...opts,
      __preSearchFilters,
      __postSearchFilters,
    })
  }

  cancelMatches = () => {
    ;[
      ...this.store.state.currentMatches,
      ...(this.store.state.pendingMatches || []),
    ].forEach((match) => {
      match.cancel()
    })
  }

  load = async (next?: ParsedLocation) => {
    let now = Date.now()
    const startedAt = now
    this.startedLoadingAt = startedAt

    // Cancel any pending matches
    this.cancelMatches()

    let matches!: RouteMatch<any, any>[]

    this.store.batch(() => {
      if (next) {
        // Ingest the new location
        this.store.setState((s) => ({
          ...s,
          latestLocation: next,
        }))
      }

      // Match the routes
      matches = this.matchRoutes(this.store.state.latestLocation.pathname, {
        strictParseParams: true,
      })

      this.store.setState((s) => ({
        ...s,
        status: 'pending',
        pendingMatches: matches,
        pendingLocation: this.store.state.latestLocation,
      }))
    })

    // Load the matches
    try {
      await this.loadMatches(matches)
    } catch (err: any) {
      console.warn(err)
      invariant(
        false,
        'Matches failed to load due to error above ☝️. Navigation cancelled!',
      )
    }

    if (this.startedLoadingAt !== startedAt) {
      // Ignore side-effects of outdated side-effects
      return this.navigationPromise
    }

    const previousMatches = this.store.state.currentMatches

    const exiting: RouteMatch[] = [],
      staying: RouteMatch[] = []

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
        search: d.store.state.routeSearch,
      })

      // Clear non-loading error states when match leaves
      if (d.store.state.status === 'error') {
        this.store.setState((s) => ({
          ...s,
          status: 'idle',
          error: undefined,
        }))
      }
    })

    staying.forEach((d) => {
      d.route.options.onTransition?.({
        params: d.params,
        search: d.store.state.routeSearch,
      })
    })

    entering.forEach((d) => {
      d.__onExit = d.route.options.onLoaded?.({
        params: d.params,
        search: d.store.state.search,
      })
      // delete this.store.state.matchCache[d.id] // TODO:
    })

    this.store.setState((s) => ({
      ...s,
      status: 'idle',
      currentLocation: this.store.state.latestLocation,
      currentMatches: matches,
      pendingLocation: undefined,
      pendingMatches: undefined,
    }))

    this.options.onRouteChange?.()

    this.resolveNavigation()
  }

  getRoute = <TId extends keyof TAllRouteInfo['routeInfoById']>(
    id: TId,
  ): Route<TAllRouteInfo, TAllRouteInfo['routeInfoById'][TId]> => {
    const route = this.routesById[id]

    invariant(route, `Route with id "${id as string}" not found`)

    return route
  }

  loadRoute = async (
    navigateOpts: BuildNextOptions = this.store.state.latestLocation,
  ): Promise<RouteMatch[]> => {
    const next = this.buildNext(navigateOpts)
    const matches = this.matchRoutes(next.pathname, {
      strictParseParams: true,
    })
    await this.loadMatches(matches)
    return matches
  }

  preloadRoute = async (
    navigateOpts: BuildNextOptions = this.store.state.latestLocation,
  ) => {
    const next = this.buildNext(navigateOpts)
    const matches = this.matchRoutes(next.pathname, {
      strictParseParams: true,
    })

    await this.loadMatches(matches, {
      preload: true,
    })
    return matches
  }

  matchRoutes = (pathname: string, opts?: { strictParseParams?: boolean }) => {
    const matches: RouteMatch[] = []

    if (!this.routeTree) {
      return matches
    }

    const existingMatches = [
      ...this.store.state.currentMatches,
      ...(this.store.state.pendingMatches ?? []),
    ]

    const recurse = async (routes: Route<any, any>[]): Promise<void> => {
      const parentMatch = last(matches)
      let params = parentMatch?.params ?? {}

      const filteredRoutes = this.options.filterRoutes?.(routes) ?? routes

      let foundRoutes: Route[] = []

      const findMatchInRoutes = (parentRoutes: Route[], routes: Route[]) => {
        routes.some((route) => {
          if (!route.path && route.childRoutes?.length) {
            return findMatchInRoutes([...foundRoutes, route], route.childRoutes)
          }

          const fuzzy = !!(route.path !== '/' || route.childRoutes?.length)

          const matchParams = matchPathname(this.basepath, pathname, {
            to: route.fullPath,
            fuzzy,
            caseSensitive:
              route.options.caseSensitive ?? this.options.caseSensitive,
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
        const interpolatedPath = interpolatePath(foundRoute.path, params)
        const matchId = interpolatePath(foundRoute.id, params, true)

        const match =
          existingMatches.find((d) => d.id === matchId) ||
          // this.store.state.matchCache[matchId]?.match || // TODO:
          new RouteMatch(this, foundRoute, {
            id: matchId,
            params,
            pathname: joinPaths([this.basepath, interpolatedPath]),
          })

        matches.push(match)
      })

      const foundRoute = last(foundRoutes)!

      if (foundRoute.childRoutes?.length) {
        recurse(foundRoute.childRoutes)
      }
    }

    recurse([this.routeTree])

    linkMatches(matches)

    return matches
  }

  loadMatches = async (
    resolvedMatches: RouteMatch[],
    loaderOpts?: { preload?: boolean },
  ) => {
    // this.cleanMatchCache()
    resolvedMatches.forEach(async (match) => {
      // Validate the match (loads search params etc)
      match.__validate()
    })

    // Check each match middleware to see if the route can be accessed
    await Promise.all(
      resolvedMatches.map(async (match) => {
        try {
          await match.route.options.beforeLoad?.({
            router: this as any,
            match,
          })
        } catch (err) {
          if (!loaderOpts?.preload) {
            match.route.options.onLoadError?.(err)
          }

          throw err
        }
      }),
    )

    const matchPromises = resolvedMatches.map(async (match, index) => {
      const prevMatch = resolvedMatches[(index = 1)]
      const search = match.store.state.search as { __data?: any }

      if (search.__data?.matchId && search.__data.matchId !== match.id) {
        return
      }

      match.load()

      if (match.store.state.status !== 'success' && match.__loadPromise) {
        // Wait for the first sign of activity from the match
        await match.__loadPromise
      }

      if (prevMatch) {
        await prevMatch.__loadPromise
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

  navigate = async <
    TFrom extends ValidFromPath<TAllRouteInfo> = '/',
    TTo extends string = '.',
  >({
    from,
    to = '.' as any,
    search,
    hash,
    replace,
    params,
  }: NavigateOptions<TAllRouteInfo, TFrom, TTo>) => {
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
    TFrom extends ValidFromPath<TAllRouteInfo> = '/',
    TTo extends string = '.',
  >(
    location: ToOptions<TAllRouteInfo, TFrom, TTo>,
    opts?: MatchRouteOptions,
  ):
    | false
    | TAllRouteInfo['routeInfoById'][ResolveRelativePath<
        TFrom,
        NoInfer<TTo>
      >]['allParams'] => {
    location = {
      ...location,
      to: location.to
        ? this.resolvePath(location.from ?? '', location.to)
        : undefined,
    }

    const next = this.buildNext(location)

    if (opts?.pending) {
      if (!this.store.state.pendingLocation) {
        return false
      }

      return matchPathname(
        this.basepath,
        this.store.state.pendingLocation!.pathname,
        {
          ...opts,
          to: next.pathname,
        },
      ) as any
    }

    return matchPathname(
      this.basepath,
      this.store.state.currentLocation.pathname,
      {
        ...opts,
        to: next.pathname,
      },
    ) as any
  }

  buildLink = <
    TFrom extends ValidFromPath<TAllRouteInfo> = '/',
    TTo extends string = '.',
  >({
    from,
    to = '.' as any,
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
  }: LinkOptions<TAllRouteInfo, TFrom, TTo>): LinkInfo => {
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
    const pathIsEqual =
      this.store.state.currentLocation.pathname === next.pathname
    const currentPathSplit =
      this.store.state.currentLocation.pathname.split('/')
    const nextPathSplit = next.pathname.split('/')
    const pathIsFuzzyEqual = nextPathSplit.every(
      (d, i) => d === currentPathSplit[i],
    )
    const hashIsEqual = this.store.state.currentLocation.hash === next.hash
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
      isActive,
      disabled,
    }
  }

  dehydrate = (): DehydratedRouter<TRouterContext> => {
    return {
      state: {
        ...pick(this.store.state, [
          'latestLocation',
          'currentLocation',
          'status',
          'lastUpdated',
        ]),
        currentMatches: this.store.state.currentMatches.map((match) => ({
          id: match.id,
          state: {
            ...pick(match.store.state, ['status']),
          },
        })),
      },
      context: this.options.context as TRouterContext,
    }
  }

  hydrate = (dehydratedRouter: DehydratedRouter<TRouterContext>) => {
    this.store.setState((s) => {
      this.options.context = dehydratedRouter.context

      // Match the routes
      const currentMatches = this.matchRoutes(
        dehydratedRouter.state.latestLocation.pathname,
        {
          strictParseParams: true,
        },
      )

      currentMatches.forEach((match, index) => {
        const dehydratedMatch = dehydratedRouter.state.currentMatches[index]
        invariant(
          dehydratedMatch && dehydratedMatch.id === match.id,
          'Oh no! There was a hydration mismatch when attempting to hydrate the state of the router! 😬',
        )
        match.store.setState((s) => ({
          ...s,
          ...dehydratedMatch.state,
        }))
      })

      currentMatches.forEach((match) => match.__validate())

      return {
        ...s,
        ...dehydratedRouter.state,
        currentMatches,
      }
    })
  }

  #buildRouteTree = (rootRouteConfig: RouteConfig) => {
    const recurseRoutes = (
      routeConfigs: RouteConfig[],
      parent?: Route<TAllRouteInfo, any, any>,
    ): Route<TAllRouteInfo, any, any>[] => {
      return routeConfigs.map((routeConfig, i) => {
        const routeOptions = routeConfig.options
        const route = new Route(routeConfig, routeOptions, i, parent, this)
        const existingRoute = (this.routesById as any)[route.id]

        if (existingRoute) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn(
              `Duplicate routes found with id: ${String(route.id)}`,
              this.routesById,
              route,
            )
          }
          throw new Error()
        }

        ;(this.routesById as any)[route.id] = route

        const children = routeConfig.children as RouteConfig[]

        route.childRoutes = children.length
          ? recurseRoutes(children, route)
          : undefined

        return route
      })
    }

    const routes = recurseRoutes([rootRouteConfig])

    return routes[0]!
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

  #onFocus = () => {
    this.load()
  }

  #buildLocation = (dest: BuildNextOptions = {}): ParsedLocation => {
    const fromPathname = dest.fromCurrent
      ? this.store.state.latestLocation.pathname
      : dest.from ?? this.store.state.latestLocation.pathname

    let pathname = resolvePath(
      this.basepath ?? '/',
      fromPathname,
      `${dest.to ?? '.'}`,
    )

    const fromMatches = this.matchRoutes(
      this.store.state.latestLocation.pathname,
      {
        strictParseParams: true,
      },
    )

    const toMatches = this.matchRoutes(pathname)

    const prevParams = { ...last(fromMatches)?.params }

    let nextParams =
      (dest.params ?? true) === true
        ? prevParams
        : functionalUpdate(dest.params!, prevParams)

    if (nextParams) {
      toMatches
        .map((d) => d.route.options.stringifyParams)
        .filter(Boolean)
        .forEach((fn) => {
          Object.assign({}, nextParams!, fn!(nextParams!))
        })
    }

    pathname = interpolatePath(pathname, nextParams ?? {})

    // Pre filters first
    const preFilteredSearch = dest.__preSearchFilters?.length
      ? dest.__preSearchFilters?.reduce(
          (prev, next) => next(prev),
          this.store.state.latestLocation.search,
        )
      : this.store.state.latestLocation.search

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

    const search = replaceEqualDeep(
      this.store.state.latestLocation.search,
      postFilteredSearch,
    )

    const searchStr = this.options.stringifySearch(search)
    let hash =
      dest.hash === true
        ? this.store.state.latestLocation.hash
        : functionalUpdate(dest.hash!, this.store.state.latestLocation.hash)
    hash = hash ? `#${hash}` : ''

    return {
      pathname,
      search,
      searchStr,
      state: this.store.state.latestLocation.state,
      hash,
      href: `${pathname}${searchStr}${hash}`,
      key: dest.key,
    }
  }

  #commitLocation = (location: BuildNextOptions & { replace?: boolean }) => {
    const next = this.buildNext(location)
    const id = '' + Date.now() + Math.random()

    if (this.navigateTimeout) clearTimeout(this.navigateTimeout)

    let nextAction: 'push' | 'replace' = 'replace'

    if (!location.replace) {
      nextAction = 'push'
    }

    const isSameUrl = this.store.state.latestLocation.href === next.href

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

    // this.load(this.#parseLocation(this.store.state.latestLocation))

    return (this.navigationPromise = new Promise((resolve) => {
      const previousNavigationResolve = this.resolveNavigation

      this.resolveNavigation = () => {
        previousNavigationResolve()
        resolve()
      }
    }))
  }
}

// Detect if we're in the DOM
const isServer = typeof window === 'undefined' || !window.document.createElement

function getInitialRouterState(): RouterStore {
  return {
    status: 'idle',
    latestLocation: null!,
    currentLocation: null!,
    currentMatches: [],
    lastUpdated: Date.now(),
    // matchCache: {}, // TODO:
    // get isFetching() {
    //   return (
    //     this.status === 'loading' ||
    //     this.currentMatches.some((d) => d.store.state.isFetching)
    //   )
    // },
    // get isPreloading() {
    //   return Object.values(this.matchCache).some(
    //     (d) =>
    //       d.match.store.state.isFetching &&
    //       !this.currentMatches.find((dd) => dd.id === d.match.id),
    //   )
    // },
  }
}

function isCtrlEvent(e: MouseEvent) {
  return !!(e.metaKey || e.altKey || e.ctrlKey || e.shiftKey)
}

function linkMatches(matches: RouteMatch<any, any>[]) {
  matches.forEach((match, index) => {
    const parent = matches[index - 1]

    if (parent) {
      match.__setParentMatch(parent)
    }
  })
}
