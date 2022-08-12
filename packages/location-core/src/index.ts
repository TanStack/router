import {
  createHashHistory,
  createBrowserHistory,
  createMemoryHistory,
  BrowserHistory,
  MemoryHistory,
  History,
  HashHistory,
} from 'history'

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
export interface LoaderData {}

type Timeout = ReturnType<typeof setTimeout>

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
  path?: string | `:${keyof RouteParams}`
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
  children?: Route<any>[]
  // Route Loaders (see below) can be inline on the route, or resolved async
} & RouteLoaders<TData> & {
    // If `import` is defined, this route can resolve its elements and loaders in a single asynchronous call
    // This is particularly useful for code-splitting or module federation
    import?: (opts: {
      params: RouteParams
      search: SearchSchema
    }) => Promise<RouteLoaders<TData>>
  }

export interface RouteLoaders<
  TData = unknown,
  TActionPayload = unknown,
  TActionData = unknown,
> {
  // The content to be rendered when the route is matched. If no element is provided, defaults to `<Outlet />`
  element?: GetFrameworkGeneric<'SyncOrAsyncElement', TData>
  // The content to be rendered when `loader` encounters an error
  errorElement?: GetFrameworkGeneric<'SyncOrAsyncElement', TData>
  // The content to be rendered when the duration of `loader` execution surpasses the `pendingMs` duration
  pendingElement?: GetFrameworkGeneric<'SyncOrAsyncElement', TData>
  // An asynchronous function responsible for preparing or fetching data for the route before it is rendered
  loader?: LoaderFn<TData>
  // An asynchronous function made available to the route for performing asynchronous or mutative actions that
  // might invalidate the route's data.
  action?: ActionFn<TActionPayload, TActionData>
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
  from?: string
  fromCurrent?: boolean
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
  match: RouteMatch<TData>,
  ctx: RouteMatchContext<TData>,
) => PromiseLike<TData>

export type ActionFn<TPayload, TData> = (
  payload: TPayload,
  ctx: RouteMatchContext<TData>,
) => PromiseLike<TData>

export type UnloaderFn<TData> = (routeMatch: RouteMatch<TData>) => void

export type RouteMatchContext<TData> = {
  match: UnloadedMatch<TData>
  signal?: AbortSignal
  router: RouterInstance
}

export type RouterState = {
  status: 'idle' | 'loading'
  location: Location
  matches: RouteMatch<unknown>[]
  lastUpdated: number
  loaderData: LoaderData
  action?: Action
  actions: Record<string, Action>
  pending?: PendingState
}

export type PendingState = {
  location: Location
  matches: RouteMatch<unknown>[]
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

export type __Experimental__RouterSnapshot = {
  location: Location
  matches: SnapshotRouteMatch<unknown>[]
}

export type SnapshotRouteMatch<TData> = {
  id: string
  data: TData
}

export type BuildNextOptions = {
  to?: string | number | null
  search?: true | Updater<SearchSchema>
  hash?: true | Updater<string>
  key?: string
  from?: string
  fromCurrent?: boolean
  __preSearchFilters?: SearchFilter[]
  __postSearchFilters?: SearchFilter[]
}

export type NavigateOptions = BuildNextOptions & {
  replace?: boolean
}

export type LinkOptions = {
  // The absolute or relative destination pathname
  to?: string | number | null
  // The new search object or a function to update it
  search?: true | Updater<SearchSchema>
  // The new has string or a function to update it
  hash?: Updater<string>
  // Whether to replace the current history stack instead of pushing a new one
  replace?: boolean
  // The standard anchor tag target attribute
  target?: HTMLAnchorElement['target']
  // A function that is passed the [Location API](#location-api) and returns additional props for the `active` state of this link. These props override other props passed to the link (`style`'s are merged, `className`'s are concatenated)
  getActiveProps?: () => GetFrameworkGeneric<'LinkProps'>
  // A function that is passed the [Location API](#location-api) and returns additional props for the `inactive` state of this link. These props override other props passed to the link (`style`'s are merged, `className`'s are concatenated)
  getInactiveProps?: () => GetFrameworkGeneric<'LinkProps'>
  // Defaults to `{ exact: false, includeHash: false }`
  activeOptions?: ActiveOptions
  // If set, will preload the linked route on hover and cache it for this many milliseconds in hopes that the user will eventually navigate there.
  preload?: false | 'intent'
  // When preloaded and set, will cache the preloaded result for this duration in milliseconds
  preloadMaxAge?: number
  // Delay intent preloading by this many milliseconds. If the intent exits before this delay, the preload will be cancelled.
  preloadDelay?: number
  // If true, will render the link without the href attribute
  disabled?: boolean
  // The root (excluding the basepath) from which to resolve the route.
  // Defaults to the current location's pathname.
  // To navigate from the root, pass `/` as the from
  from?: string
}

export type FullLinkOptions = LinkOptions & {
  // This ref is used internally by framework adapters to track mutable state for each link.
  // Passing it in userland is a no-op.
  ref: { preloadTimeout?: null | ReturnType<typeof setTimeout> }
}

type ActiveOptions = {
  exact?: boolean
  includeHash?: boolean
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
  preNotify = () => {}

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
    this.preNotify()
    this.listeners.forEach((listener) => listener())
  }
}

export type MatchRouteOptions = { pending: boolean; caseSensitive?: boolean }

export type LinkInfo = {
  next: Location
  handleFocus: (e: any) => void
  handleClick: (e: any) => void
  handleEnter: (e: any) => void
  handleLeave: (e: any) => void
  activeProps: GetFrameworkGeneric<'LinkProps'>
  inactiveProps: GetFrameworkGeneric<'LinkProps'>
  isActive: boolean
}

export type PreloadCacheEntry = {
  expiresAt: number
  match: RouteMatch<unknown>
}

export type RouterOptions = Partial<
  Pick<RouterInstance, 'history' | 'stringifySearch' | 'parseSearch'>
> &
  Pick<
    RouterInstance,
    | 'routes'
    | 'basepath'
    | 'filterRoutes'
    | 'defaultLinkPreload'
    | 'defaultLinkPreloadMaxAge'
    | 'defaultLinkPreloadDelay'
    | 'defaultLoaderMaxAge'
    | 'useErrorBoundary'
    | 'defaultElement'
    | 'defaultErrorElement'
    | 'defaultPendingElement'
    | 'defaultPendingMs'
    | 'defaultPendingMinMs'
    | 'caseSensitive'
    | '__experimental__snapshot'
  >

export type Action<
  TPayload = unknown,
  TResponse = unknown,
  TError = unknown,
> = {
  status: 'idle' | 'pending' | 'success' | 'error'
  send: (payload?: TPayload) => Promise<TResponse>
  data?: TResponse
  error?: TError
}

export class RouterInstance extends Subscribable {
  // Options:
  // The history object to be used internally
  // A history will be created automatically if not provided.
  history: BrowserHistory | MemoryHistory | HashHistory
  stringifySearch: SearchSerializer
  parseSearch: SearchParser
  basepath?: string
  routes?: Route<unknown>[]
  filterRoutes?: FilterRoutesFn
  defaultLinkPreload?: false | 'intent'
  defaultLinkPreloadMaxAge?: number
  defaultLinkPreloadDelay?: number
  defaultLoaderMaxAge?: number
  useErrorBoundary?: boolean
  defaultElement?: GetFrameworkGeneric<'Element'>
  defaultErrorElement?: GetFrameworkGeneric<'Element'>
  defaultPendingElement?: GetFrameworkGeneric<'Element'>
  defaultPendingMs?: number
  defaultPendingMinMs?: number
  caseSensitive?: boolean
  __experimental__snapshot?: __Experimental__RouterSnapshot

  // Internal:
  location: Location
  navigateTimeout?: Timeout
  nextAction?: 'push' | 'replace'
  rootMatch?: Pick<
    RouteMatch<unknown>,
    'id' | 'params' | 'search' | 'pathname' | 'data' | 'data' | 'status'
  >
  destroy: () => void
  state: RouterState
  isTransitioning: boolean = false
  routesById: Record<string, Route<unknown>> = {}
  navigationPromise = Promise.resolve()
  resolveNavigation = () => {}
  loadPromise = Promise.resolve()
  resolveLoad = () => {}
  startedLoadingAt = Date.now()
  resolveEarly = false

  constructor(options?: RouterOptions) {
    super()

    this.history = options?.history || createDefaultHistory()
    this.stringifySearch = options?.stringifySearch ?? defaultStringifySearch
    this.parseSearch = options?.parseSearch ?? defaultParseSearch

    this.location = this.parseLocation(this.history.location)

    this.destroy = this.history.listen((event) => {
      console.log('listen')
      this.loadLocation(this.parseLocation(event.location, this.location))
    })

    let matches: RouteMatch<unknown>[] = []

    const __experimental__snapshot = options?.__experimental__snapshot

    if (__experimental__snapshot) {
      // const matches = this.matchRoutes(this.location)
      // matchLoader.matches.forEach((match, index) => {
      //   if (match.id !== __experimental__snapshot.matches[index]?.id) {
      //     throw new Error(
      //       `Router hydration mismatch: ${match.id} !== ${__experimental__snapshot.matches[index]?.id}`,
      //     )
      //   }
      //   match.data = __experimental__snapshot.matches[index]?.data ?? {}
      // })
      // cascadeMatchData(matchLoader.matches)
      // matches = matchLoader.matches
    }

    this.state = {
      status: 'idle',
      location: __experimental__snapshot?.location ?? this.location,
      matches: matches,
      actions: {},
      loaderData: {},
      lastUpdated: Date.now(),
    }
  }

  preNotify = () => {
    const match = last(this.state.matches)

    let loaderData = {}

    if (match) {
      const recurse = (m: RouteMatch<any>) => {
        if (m.parentMatch) {
          recurse(m.parentMatch)
        }
        loaderData = { ...loaderData, ...(m.data as any) }
      }

      recurse(match)
    }

    const isPending =
      !!this.state.pending ||
      this.state.matches.find((d) => d.status === 'loading')

    const isLoading = this.state.action?.status === 'pending' || isPending

    this.state = {
      ...this.state,
      status: isLoading ? 'loading' : 'idle',
      loaderData: replaceEqualDeep(this.state.loaderData, loaderData),
      lastUpdated: Date.now(),
    }
  }

  parseLocation = (
    location: History['location'],
    previousLocation?: Location,
  ): Location => {
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

  buildLocation = (
    basepath: string = '/',
    dest: BuildNextOptions = {},
  ): Location => {
    const resolvedFrom: Location = {
      ...this.location,
      pathname: dest.fromCurrent
        ? this.location.pathname
        : dest.from ?? this.location.pathname,
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

  commitLocation = (
    next: Location,
    replace?: boolean,
    opts?: { resolveEarly?: boolean },
  ) => {
    console.log('commit')

    if (this.navigateTimeout) clearTimeout(this.navigateTimeout)

    let nextAction: 'push' | 'replace' = 'replace'

    if (!replace) {
      nextAction = 'push'
    }

    const isSameUrl =
      this.parseLocation(this.history.location).href === next.href

    if (isSameUrl && !next.key) {
      nextAction = 'replace'
    }

    if (nextAction === 'replace') {
      this.history.replace({
        pathname: next.pathname,
        hash: next.hash,
        search: next.searchStr,
      })
    } else {
      this.history.push({
        pathname: next.pathname,
        hash: next.hash,
        search: next.searchStr,
      })
    }

    this.navigationPromise = new Promise((resolve) => {
      this.resolveNavigation = resolve
      this.resolveEarly = !!opts?.resolveEarly
      console.log(this.resolveEarly)
    })

    return this.navigationPromise
  }

  mount = () => {
    const next = this.buildLocation(this.basepath, {
      to: '.',
      search: true,
      hash: true,
    })

    // If the current location isn't updated, trigger a navigation
    // to the current location. Otherwise, load the current location.
    if (next.href !== this.location.href) {
      return this.commitLocation(next, true)
    } else {
      return this.loadLocation()
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

    this.routes = recurseRoutes(routes ?? [])

    this.rootMatch = {
      id: 'root',
      params: {} as any,
      search: {} as any,
      pathname: this.basepath,
      data: {},
      status: 'success',
    }
  }

  buildNext = (opts: BuildNextOptions) => {
    const next = this.buildLocation(this.basepath, opts)

    const matches = this.matchRoutes(next)

    const __preSearchFilters = matches
      .map((match) => match.route.preSearchFilters ?? [])
      .flat()
      .filter(Boolean)

    const __postSearchFilters = matches
      .map((match) => match.route.postSearchFilters ?? [])
      .flat()
      .filter(Boolean)

    return this.buildLocation(this.basepath, {
      ...opts,
      __preSearchFilters,
      __postSearchFilters,
    })
  }

  navigate = (
    opts: NavigateOptions,
    otherOpts?: { resolveEarly?: boolean },
  ) => {
    console.log('navigate', opts)
    const next = this.buildNext(opts)
    return this.commitLocation(next, opts.replace, otherOpts)
  }

  cancelMatches = () => {
    ;[...this.state.matches, ...(this.state.pending?.matches ?? [])].forEach(
      (match) => {
        match.cancel()
      },
    )
  }

  loadLocation = async (next?: Location) => {
    console.log('load location', next)
    const now = Date.now()
    this.startedLoadingAt = now

    if (next) {
      // Ingest the new location
      this.location = next
    }

    // Cancel any pending  matches
    this.cancelMatches()

    // Match the routes
    const unloadedMatches = this.matchRoutes(this.location)
    const resolvedMatches = this.resolveMatches(unloadedMatches)

    this.state = {
      ...this.state,
      pending: {
        matches: resolvedMatches,
        location: this.location,
      },
    }
    this.notify()

    console.log('hello1')
    if (this.resolveEarly) {
      console.log('hello2')
      this.resolveEarly = false
      this.resolveNavigation()
    }

    this.loadPromise = new Promise((resolve) => {
      this.resolveLoad = resolve
    })

    // Load the matches
    const matches = await this.loadMatches(resolvedMatches, {
      withPending: true,
    })

    if (this.startedLoadingAt !== now) {
      // Ignore side-effects of match loading
      return
    }

    const previousMatches = this.state.matches

    previousMatches
      .filter((d) => {
        return !matches.find((dd) => dd.id === d.id)
      })
      .forEach((d) => {
        d.onExit?.(d)
      })

    previousMatches
      .filter((d) => {
        return matches.find((dd) => dd.id === d.id)
      })
      .forEach((d) => {
        d.route.onTransition?.(d)
      })

    matches
      .filter((d) => {
        return !previousMatches.find((dd) => dd.id === d.id)
      })
      .forEach((d) => {
        d.onExit = d.route.onMatch?.(d)
      })

    this.state = {
      ...this.state,
      location: this.location,
      matches: matches,
      pending: undefined,
    }

    this.notify()
    this.resolveNavigation()
    this.resolveLoad()
  }

  preloadCache: Record<string, PreloadCacheEntry> = {}

  cleanPreloadCache = () => {
    const activeMatchIds = [
      ...(this?.state.matches ?? []),
      ...(this?.state.pending?.matches ?? []),
    ].map((d) => d.id)

    const now = Date.now()

    Object.keys(this.preloadCache).forEach((matchId) => {
      const entry = this.preloadCache[matchId]!

      if (activeMatchIds.includes(matchId)) {
        return
      }

      if (entry.expiresAt < now) {
        delete this.preloadCache[matchId]
      }
    })
  }

  loadRoute = async (
    navigateOpts: NavigateOptions = this.location,
    loaderOpts: { maxAge: number },
  ) => {
    const next = this.buildNext(navigateOpts)
    const unloadedMatches = this.matchRoutes(next)
    const matches = this.resolveMatches(unloadedMatches)
    await this.loadMatches(matches, {
      preload: true,
      maxAge: loaderOpts.maxAge,
    })
    return matches
  }

  matchRoutes = (location: Location): UnloadedMatch<unknown>[] => {
    this.cleanPreloadCache()

    const matches: UnloadedMatch<unknown>[] = []

    if (!this.routes?.length) {
      return matches
    }

    const recurse = async (
      routes: Route<unknown>[],
      parentMatch: UnloadedMatch<unknown>,
    ): Promise<void> => {
      let { pathname, params } = parentMatch
      const filteredRoutes = this?.filterRoutes
        ? this?.filterRoutes(routes)
        : routes

      const route = filteredRoutes?.find((route) => {
        const fullRoutePathName = joinPaths([pathname, route.path])

        const fuzzy = !!(route.path !== '/' || route.children?.length)

        const matchParams = matchRoute(location, {
          to: fullRoutePathName,
          search: route.search,
          fuzzy,
          caseSensitive: route.caseSensitive ?? this.caseSensitive,
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
        search: location.search,
      }

      matches.push(match)

      if (route.children?.length) {
        recurse(route.children, match)
      }
    }

    recurse(this.routes, this.rootMatch as unknown as UnloadedMatch<unknown>)

    return matches
  }

  resolveMatches = (
    unloadedMatches: UnloadedMatch<unknown>[],
  ): RouteMatch<unknown>[] => {
    if (!unloadedMatches?.length) {
      return []
    }

    const existingMatches = [
      ...this.state.matches,
      ...(this.state.pending?.matches ?? []),
    ]

    const matches = unloadedMatches.map((unloadedMatch, i) => {
      return (
        existingMatches.find((d) => d.id === unloadedMatch.id) ||
        this.preloadCache[unloadedMatch.id]?.match ||
        new RouteMatch(this, unloadedMatch)
      )
    })

    matches.forEach((match, index) => {
      match.setParentMatch(matches[index - 1])
    })

    return matches
  }

  loadMatches = async (
    resolvedMatches: RouteMatch<unknown>[],
    loaderOpts?: { withPending?: boolean } & (
      | { preload: true; maxAge: number }
      | { preload?: false; maxAge?: never }
    ),
  ): Promise<RouteMatch<unknown>[]> => {
    const matchPromises = resolvedMatches.map(async (match) => {
      if (
        match.isInvalid ||
        match.status === 'error' ||
        match.status === 'idle'
      ) {
        const promise = match.load()
        if (loaderOpts?.withPending) match.startPending()
        if (loaderOpts?.preload) {
          this.preloadCache[match.id] = {
            expiresAt: Date.now() + loaderOpts?.maxAge!,
            match,
          }
        }
        return promise
      }

      return match.loaderPromise
    })

    await Promise.all(matchPromises)

    return resolvedMatches
  }

  invalidateRoute = (opts: MatchLocation) => {
    const next = this.buildNext(opts)
    const unloadedMatchIds = this.matchRoutes(next).map((d) => d.id)
    ;[...this.state.matches, ...(this.state.pending?.matches ?? [])].forEach(
      (match) => {
        if (unloadedMatchIds.includes(match.id)) {
          match.isInvalid = true
        }
      },
    )

    if (process.env.NODE_ENV === 'development') {
      this.notify()
    }
  }

  reload = () =>
    this.navigate({
      to: '',
      fromCurrent: true,
      replace: true,
    })

  getAction = <TPayload = unknown, TResponse = unknown, TError = unknown>(
    matchOpts: Pick<MatchLocation, 'to' | 'from'>,
    opts?: { isActive?: boolean },
  ): Action<TPayload, TResponse, TError> => {
    const next = this.buildNext(matchOpts)
    const matches = this.matchRoutes(next)
    const match = matches.find((d) => d.pathname === next.pathname)!

    if (!match) {
      return {
        status: 'idle',
        send: (() => {}) as any,
      }
    }

    let action = (this.state.actions[match.id] ||
      (() => {
        this.state.actions[match.id] = {
          status: 'idle',
          send: null!,
        }
        return this.state.actions[match.id]!
      })()) as Action<TPayload, TResponse, TError>

    Object.assign(action, {
      match,
      send: async (
        payload?: unknown,
        actionOpts?: { invalidate?: boolean },
      ) => {
        if (!match) {
          return
        }
        const invalidate = actionOpts?.invalidate ?? true

        if (opts?.isActive) {
          this.state.action = action as Action<unknown, unknown, unknown>
        }

        action.status = 'pending'
        this.notify()

        try {
          const res = await match?.route.action?.(payload, {
            match,
            router: this,
          })
          if (invalidate) {
            this.invalidateRoute({ to: '.', fromCurrent: true })
            await this.reload()
          }
          action.status = 'success'
          return res
        } catch (err) {
          action.error = err as TError
          action.status = 'error'
        } finally {
          this.notify()
        }
      },
    })

    return action
  }

  getOutletElement = (matches: RouteMatch<unknown>[]): JSX.Element => {
    const match = matches[0]

    return ((): React.ReactNode => {
      if (!match) {
        return null
      }

      const errorElement = match.errorElement ?? this.defaultErrorElement

      if (match.status === 'error') {
        if (errorElement) {
          return errorElement as any
        }

        if (!this.useErrorBoundary) {
          return 'An unknown/unhandled error occurred!'
        }

        throw match.error
      }

      if (match.status === 'loading' || match.status === 'idle') {
        if (match.isPending) {
          const pendingElement =
            match.pendingElement ?? this.defaultPendingElement

          if (match.route.pendingMs || pendingElement) {
            return (pendingElement as any) ?? null
          }
        }

        return null
      }

      return (match.element as any) ?? this.defaultElement
    })() as JSX.Element
  }

  resolvePath = (from: string, path: string) => {
    return resolvePath(this.basepath!, from, cleanPath(path))
  }

  matchRoute = (matchLocation: MatchLocation, opts?: MatchRouteOptions) => {
    matchLocation = {
      ...matchLocation,
      to: matchLocation.to
        ? this.resolvePath(
            matchLocation.from || this.rootMatch!.pathname,
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

    return matchRoute(this.state.location, matchLocation)
  }

  buildLinkInfo = ({
    to = '.',
    search,
    hash,
    target,
    replace,
    getActiveProps = () => ({ className: 'active' }),
    getInactiveProps = () => ({}),
    activeOptions,
    preload,
    preloadMaxAge: userPreloadMaxAge,
    preloadDelay: userPreloadDelay,
    disabled,
    from,
    ref,
  }: FullLinkOptions): LinkInfo | null => {
    // If this link simply reloads the current route,
    // make sure it has a new key so it will trigger a data refresh

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

    preload = preload ?? this.defaultLinkPreload
    const preloadMaxAge =
      userPreloadMaxAge ?? this.defaultLinkPreloadMaxAge ?? 2000
    const preloadDelay = userPreloadDelay ?? this.defaultLinkPreloadDelay ?? 50

    // Compare path/hash for matches
    const pathIsEqual = this.state.location.pathname === next.pathname
    const currentPathSplit = this.state.location.pathname.split('/')
    const nextPathSplit = next.pathname.split('/')
    const pathIsFuzzyEqual = nextPathSplit.every(
      (d, i) => d === currentPathSplit[i],
    )
    const hashIsEqual = this.state.location.hash === next.hash
    // Combine the matches based on user options
    const pathTest = activeOptions?.exact ? pathIsEqual : pathIsFuzzyEqual
    const hashTest = activeOptions?.includeHash ? hashIsEqual : true

    // The final "active" test
    const isActive = pathTest && hashTest

    // Get the active props
    const activeProps = isActive ? getActiveProps() : {}

    // Get the inactive props
    const inactiveProps = isActive ? {} : getInactiveProps()

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
          this.invalidateRoute({
            to,
            search,
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
    const handleFocus = (e: MouseEvent) => {
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

    const handleEnter = (e: MouseEvent) => {
      if (preload && preloadMaxAge > 0) {
        if (ref.preloadTimeout) {
          return
        }

        ref.preloadTimeout = setTimeout(() => {
          ref.preloadTimeout = null
          this.loadRoute(
            {
              to,
              search,
              hash,
              from,
            },
            { maxAge: preloadMaxAge },
          )
        }, preloadDelay)
      }
    }

    const handleLeave = (e: MouseEvent) => {
      if (ref.preloadTimeout) {
        clearTimeout(ref.preloadTimeout)
        ref.preloadTimeout = null
      }
    }

    return {
      next,
      handleFocus,
      handleClick,
      handleEnter,
      handleLeave,
      activeProps,
      inactiveProps,
      isActive,
    }
  }

  __experimental__createSnapshot = (): __Experimental__RouterSnapshot => {
    return {
      ...this.state,
      matches: this.state.matches.map(({ data, id }) => {
        return {
          id,
          data,
        }
      }),
    }
  }
}

export class RouteMatch<TData = unknown> {
  id!: string
  router: RouterInstance
  parentMatch?: RouteMatch<any>
  route!: Route<TData>
  pathname!: string
  params!: Record<string, string>
  search!: SearchSchema
  updatedAt?: number
  element?: GetFrameworkGeneric<'Element', TData>
  errorElement?: GetFrameworkGeneric<'Element', TData>
  pendingElement?: GetFrameworkGeneric<'Element', TData>
  error?: unknown
  loaderPromise?: Promise<void>
  importPromise?: Promise<void>
  elementsPromise?: Promise<void>
  dataPromise?: Promise<void>
  pendingTimeout?: Timeout
  pendingMinPromise?: Promise<void>
  onExit?: void | ((match: RouteMatch<TData>) => void)
  isInvalid = false

  constructor(router: RouterInstance, unloadedMatch: UnloadedMatch<TData>) {
    this.router = router
    Object.assign(this, unloadedMatch)
  }

  status: 'idle' | 'loading' | 'success' | 'error' = 'idle'
  data: TData = {} as TData
  isPending: boolean = false
  abortController = new AbortController()
  resolve = () => {}

  notify = () => {
    this.resolve()
    this.router.notify()
  }

  cancel = () => {
    this.abortController?.abort()
    this.cancelPending()
  }

  startPending = () => {
    if (
      this.pendingTimeout ||
      this.status !== 'loading' ||
      typeof this.route.pendingMs === 'undefined'
    ) {
      return
    }

    this.pendingTimeout = setTimeout(() => {
      this.isPending = true
      this.resolve()
      if (typeof this.route.pendingMinMs !== 'undefined') {
        this.pendingMinPromise = new Promise((r) =>
          setTimeout(r, this.route.pendingMinMs),
        )
      }
    }, this.route.pendingMs)
  }

  cancelPending = () => {
    this.isPending = false
    clearTimeout(this.pendingTimeout)
  }

  setParentMatch = (parentMatch?: RouteMatch<TData>) => {
    this.parentMatch = parentMatch
  }

  load = () => {
    // If the match was in an error state, set it
    // to a loading state again. Otherwise, keep it
    // as loading or resolved
    if (this.status === 'error' || this.status === 'idle') {
      this.status = 'loading'
    }

    // We started loading the route, so it's no longer invalid
    this.isInvalid = false

    return new Promise(async (resolve) => {
      this.resolve = resolve as () => void

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

          this.dataPromise = Promise.resolve().then(async () => {
            try {
              const data = await this.route.loader?.(this, {
                match: this,
                signal: this.abortController.signal,
                router: this.router,
              })

              this.data = replaceEqualDeep(this.data, data || ({} as TData))
              this.error = undefined
              this.status = 'success'
              this.updatedAt = Date.now()
            } catch (err) {
              if (process.env.NODE_ENV === 'development') {
                console.error(err)
              }
              this.error = err
              this.status = 'error'
              this.updatedAt = Date.now()
            }
          })

          try {
            await Promise.all([this.elementsPromise, this.dataPromise])
            if (this.pendingMinPromise) {
              await this.pendingMinPromise
              delete this.pendingMinPromise
            }
          } finally {
            this.cancelPending()
            this.isPending = false
            this.notify()
          }
        })()
      }

      await this.loaderPromise
      delete this.loaderPromise
    })
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
export function replaceEqualDeep(prev: any, next: any) {
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

function last<T>(arr: T[]) {
  return arr[arr.length - 1]
}
