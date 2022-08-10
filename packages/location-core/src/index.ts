import {
  createHashHistory,
  createBrowserHistory,
  createMemoryHistory,
  BrowserHistory,
  MemoryHistory,
  History,
  HashHistory,
} from 'history'
import React, { AnchorHTMLAttributes, EventHandler } from 'react'

export { createHashHistory, createBrowserHistory, createMemoryHistory }

import { decode, encode } from './qss'

// Types

export type IsAny<T, Y, N> = 1 extends 0 & T ? Y : N
export type IsKnown<T, Y, N> = unknown extends T ? N : Y

export interface FrameworkGenerics<TData = unknown> {
  // The following properties are used internally
  // and are extended by framework adapters, but cannot be
  // pre-defined as constraints:
  //
  // Element: any
  // AsyncElement: any
  // SyncOrAsyncElement?: any
  // LinkProps: any
}

export interface RouteMeta {}
export interface SearchSchema {}
export interface LocationState {}
export interface RouteParams {}
export interface RouteData {}

type Timeout = ReturnType<typeof setTimeout>

export type LocationManagerOptions = {
  // The history object to be used internally by location
  // A history will be created automatically if not provided.
  history?: BrowserHistory | MemoryHistory | HashHistory
  stringifySearch?: SearchSerializer
  parseSearch?: SearchParser
}

export type SearchSerializer = (searchObj: Record<string, any>) => string
export type SearchParser = (searchStr: string) => Record<string, any>

export type Updater<TResult> = TResult | ((prev?: TResult) => TResult)

export type Location = {
  href: string
  pathname: string
  search: SearchSchema
  searchStr: string
  state: LocationState
  hash: string
  key?: string
  // nextAction?: 'push' | 'replace'
}

export type FromLocation = {
  pathname: string
  search?: SearchSchema
  key?: string
  hash?: string
  // nextAction?: 'push' | 'replace'
}

export type Route<TData = unknown> = {
  // The path to match (relative to the nearest parent `Route` component or root basepath)
  path?: string
  // An ID to uniquely identify this route within its siblings. This is only required for routes that *only match on search* or if you have multiple routes with the same path
  id?: string
  // If true, this route will be matched as case-sensitive
  caseSensitive?: boolean
  // Either (1) an object that will be used to shallowly match the current location's search or (2) A function that receives the current search params and can return truthy if they are matched.
  search?: SearchPredicate
  // Filter functions that can manipulate search params *before* they are passed to links and navigate
  // calls that match this route.
  preSearchFilters?: SearchFilter[]
  // Filter functions that can manipulate search params *after* they are passed to links and navigate
  // calls that match this route.
  postSearchFilters?: SearchFilter[]
  // The duration to wait during `loader` execution before showing the `pendingElement`
  pendingMs?: number
  // _If the `pendingElement` is shown_, the minimum duration for which it will be visible.
  pendingMinMs?: number
  // An array of child routes
  children?: Route<unknown>[]
  // Route Loaders (see below) can be inline on the route, or resolved async
} & RouteLoaders<TData> & {
    // If `import` is defined, this route can resolve its elements and loaders in a single asynchronous call
    // This is particularly useful for code-splitting or module federation
    import?: (opts: {
      params: RouteParams
      search: SearchSchema
    }) => Promise<RouteLoaders<TData>>
  }

export interface RouteLoaders<TData = unknown> {
  // The content to be rendered when the route is matched. If no element is provided, defaults to `<Outlet />`
  element?: GetFrameworkGeneric<'SyncOrAsyncElement', TData>
  // The content to be rendered when `loader` encounters an error
  errorElement?: GetFrameworkGeneric<'SyncOrAsyncElement', TData>
  // The content to be rendered when the duration of `loader` execution surpasses the `pendingMs` duration
  pendingElement?: GetFrameworkGeneric<'SyncOrAsyncElement', TData>
  // An asynchronous function responsible for preparing or fetching data for the route before it is rendered
  loader?: LoaderFn<TData>
  // An asynchronous function responsible for cleaning up when the match cache is cleared. This is useful when
  // the loader function has side effects that need to be cleaned up when the match is no longer in use.
  unloader?: UnloaderFn<TData>
  // An integer of milliseconds representing how long data should be cached for the route
  loaderMaxAge?: number
  // This function is called
  // when moving from an inactive state to an active one. Likewise, when moving from
  // an active to an inactive state, the return function (if provided) is called.
  onMatch?: (
    match: RouteMatch<TData>,
  ) => void | undefined | ((match: RouteMatch<TData>) => void)
  // This function is called when the route remains active from one transition to the next.
  onTransition?: (match: RouteMatch<TData>) => void
  // An object of whatever you want! This object is accessible anywhere matches are.
  meta?: RouteMeta
}

export type SearchFilter = (prev: SearchSchema) => SearchSchema

export type MatchLocation = {
  to?: string | number | null
  search?: SearchPredicate
  fuzzy?: boolean
  caseSensitive?: boolean
}

export type SearchPredicate = (search: SearchSchema) => any

export type UnloadedMatch<TData> = {
  id: string
  route: Route<TData>
  pathname: string
  params: Record<string, string>
  search: SearchSchema
}

export type LoaderFn<TData> = (
  routeMatch: RouteMatch<TData>,
  opts: LoaderFnOptions<TData>,
) => PromiseLike<TData>

export type UnloaderFn<TData> = (routeMatch: RouteMatch<TData>) => void

export type LoaderFnOptions<TData> = {
  parentMatch?: RouteMatch<TData>
}

type PromiseLike<T> = Promise<T> | T

export type ListenerFn = () => void

export type Segment = {
  type: 'pathname' | 'param' | 'wildcard'
  value: string
}

type GetFrameworkGeneric<
  U,
  TData = unknown,
> = U extends keyof FrameworkGenerics<TData>
  ? FrameworkGenerics<TData>[U]
  : unknown

export type RouterOptions = {
  // An array of route objects to match
  routes: Route<unknown>[]
  basepath?: string
  filterRoutes?: FilterRoutesFn
  defaultLinkPreloadMaxAge?: number
  defaultLoaderMaxAge?: number
  useErrorBoundary?: boolean
  defaultElement?: GetFrameworkGeneric<'Element'>
  defaultErrorElement?: GetFrameworkGeneric<'Element'>
  defaultPendingElement?: GetFrameworkGeneric<'Element'>
  defaultPendingMs?: number
  defaultPendingMinMs?: number
  caseSensitive?: boolean
  __experimental__snapshot?: __Experimental__RouterSnapshot
}

export type __Experimental__RouterSnapshot = {
  location: Location
  matches: SnapshotRouteMatch<unknown>[]
}

export type SnapshotRouteMatch<TData> = {
  id: string
  ownData: TData
}

export type BuildNextOptions = {
  to?: string | number | null
  search?: true | Updater<SearchSchema>
  hash?: true | Updater<string>
  key?: string
  from?: string
  __preSearchFilters?: SearchFilter[]
  __postSearchFilters?: SearchFilter[]
}

export type NavigateOptions = BuildNextOptions & {
  replace?: boolean
}

export type LinkOptions = Pick<
  AnchorHTMLAttributes<unknown>,
  'target' | 'onClick' | 'onMouseEnter'
> & {
  // The absolute or relative destination pathname
  to?: string | number | null
  // The new search object or a function to update it
  search?: true | Updater<SearchSchema>
  // The new has string or a function to update it
  hash?: Updater<string>
  // Whether to replace the current history stack instead of pushing a new one
  replace?: boolean
  // A function that is passed the [Location API](#location-api) and returns additional props for the `active` state of this link. These props override other props passed to the link (`style`'s are merged, `className`'s are concatenated)
  getActiveProps?: () => GetFrameworkGeneric<'LinkProps'>
  // A function that is passed the [Location API](#location-api) and returns additional props for the `inactive` state of this link. These props override other props passed to the link (`style`'s are merged, `className`'s are concatenated)
  getInactiveProps?: () => GetFrameworkGeneric<'LinkProps'>
  // Defaults to `{ exact: false, includeHash: false }`
  activeOptions?: ActiveOptions
  // If set, will preload the linked route on hover and cache it for this many milliseconds in hopes that the user will eventually navigate there.
  preload?: 'intent'
  // When preloaded and set, will cache the preloaded result for this duration in milliseconds
  preloadMaxAge?: number
  // If true, will render the link without the href attribute
  disabled?: boolean
  // The root (excluding the basepath) from which to resolve the route.
  // Defaults to the current location's pathname.
  // To navigate from the root, pass `/` as the from
  from?: string
}

type ActiveOptions = {
  exact?: boolean
  includeHash?: boolean
}

export type LoadRouteFn = (next: Location) => MatchLoader

export type TransitionState = {
  location: Location
  matches: RouteMatch<unknown>[]
  cancel?: () => void
  matchLoader?: MatchLoader
}

export type FilterRoutesFn = (routes: Route<unknown>[]) => Route<unknown>[]

type Listener = () => void

// Source

// Detect if we're in the DOM
const isDOM = Boolean(
  typeof window !== 'undefined' &&
    window.document &&
    window.document.createElement,
)

// This is the default history object if none is defined
const createDefaultHistory = () =>
  isDOM ? createBrowserHistory() : createMemoryHistory()

class Subscribable {
  listeners: Listener[]

  constructor() {
    this.listeners = []
  }

  subscribe(listener: Listener): () => void {
    this.listeners.push(listener as Listener)

    return () => {
      this.listeners = this.listeners.filter((x) => x !== listener)
    }
  }

  notify(): void {
    this.listeners.forEach((listener) => listener())
  }
}

export class LocationManager extends Subscribable {
  history: BrowserHistory | MemoryHistory
  stringifySearch: SearchSerializer
  parseSearch: SearchParser

  current: Location
  destroy: () => void
  navigateTimeout?: Timeout
  nextAction?: 'push' | 'replace'

  //

  isTransitioning: boolean = false

  constructor(options?: LocationManagerOptions) {
    super()
    this.history = options?.history || createDefaultHistory()
    this.stringifySearch = options?.stringifySearch ?? defaultStringifySearch
    this.parseSearch = options?.parseSearch ?? defaultParseSearch

    this.current = this.parseLocation(this.history.location)

    this.destroy = this.history.listen((event) => {
      this.current = this.parseLocation(event.location, this.current)
      this.notify()
    })
  }

  buildNext = (
    basepath: string = '/',
    dest: BuildNextOptions = {},
  ): Location => {
    const resolvedFrom: Location = {
      ...this.current,
      pathname: dest.from ?? this.current.pathname,
    }

    const pathname = resolvePath(
      basepath,
      resolvedFrom.pathname,
      `${dest.to ?? '.'}`,
    )

    // Pre filters first
    const preFilteredSearch = dest.__preSearchFilters?.length
      ? dest.__preSearchFilters.reduce(
          (prev, next) => next(prev),
          resolvedFrom.search,
        )
      : resolvedFrom.search

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

    const search = replaceEqualDeep(resolvedFrom.search, postFilteredSearch)

    const searchStr = this.stringifySearch(search)
    let hash =
      dest.hash === true
        ? resolvedFrom.hash
        : functionalUpdate(dest.hash, resolvedFrom.hash)
    hash = hash ? `#${hash}` : ''

    return {
      pathname,
      search,
      searchStr,
      state: resolvedFrom.state,
      hash,
      href: `${pathname}${searchStr}${hash}`,
      key: dest.key,
    }
  }

  navigate(next: Location, replace?: boolean): void {
    this.current = next

    if (this.navigateTimeout) clearTimeout(this.navigateTimeout)

    let nextAction: 'push' | 'replace' = 'replace'

    if (!replace) {
      nextAction = 'push'
    }

    const isSameUrl =
      this.parseLocation(this.history.location).href === this.current.href

    if (isSameUrl && !this.current.key) {
      nextAction = 'replace'
    }

    if (nextAction === 'replace') {
      return this.history.replace({
        pathname: this.current.pathname,
        hash: this.current.hash,
        search: this.current.searchStr,
      })
    }

    return this.history.push({
      pathname: this.current.pathname,
      hash: this.current.hash,
      search: this.current.searchStr,
    })
  }

  parseLocation(
    location: History['location'],
    previousLocation?: Location,
  ): Location {
    const parsedSearch = this.parseSearch(location.search)

    return {
      pathname: location.pathname,
      searchStr: location.search,
      search: replaceEqualDeep(previousLocation?.search, parsedSearch),
      hash: location.hash.split('#').reverse()[0] ?? '',
      href: `${location.pathname}${location.search}${location.hash}`,
      state: location.state as LocationState,
      key: location.key,
    }
  }
}

export type RouterState = {
  current: TransitionState
  pending?: TransitionState
}

export type MatchRouteOptions = { pending: boolean; caseSensitive?: boolean }

export type LinkInfo = {
  next: Location
  handleClick: (e: MouseEvent) => void
  handleMouseEnter: (e: MouseEvent) => void
  activeProps: GetFrameworkGeneric<'LinkProps'>
  inactiveProps: GetFrameworkGeneric<'LinkProps'>
  isActive: boolean
}

export class RouterInstance extends Subscribable {
  locationManager: LocationManager
  basepath?: string
  rootMatch?: Omit<
    RouteMatch<unknown>,
    | 'route'
    | 'isFetching'
    | 'isPending'
    | 'cancel'
    | 'assignMatchLoader'
    | 'setStatus'
    | 'setPending'
    | 'startPending'
    | 'cancelPending'
    | 'resolve'
    | 'reject'
    | 'setFetching'
    | 'setMaxAge'
    | 'finish'
  >
  state: RouterState
  routes!: Route<unknown>[]
  filterRoutes?: FilterRoutesFn
  defaultLinkPreloadMaxAge?: number
  defaultLoaderMaxAge?: number
  useErrorBoundary?: boolean
  defaultElement?: GetFrameworkGeneric<'Element'>
  defaultErrorElement?: GetFrameworkGeneric<'Element'>
  defaultPendingElement?: GetFrameworkGeneric<'Element'>
  defaultPendingMs?: number
  defaultPendingMinMs?: number
  caseSensitive?: boolean

  routesById: Record<string, Route<unknown>> = {}

  constructor({
    locationManager,
    __experimental__snapshot,
  }: {
    locationManager: LocationManager
    __experimental__snapshot?: __Experimental__RouterSnapshot
  }) {
    super()

    this.locationManager = locationManager

    let matches: RouteMatch<unknown>[] = []

    if (__experimental__snapshot) {
      const matchLoader = new MatchLoader(this, locationManager.current)
      matchLoader.matches.forEach((match, index) => {
        if (match.id !== __experimental__snapshot.matches[index]?.id) {
          throw new Error(
            `Router hydration mismatch: ${match.id} !== ${__experimental__snapshot.matches[index]?.id}`,
          )
        }
        match.ownData = __experimental__snapshot.matches[index]?.ownData ?? {}
      })
      cascadeMatchData(matchLoader.matches)

      matches = matchLoader.matches
    }

    this.state = {
      current: {
        location: __experimental__snapshot?.location ?? locationManager.current,
        matches: matches,
      },
    }

    locationManager.subscribe(() => {
      this.loadNext(locationManager.current)
    })
  }

  mount = () => {
    const next = this.locationManager.buildNext(this.basepath, {
      to: '.',
      search: true,
      hash: true,
    })

    // If the current location isn't updated, trigger a navigation
    // to the current location. Otherwise, load the current location.
    if (next.href !== this.locationManager.current.href) {
      this.locationManager.navigate(next, true)
    } else {
      this.loadNext(this.locationManager.current)
    }
  }

  update = ({ basepath, routes, ...opts }: RouterOptions) => {
    Object.assign(this, opts)

    this.basepath = cleanPath(`/${basepath ?? ''}`)

    this.routesById = {}

    const recurseRoutes = (
      routes: Route<unknown>[],
      parent?: Route<unknown>,
    ): Route<unknown>[] => {
      return routes.map((route) => {
        const path = route.path ?? '*'

        const id = joinPaths([
          parent?.id === 'root' ? '' : parent?.id,
          `${path?.replace(/(.)\/$/, '$1')}${route.id ? `-${route.id}` : ''}`,
        ])

        route = {
          ...route,
          pendingMs: route.pendingMs ?? opts?.defaultPendingMs,
          pendingMinMs: route.pendingMinMs ?? opts?.defaultPendingMinMs,
          id,
        }

        if (this.routesById[id]) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn(
              `Duplicate routes found with id: ${id}`,
              this.routesById,
              route,
            )
          }
          throw new Error()
        }

        this.routesById[id] = route

        route.children = route.children?.length
          ? recurseRoutes(route.children, route)
          : undefined

        return route
      })
    }

    this.routes = recurseRoutes(routes)

    this.rootMatch = {
      id: 'root',
      params: {} as any,
      search: {} as any,
      pathname: this.basepath,
      ownData: {},
      data: {},
      status: 'resolved',
    }
  }

  loadNext = async (next: Location) => {
    if (this.state.pending && this.state.pending.location.key !== next.key) {
      this.state.pending.cancel?.()
    }

    const matchLoader = new MatchLoader(this, next)

    const unsubscribe = matchLoader.subscribe(() => {
      const currentMatches = this.state.current.matches

      currentMatches
        .filter((d) => {
          return !matchLoader.matches.find((dd) => dd.id === d.id)
        })
        .forEach((d) => {
          d.onExit?.(d)
        })

      currentMatches
        .filter((d) => {
          return matchLoader.matches.find((dd) => dd.id === d.id)
        })
        .forEach((d) => {
          d.route.onTransition?.(d)
        })

      matchLoader.matches
        .filter((d) => {
          return !currentMatches.find((dd) => dd.id === d.id)
        })
        .forEach((d) => {
          d.onExit = d.route.onMatch?.(d)
        })

      this.setState((old) => {
        return {
          ...old,
          current: {
            location: matchLoader.location,
            matches: matchLoader.matches,
          },
          pending: undefined,
        }
      })
    })

    try {
      const promise = matchLoader.load()
      matchLoader.startPending()
      this.setState((old) => {
        return {
          ...old,
          pending: {
            cancel: () => {
              unsubscribe()
              matchLoader?.cancel()
            },
            matchLoader,
            location: matchLoader.location,
            matches: matchLoader.matches,
          },
        }
      })
      await promise
    } finally {
      unsubscribe()
    }
  }

  setState = (updater: (old: RouterState) => RouterState) => {
    this.state = updater(this.state)
    this.cleanMatchCache()
    this.notify()
  }

  matchCache: Record<string, RouteMatch<unknown>> = {}

  removeMatchById = (id: string) => {
    const match = this.matchCache[id]

    if (!match) return

    if (match.route.unloader) {
      match.route.unloader(match)
    }

    delete this.matchCache[match.id]
  }

  cleanMatchCache = () => {
    const activeMatchIds = [
      ...(this?.state.current.matches ?? []),
      ...(this?.state.pending?.matches ?? []),
    ].map((d) => d.id)

    Object.values(this.matchCache).forEach((match) => {
      if (!match.updatedAt) {
        return
      }

      if (activeMatchIds.includes(match.id)) {
        return
      }

      const age = Date.now() - (match.updatedAt ?? 0)

      if (!match.maxAge || age > match.maxAge) {
        this.removeMatchById(match.id)
      }
    })
  }

  buildNext = (opts: BuildNextOptions) => {
    const next = this.locationManager.buildNext(this.basepath, opts)

    const matches = matchRoutes(this, next)

    const __preSearchFilters = matches
      .map((match) => match.route.preSearchFilters ?? [])
      .flat()
      .filter(Boolean)

    const __postSearchFilters = matches
      .map((match) => match.route.postSearchFilters ?? [])
      .flat()
      .filter(Boolean)

    return this.locationManager.buildNext(this.basepath, {
      ...opts,
      __preSearchFilters,
      __postSearchFilters,
    })
  }

  navigate = (opts: NavigateOptions) => {
    const next = this.buildNext(opts)
    this.locationManager.navigate(next, opts.replace)
  }

  go = (n: number) => this.locationManager.history.go(n)
  back = () => this.go(-1)
  forward = () => this.go(1)

  invalidateRoute = (opts: NavigateOptions) => {
    const next = this.buildNext(opts)
    const matchLoader = new MatchLoader(this, next)

    matchLoader.matches.forEach((match) => {
      this.removeMatchById(match.id)
    })
  }

  getOutletElement = (matches: RouteMatch<unknown>[]): JSX.Element => {
    const match = matches[0]

    return ((): React.ReactNode => {
      if (!match) {
        return null
      }

      const errorElement = match.errorElement ?? this.defaultErrorElement

      if (match.status === 'rejected') {
        if (errorElement) {
          return errorElement as any
        }

        if (!this.useErrorBoundary) {
          return 'An unknown/unhandled error occurred!'
        }

        throw match.error
      }

      if (match.status === 'loading') {
        return null
      }

      if (match.isPending) {
        const pendingElement =
          match.pendingElement ?? this.defaultPendingElement

        if (match.route.pendingMs || pendingElement) {
          return (pendingElement as any) ?? null
        }
      }

      return (match.element as any) ?? this.defaultElement
    })() as JSX.Element
  }

  resolvePath = (from: FromLocation, path: string) => {
    return resolvePath(this.basepath!, from.pathname, cleanPath(path))
  }

  matchRoute = (
    matchLocation: MatchLocation,
    opts?: MatchRouteOptions,
    from?: RouteMatch<unknown>,
  ) => {
    matchLocation = {
      ...matchLocation,
      to: matchLocation.to
        ? this.resolvePath(
            from ?? (this.rootMatch as RouteMatch<unknown>),
            `${matchLocation.to}`,
          )
        : undefined,
    }

    if (opts?.pending) {
      if (!this.state.pending?.location) {
        return undefined
      }
      return matchRoute(this.state.pending.location, matchLocation)
    }

    return matchRoute(this.state.current.location, matchLocation)
  }

  buildLinkInfo = ({
    to = '.',
    search,
    hash,
    target,
    replace,
    onClick,
    onMouseEnter,
    getActiveProps = () => ({ className: 'active', onClick }),
    getInactiveProps = () => ({}),
    activeOptions,
    preload,
    preloadMaxAge: userPreloadMaxAge,
    disabled,
    from,
  }: LinkOptions): LinkInfo | null => {
    // If this link simply reloads the current route,
    // make sure it has a new key so it will trigger a data refresh
    const invalidate = to && !search && !hash

    const preloadMaxAge =
      userPreloadMaxAge ?? this.defaultLinkPreloadMaxAge ?? 0

    // If this `to` is a valid external URL, return
    // null for LinkUtils
    try {
      new URL(`${to}`)
      return null
    } catch (e) {}

    const next = this.buildNext({
      to,
      search,
      hash,
      from,
    })

    // The click handler
    const handleClick = (e: MouseEvent) => {
      if (disabled) return
      if (onClick) onClick(e as any)
      if (
        !isCtrlEvent(e) &&
        !e.defaultPrevented &&
        (!target || target === '_self') &&
        e.button === 0
      ) {
        e.preventDefault()

        if (invalidate) {
          this.invalidateRoute({
            to,
            search,
            hash,
            from,
          })
        }

        // All is well? Navigate!)
        this.navigate({
          to,
          search,
          hash,
          replace,
          from,
        })
      }
    }

    // The click handler
    const handleMouseEnter = (e: MouseEvent) => {
      if (onMouseEnter) onMouseEnter(e as any)
      if (preload && preloadMaxAge > 0) {
        this.loadRoute(
          {
            to,
            search,
            hash,
            from,
          },
          { maxAge: preloadMaxAge },
        )
      }
    }

    // Compare path/hash for matches
    const pathIsEqual = this.state.current.location.pathname === next.pathname
    const currentPathSplit = this.state.current.location.pathname.split('/')
    const nextPathSplit = next.pathname.split('/')
    const pathIsFuzzyEqual = nextPathSplit.every(
      (d, i) => d === currentPathSplit[i],
    )
    const hashIsEqual = this.state.current.location.hash === next.hash
    // Combine the matches based on user options
    const pathTest = activeOptions?.exact ? pathIsEqual : pathIsFuzzyEqual
    const hashTest = activeOptions?.includeHash ? hashIsEqual : true

    // The final "active" test
    const isActive = pathTest && hashTest

    // Get the active props
    const activeProps = isActive ? getActiveProps() : {}

    // Get the inactive props
    const inactiveProps = isActive ? {} : getInactiveProps()

    return {
      next,
      handleClick,
      handleMouseEnter,
      activeProps,
      inactiveProps,
      isActive,
    }
  }

  __experimental__createSnapshot = (): __Experimental__RouterSnapshot => {
    return {
      ...this.state.current,
      matches: this.state.current.matches.map(({ ownData, id }) => {
        return {
          id,
          ownData,
        }
      }),
    }
  }

  loadRoute = async (
    navigateOpts: NavigateOptions = this.locationManager.current,
    loaderOpts?: { maxAge?: number },
  ) => {
    const next = this.buildNext(navigateOpts)
    const matchLoader = new MatchLoader(this, next)
    return await matchLoader.load(loaderOpts)
  }
}

export class MatchLoader extends Subscribable {
  router: RouterInstance
  location: Location
  matches: RouteMatch<unknown>[]
  matchPromise?: Promise<void>
  firstRenderPromises?: Promise<void>[]
  preNotifiedMatches: RouteMatch<unknown>[] = []

  constructor(router: RouterInstance, nextLocation: Location) {
    super()
    this.router = router
    this.location = nextLocation
    this.matches = []

    const unloadedMatches = matchRoutes(this.router, this.location)

    this.matches = unloadedMatches?.map(
      (unloadedMatch): RouteMatch<unknown> => {
        if (!this.router.matchCache[unloadedMatch.id]) {
          this.router.matchCache[unloadedMatch.id] = new RouteMatch(
            unloadedMatch,
          )
        }

        return this.router.matchCache[unloadedMatch.id]!
      },
    )
  }

  status: 'pending' | 'resolved' = 'pending'

  cancel = () => {
    this.matches.forEach((match) => {
      match.cancel()
    })
  }

  resolve = () => {
    this.status = 'resolved'
    cascadeMatchData(this.matches)
    this.notify()
  }

  onMatchUpdate = (
    routeMatch: RouteMatch<any>,
    event: 'isFetching' | 'isPending' | 'status' | 'finished',
  ) => {
    if (event === 'finished') {
      if (
        !this.preNotifiedMatches.includes(routeMatch as RouteMatch<unknown>)
      ) {
        this.preNotifiedMatches.push(routeMatch as RouteMatch<unknown>)
      }
    }

    if (this.preNotifiedMatches.length === this.matches.length) {
      this.resolve()
    }
  }

  load = async ({ maxAge }: { maxAge?: number } = {}) => {
    if (!this.matchPromise) {
      this.matchPromise = (async () => {
        this.router.cleanMatchCache()

        if (!this.matches?.length) {
          this.resolve()
          return
        }

        const matchPromises = this.matches.map(async (match, index) => {
          const parentMatch = this.matches?.[index - 1]
          match.assignMatchLoader?.(this)
          match.load?.({ maxAge, parentMatch, router: this.router })
          await match.loaderPromise
        })

        await Promise.all(matchPromises).then(() => {
          this.resolve()
          return this.matches
        })
      })()
    }

    return this.matchPromise
  }

  startPending = async () => {
    this.matches.forEach((match) => match.startPending?.())
  }
}

function cascadeMatchData(matches?: RouteMatch<unknown>[]) {
  matches?.forEach((match, index) => {
    const parentMatch = matches?.[index - 1]

    match.data = {
      ...(parentMatch?.data ?? ({} as any)),
      ...(match.ownData as object),
    }
  })
}

export class RouteMatch<TData = unknown> {
  id!: string
  route!: Route<TData>
  pathname!: string
  params!: Record<string, string>
  search!: SearchSchema
  updatedAt?: number
  element?: GetFrameworkGeneric<'Element', TData>
  errorElement?: GetFrameworkGeneric<'Element', TData>
  pendingElement?: GetFrameworkGeneric<'Element', TData>
  abortController?: AbortController
  error?: unknown
  loaderPromise?: Promise<void>
  importPromise?: Promise<void>
  elementsPromise?: Promise<void>
  dataPromise?: Promise<void>
  maxAge?: number
  matchLoader?: MatchLoader
  pendingTimeout?: Timeout
  pendingMinPromise?: Promise<void>
  onExit?: void | ((match: RouteMatch<TData>) => void)

  constructor(unloadedMatch: UnloadedMatch<TData>) {
    Object.assign(this, unloadedMatch)
  }

  status: 'loading' | 'resolved' | 'rejected' = 'loading'
  ownData: TData = {} as TData
  data: RouteData & TData = {} as RouteData & TData
  isFetching: boolean = false
  isPending: boolean = false

  private notify? = (
    event: 'isFetching' | 'isPending' | 'status' | 'finished',
  ) => {
    this.matchLoader?.onMatchUpdate(this, event)
  }

  cancel = () => {
    this.abortController?.abort()
    this.cancelPending()
  }

  assignMatchLoader = (matchLoader: MatchLoader) => {
    this.matchLoader = matchLoader
  }

  setStatus = (status: 'loading' | 'resolved' | 'rejected') => {
    this.status = status
    this.notify?.('status')
  }

  setPending = (isPending: boolean) => {
    this.isPending = isPending
    this.notify?.('isPending')
  }

  startPending = () => {
    this.cancelPending()

    if (this.route.pendingMs !== undefined) {
      this.pendingTimeout = setTimeout(() => {
        this.setPending(true)
        if (typeof this.route.pendingMinMs !== 'undefined') {
          this.pendingMinPromise = new Promise((r) =>
            setTimeout(r, this.route.pendingMinMs),
          )
        }
      }, this.route.pendingMs)
    }
  }

  cancelPending = () => {
    clearTimeout(this.pendingTimeout)
    this.setPending(false)
  }

  load? = async (opts: {
    maxAge?: number
    parentMatch?: RouteMatch<TData>
    router: RouterInstance
  }) => {
    this.maxAge =
      opts.maxAge ?? this.route.loaderMaxAge ?? opts.router.defaultLoaderMaxAge

    // If the match was in an error state, set it
    // to a loading state again. Otherwise, keep it
    // as loading or resolved
    if (this.status === 'rejected') {
      this.setStatus('loading')
    }

    // Let the match know it's fetching
    this.setFetching(true)

    if (!this.loaderPromise) {
      this.loaderPromise = (async () => {
        const importer = this.route.import

        // First, run any importers
        if (importer) {
          this.importPromise = importer({
            params: this.params,
            search: this.search,
          }).then((imported) => {
            this.route = {
              ...this.route,
              ...imported,
            }
          })
        }

        // Wait for the importer to finish before
        // attempting to load elements and data
        await this.importPromise

        // Next, load the elements and data in parallel

        this.elementsPromise = (async () => {
          // then run all element and data loaders in parallel
          // For each element type, potentially load it asynchronously
          const elementTypes = [
            'element',
            'errorElement',
            'pendingElement',
          ] as const

          await Promise.all(
            elementTypes.map(async (type) => {
              const routeElement = this.route[type]

              if (this[type]) {
                return
              }

              if (typeof routeElement === 'function') {
                const res = await (routeElement as any)(this)

                this[type] = res
              } else {
                this[type] = this.route[type] as any
              }
            }),
          )
        })()

        this.dataPromise = Promise.resolve()
          .then(() =>
            this.route.loader?.(this, {
              parentMatch: opts.parentMatch,
            }),
          )
          .then(this.resolve)
          .catch(this.reject)

        await Promise.all([this.elementsPromise, this.dataPromise])
        this.finish()
      })()
    }

    await this.loaderPromise
    return this.ownData
  }

  resolve = (data?: TData) => {
    this.ownData = data!
    this.error = undefined
    this.setStatus('resolved')
    this.updatedAt = Date.now()
  }

  reject = (err: unknown) => {
    if (process.env.NODE_ENV === 'development') {
      console.error(err)
    }
    this.error = err
    this.setStatus('rejected')
    this.updatedAt = Date.now()
  }

  setFetching = (isFetching: boolean) => {
    this.isFetching = isFetching
    this.notify?.('isFetching')
  }

  setMaxAge = (maxAge: number) => {
    this.maxAge = maxAge
  }

  finish = async () => {
    this.setFetching(false)
    this.setPending(false)
    await this.pendingMinPromise
    this.cancelPending()
    this.notify?.('finished')
  }
}

export interface MatchRoutesOptions<TData> {
  filterRoutes?: FilterRoutesFn
  defaultPendingMs?: number
  defaultPendingMinMs?: number
  defaultElement?: GetFrameworkGeneric<'SyncOrAsyncElement', TData>
  defaultErrorElement?: GetFrameworkGeneric<'SyncOrAsyncElement', TData>
  defaultPendingElement?: GetFrameworkGeneric<'SyncOrAsyncElement', TData>
}

export function matchRoute(
  currentLocation: Location,
  matchLocation: MatchLocation,
): RouteParams | undefined {
  const pathParams = matchByPath(currentLocation, matchLocation)
  const searchMatched = matchBySearch(currentLocation, matchLocation)

  if (matchLocation.to && !pathParams) {
    return
  }

  if (matchLocation.search && !searchMatched) {
    return
  }

  return pathParams ?? {}
}

export function matchRoutes(
  router: RouterInstance,
  currentLocation: Location,
): UnloadedMatch<unknown>[] {
  if (!router.routes.length) {
    return []
  }

  const matches: UnloadedMatch<unknown>[] = []

  const recurse = async (
    routes: Route<unknown>[],
    parentMatch: UnloadedMatch<unknown>,
  ): Promise<void> => {
    let { pathname, params } = parentMatch
    const filteredRoutes = router?.filterRoutes
      ? router?.filterRoutes(routes)
      : routes

    const route = filteredRoutes.find((route) => {
      const fullRoutePathName = joinPaths([pathname, route.path])

      const fuzzy = !!(route.path !== '/' || route.children?.length)

      const matchParams = matchRoute(currentLocation, {
        to: fullRoutePathName,
        search: route.search,
        fuzzy,
        caseSensitive: route.caseSensitive ?? router.caseSensitive,
      })

      if (matchParams) {
        params = {
          ...params,
          ...matchParams,
        }
      }

      return !!matchParams
    })

    if (!route) {
      return
    }

    const interpolatedPath = interpolatePath(route.path, params)
    pathname = joinPaths([pathname, interpolatedPath])

    const interpolatedId = interpolatePath(route.id, params, true)

    const match: UnloadedMatch<unknown> = {
      id: interpolatedId,
      route,
      params,
      pathname,
      search: currentLocation.search,
    }

    matches.push(match)

    if (route.children?.length) {
      recurse(route.children, match)
    }
  }

  recurse(router.routes, router.rootMatch as unknown as UnloadedMatch<unknown>)

  return matches
}

function interpolatePath(
  path: string | undefined,
  params: any,
  leaveWildcard?: boolean,
) {
  const interpolatedPathSegments = parsePathname(path)

  return joinPaths(
    interpolatedPathSegments.map((segment) => {
      if (segment.value === '*' && !leaveWildcard) {
        return ''
      }

      if (segment.type === 'param') {
        return params![segment.value.substring(1)] ?? ''
      }

      return segment.value
    }),
  )
}

export function warning(cond: any, message: string): cond is true {
  if (!cond) {
    if (typeof console !== 'undefined') console.warn(message)

    try {
      throw new Error(message)
    } catch {}
  }

  return true
}

function isFunction(d: any): d is Function {
  return typeof d === 'function'
}

export function functionalUpdate<TResult>(
  updater?: Updater<TResult>,
  previous?: TResult,
) {
  if (isFunction(updater)) {
    return updater(previous as TResult)
  }

  return updater
}

function joinPaths(paths: (string | undefined)[]) {
  return cleanPath(paths.filter(Boolean).join('/'))
}

export function cleanPath(path: string) {
  // remove double slashes
  return `${path}`.replace(/\/{2,}/g, '/')
}

export function matchByPath(
  currentLocation: Location,
  matchLocation: MatchLocation,
): Record<string, string> | undefined {
  const baseSegments = parsePathname(currentLocation.pathname)
  const routeSegments = parsePathname(`${matchLocation.to ?? '*'}`)

  const params: Record<string, string> = {}

  let isMatch = (() => {
    for (
      let i = 0;
      i < Math.max(baseSegments.length, routeSegments.length);
      i++
    ) {
      const baseSegment = baseSegments[i]
      const routeSegment = routeSegments[i]

      const isLastRouteSegment = i === routeSegments.length - 1
      const isLastBaseSegment = i === baseSegments.length - 1

      if (routeSegment) {
        if (routeSegment.type === 'wildcard') {
          if (baseSegment?.value) {
            params['*'] = joinPaths(baseSegments.slice(i).map((d) => d.value))
            return true
          }
          return false
        }

        if (routeSegment.type === 'pathname') {
          if (routeSegment.value === '/' && !baseSegment?.value) {
            return true
          }

          if (baseSegment) {
            if (matchLocation.caseSensitive) {
              if (routeSegment.value !== baseSegment.value) {
                return false
              }
            } else if (
              routeSegment.value.toLowerCase() !==
              baseSegment.value.toLowerCase()
            ) {
              return false
            }
          }
        }

        if (!baseSegment) {
          return false
        }

        if (routeSegment.type === 'param') {
          params[routeSegment.value.substring(1)] = baseSegment.value
        }
      }

      if (isLastRouteSegment && !isLastBaseSegment) {
        return !!matchLocation.fuzzy
      }
    }
    return true
  })()

  return isMatch ? (params as Record<string, string>) : undefined
}

function matchBySearch(
  currentLocation: Location,
  matchLocation: MatchLocation,
) {
  return !!(
    matchLocation.search && matchLocation.search(currentLocation.search)
  )
}

export function parsePathname(pathname?: string): Segment[] {
  if (!pathname) {
    return []
  }

  pathname = cleanPath(pathname)

  const segments: Segment[] = []

  if (pathname.slice(0, 1) === '/') {
    pathname = pathname.substring(1)
    segments.push({
      type: 'pathname',
      value: '/',
    })
  }

  if (!pathname) {
    return segments
  }

  // Remove empty segments and '.' segments
  const split = pathname.split('/').filter(Boolean)

  segments.push(
    ...split.map((part): Segment => {
      if (part.startsWith('*')) {
        return {
          type: 'wildcard',
          value: part,
        }
      }

      if (part.charAt(0) === ':') {
        return {
          type: 'param',
          value: part,
        }
      }

      return {
        type: 'pathname',
        value: part,
      }
    }),
  )

  if (pathname.slice(-1) === '/') {
    pathname = pathname.substring(1)
    segments.push({
      type: 'pathname',
      value: '/',
    })
  }

  return segments
}

export function resolvePath(basepath: string, base: string, to: string) {
  base = base
    .replace(new RegExp(`^${basepath}`), '/')
    .replace(/(.+)\/$/, (_, group) => group)
  to = to.replace(new RegExp(`^${basepath}`), '/')

  let baseSegments = parsePathname(base)
  const toSegments = parsePathname(to)

  toSegments.forEach((toSegment, index) => {
    if (toSegment.value === '/') {
      if (!index) {
        // Leading slash
        baseSegments = [toSegment]
      } else if (index === toSegments.length - 1) {
        // Trailing Slash
        baseSegments.push(toSegment)
      } else {
        // ignore inter-slashes
      }
    } else if (toSegment.value === '..') {
      baseSegments.pop()
    } else if (toSegment.value === '.') {
      return
    } else {
      baseSegments.push(toSegment)
    }
  })

  const joined = joinPaths([basepath, ...baseSegments.map((d) => d.value)])

  return cleanPath(joined)
}

/**
 * This function returns `a` if `b` is deeply equal.
 * If not, it will replace any deeply equal children of `b` with those of `a`.
 * This can be used for structural sharing between JSON values for example.
 */
function replaceEqualDeep(prev: any, next: any) {
  if (prev === next) {
    return prev
  }

  const array = Array.isArray(prev) && Array.isArray(next)

  if (array || (isPlainObject(prev) && isPlainObject(next))) {
    const aSize = array ? prev.length : Object.keys(prev).length
    const bItems = array ? next : Object.keys(next)
    const bSize = bItems.length
    const copy: any = array ? [] : {}

    let equalItems = 0

    for (let i = 0; i < bSize; i++) {
      const key = array ? i : bItems[i]
      copy[key] = replaceEqualDeep(prev[key], next[key])
      if (copy[key] === prev[key]) {
        equalItems++
      }
    }

    return aSize === bSize && equalItems === aSize ? prev : copy
  }

  return next
}

// Copied from: https://github.com/jonschlinkert/is-plain-object
function isPlainObject(o: any) {
  if (!hasObjectPrototype(o)) {
    return false
  }

  // If has modified constructor
  const ctor = o.constructor
  if (typeof ctor === 'undefined') {
    return true
  }

  // If has modified prototype
  const prot = ctor.prototype
  if (!hasObjectPrototype(prot)) {
    return false
  }

  // If constructor does not have an Object-specific method
  if (!prot.hasOwnProperty('isPrototypeOf')) {
    return false
  }

  // Most likely a plain Object
  return true
}

function hasObjectPrototype(o: any) {
  return Object.prototype.toString.call(o) === '[object Object]'
}

export const defaultParseSearch = parseSearchWith(JSON.parse)
export const defaultStringifySearch = stringifySearchWith(JSON.stringify)

export function parseSearchWith(parser: (str: string) => any) {
  return (searchStr: string): Record<string, any> => {
    if (searchStr.substring(0, 1) === '?') {
      searchStr = searchStr.substring(1)
    }

    let query: Record<string, unknown> = decode(searchStr)

    // Try to parse any query params that might be json
    for (let key in query) {
      const value = query[key]
      if (typeof value === 'string') {
        try {
          query[key] = parser(value)
        } catch (err) {
          //
        }
      }
    }

    return query
  }
}

export function stringifySearchWith(stringify: (search: any) => string) {
  return (search: Record<string, any>) => {
    search = { ...search }

    if (search) {
      Object.keys(search).forEach((key) => {
        const val = search[key]
        if (typeof val === 'undefined' || val === undefined) {
          delete search[key]
        } else if (val && typeof val === 'object' && val !== null) {
          try {
            search[key] = stringify(val)
          } catch (err) {
            // silent
          }
        }
      })
    }

    const searchStr = encode(search as Record<string, string>).toString()

    return searchStr ? `?${searchStr}` : ''
  }
}

function isCtrlEvent(e: MouseEvent) {
  return !!(e.metaKey || e.altKey || e.ctrlKey || e.shiftKey)
}

// export function time<T>(label: string, cb: () => T): T {
//   const start = Date.now()
//   const res = cb()
//   const end = Date.now()
//   console.log(label, `${end - start}ms`)
//   return res
// }
