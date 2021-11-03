import * as React from 'react'

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

//

declare global {
  const __DEV__: boolean
}

type Maybe<T, TUnknown> = T extends {} ? T : TUnknown

export type DefaultGenerics = {
  LoaderData: LoaderData<any>
  Params: Params<any>
  Search: Search<any>
}

export type PartialGenerics = Partial<DefaultGenerics>

export type MakeGenerics<TGenerics extends PartialGenerics> = TGenerics

export type Search<T> = Record<string, T>
export type Params<T> = Record<string, T>
export type LoaderData<T> = Record<string, T>

export type UseGeneric<
  TGenerics extends PartialGenerics,
  TGeneric extends keyof PartialGenerics,
> = TGeneric extends 'LoaderData' | 'Search'
  ? Partial<Maybe<TGenerics[TGeneric], DefaultGenerics[TGeneric]>>
  : Maybe<TGenerics[TGeneric], DefaultGenerics[TGeneric]>

export type ReactLocationOptions<TGenerics> = {
  // The history object to be used internally by react-location
  // A history will be created automatically if not provided.
  history?: BrowserHistory | MemoryHistory | HashHistory
  // The basepath prefix for all URLs (not-supported for memory source histories)
  // Defualts to '/'
  basepath?: string
  stringifySearch?: SearchSerializer
  parseSearch?: SearchParser
  options?: RouterOptions<TGenerics>
}

type SearchSerializer = (searchObj: Record<string, any>) => string
type SearchParser = (searchStr: string) => Record<string, any>

export type Updater<TResult> = TResult | ((prev?: TResult) => TResult)

export type Location<TGenerics extends PartialGenerics = DefaultGenerics> = {
  href: string
  pathname: string
  search: UseGeneric<TGenerics, 'Search'>
  searchStr: string
  hash: string
  key?: string
  // nextAction?: 'push' | 'replace'
}

export type Route<TGenerics extends PartialGenerics = DefaultGenerics> =
  | RouteBasic<TGenerics>
  | RouteAsync<TGenerics>

export type RouteBasic<TGenerics extends PartialGenerics = DefaultGenerics> = {
  // The path to match (relative to the nearest parent `Route` component or root basepath)
  path?: string
  // Either (1) an object that will be used to shallowly match the current location's search or (2) A function that receives the current search params and can return truthy if they are matched.
  search?: SearchPredicate<UseGeneric<TGenerics, 'Search'>>
  // The content to be rendered when the route is matched. If no element is provided, defaults to `<Outlet />`
  element?: SyncOrAsyncElement<TGenerics>
  // The content to be rendered when `loader` encounters an error
  errorElement?: SyncOrAsyncElement<TGenerics>
  // The content to be rendered when the duration of `loader` execution surpasses the `pendingMs` duration
  pendingElement?: SyncOrAsyncElement<TGenerics>
  // An asynchronous function responsible for preparing or fetching data for the route before it is rendered
  loader?: LoaderFn<TGenerics>
  // The duration to wait during `loader` execution before showing the `pendingElement`
  pendingMs?: number
  // _If the `pendingElement` is shown_, the minimum duration for which it will be visible.
  pendingMinMs?: number
  // An array of child routes
  children?: Route<TGenerics>[]
  import?: never
}

export type RouteAsync<TGenerics extends PartialGenerics = DefaultGenerics> = {
  // Same as above
  path?: string
  // Same as above
  search?: SearchPredicate<UseGeneric<TGenerics, 'Search'>>
  // An asyncronous function that resolves all of the above route information (everything but the `path` and `import` properties, of course). Useful for code-splitting!
  import: RouteImportFn<TGenerics>
}

export type MatchLocation<TGenerics extends PartialGenerics = DefaultGenerics> =
  {
    to?: string | number | null
    search?: SearchPredicate<UseGeneric<TGenerics, 'Search'>>
    exact?: boolean
  }

export type SearchPredicate<TSearch> = (search: TSearch) => any

export type SyncOrAsyncElement<
  TGenerics extends PartialGenerics = DefaultGenerics,
> = React.ReactNode | AsyncElement<TGenerics>

export type AsyncElement<TGenerics extends PartialGenerics = DefaultGenerics> =
  (opts: {
    params: UseGeneric<TGenerics, 'Params'>
  }) => Promise<React.ReactNode>

export type RouteResolved<TGenerics extends PartialGenerics = DefaultGenerics> =
  Omit<RouteBasic<TGenerics>, 'import'>
export type RouteImported<TGenerics extends PartialGenerics = DefaultGenerics> =
  Omit<RouteBasic<TGenerics>, 'path' | 'import'>

export type RouteImportFn<TGenerics extends PartialGenerics = DefaultGenerics> =
  (opts: {
    params: UseGeneric<TGenerics, 'Params'>
  }) => Promise<RouteImported<TGenerics>>

export type UnloadedMatch<TGenerics extends PartialGenerics = DefaultGenerics> =
  {
    routePath: string
    id: string
    originalRoute: Route<TGenerics>
    route: RouteBasic<TGenerics>
    routeIndex: number
    pathname: string
    params: UseGeneric<TGenerics, 'Params'>
  }

export type Match<TGenerics extends PartialGenerics = DefaultGenerics> =
  UnloadedMatch<TGenerics> & {
    status: 'pending' | 'resolved' | 'rejected'
    updatedAt?: number
    element?: React.ReactNode
    errorElement?: React.ReactNode
    pendingElement?: React.ReactNode
    data: UseGeneric<TGenerics, 'LoaderData'>
    error?: unknown
    isLoading: boolean
    loaderPromise?: Promise<UseGeneric<TGenerics, 'LoaderData'>>
    used?: boolean
    maxAge?: number
    listeners?: (() => void)[]
    subscribe?: (cb: () => void) => void
    notify?: () => void
    startPending?: () => void
  }

export type LoaderFn<TGenerics extends PartialGenerics = DefaultGenerics> = (
  routeMatch: Match<TGenerics>,
  opts: LoaderFnOptions<TGenerics>,
) => PromiseLike<UseGeneric<TGenerics, 'LoaderData'>>

export type LoaderFnOptions<
  TGenerics extends PartialGenerics = DefaultGenerics,
> = {
  parentMatch?: Match<TGenerics>
  dispatch: (event: LoaderDispatchEvent<TGenerics>) => void
}

type PromiseLike<T> = Promise<T> | T

export type ListenerFn = () => void

export type Segment = {
  type: 'pathname' | 'param' | 'wildcard'
  value: string
}

export type RouterProps<TGenerics extends PartialGenerics = DefaultGenerics> = {
  location: ReactLocation<TGenerics>
} & RouterInnerProps<TGenerics>

type RouterInnerProps<TGenerics extends PartialGenerics = DefaultGenerics> = {
  children?: React.ReactNode
} & RouterOptions<TGenerics>

export type RouterOptions<TGenerics> = {
  filterRoutes?: FilterRoutesFn
  defaultLinkPreloadMaxAge?: number
  defaultLoaderMaxAge?: number
  useErrorBoundary?: boolean
  routes?: Route<TGenerics>[]
  initialMatches?: Match<TGenerics>[]
  defaultElement?: SyncOrAsyncElement<TGenerics>
  defaultErrorElement?: SyncOrAsyncElement<TGenerics>
  defaultPendingElement?: SyncOrAsyncElement<TGenerics>
  defaultPendingMs?: number
  defaultPendingMinMs?: number
}

export type BuildNextOptions<
  TGenerics extends PartialGenerics = DefaultGenerics,
> = {
  to?: string | number | null
  search?: true | Updater<UseGeneric<TGenerics, 'Search'>>
  hash?: Updater<string>
  from?: Partial<Location<TGenerics>>
  key?: string
}

export type NavigateOptions<TGenerics> = BuildNextOptions<TGenerics> & {
  replace?: boolean
  fromCurrent?: boolean
}

export type PromptProps = {
  message: string
  when?: boolean
}

export type LinkProps<TGenerics extends PartialGenerics = DefaultGenerics> =
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
    // The absolute or relative destination pathname
    to?: string | number | null
    // The new search object or a function to update it
    search?: Updater<UseGeneric<TGenerics, 'Search'>>
    // The new has string or a function to update it
    hash?: Updater<string>
    // Whether to replace the current history stack instead of pushing a new one
    replace?: boolean
    // A function that is passed the [Location API](#location-api) and returns additional props for the `active` state of this link. These props override other props passed to the link (`style`'s are merged, `className`'s are concatenated)
    getActiveProps?: () => Record<string, any>
    // Defaults to `{ exact: false, includeHash: false }`
    activeOptions?: ActiveOptions
    // If set, will preload the linked route on hover and cache it for this many milliseconds in hopes that the user will eventually navigate there.
    preload?: number
  }

type ActiveOptions = {
  exact?: boolean
  includeHash?: boolean
}

export type LinkPropsType<TGenerics extends PartialGenerics = DefaultGenerics> =
  LinkProps<TGenerics>

export type LoaderDispatchEvent<
  TGenerics extends PartialGenerics = DefaultGenerics,
> =
  | {
      type: 'loading'
    }
  | {
      type: 'resolve'
      data: UseGeneric<TGenerics, 'LoaderData'>
    }
  | {
      type: 'reject'
      error: unknown
    }

export type Router<TGenerics extends PartialGenerics = DefaultGenerics> =
  RouterOptions<TGenerics> &
    RouterState<TGenerics> & {
      __: {
        matchCache: Record<string, Match<TGenerics>>
        setState: React.Dispatch<React.SetStateAction<RouterState<TGenerics>>>
        getMatchLoader: LoadRouteFn<TGenerics>
        clearMatchCache: () => void
      }
    }

export type LoadRouteFn<TGenerics> = (
  navigate?: true | BuildNextOptions<TGenerics>,
  opts?: {
    subscribe?: (transition: Transition<TGenerics>) => void
  },
) => MatchLoader<TGenerics>

export type RouterState<TGenerics> = {
  transition: Transition<TGenerics>
  nextTransition?: Transition<TGenerics>
}

export type Transition<TGenerics> = {
  status: 'pending' | 'ready'
  location: Location<TGenerics>
  matches: Match<TGenerics>[]
}

export type FilterRoutesFn = <
  TGenerics extends PartialGenerics = DefaultGenerics,
>(
  routes: Route<TGenerics>[],
) => Route<TGenerics>[]

//

const LocationContext = React.createContext<ReactLocation<any>>(null!)
const MatchesContext = React.createContext<Match<any>[]>(null!)
const routerContext = React.createContext<Router<any>>(null!)

// Detect if we're in the DOM
const isDOM = Boolean(
  typeof window !== 'undefined' &&
    window.document &&
    window.document.createElement,
)

// This is the default history object if none is defined
const createDefaultHistory = () =>
  isDOM ? createBrowserHistory() : createMemoryHistory()

export class ReactLocation<
  TLocationGenerics extends PartialGenerics = DefaultGenerics,
> {
  history: BrowserHistory | MemoryHistory
  basepath: string
  stringifySearch: SearchSerializer
  parseSearch: SearchParser
  options: {
    filterRoutes: FilterRoutesFn
    defaultLinkPreloadMaxAge: number
    defaultLoaderMaxAge: number
    useErrorBoundary: boolean
    defaultElement?: SyncOrAsyncElement<TLocationGenerics>
    defaultErrorElement?: SyncOrAsyncElement<TLocationGenerics>
    defaultPendingElement?: SyncOrAsyncElement<TLocationGenerics>
    defaultPendingMs?: number
    defaultPendingMinMs?: number
  }

  current: Location<TLocationGenerics>
  destroy: () => void
  navigateTimeout?: ReturnType<typeof setTimeout>
  nextAction?: 'push' | 'replace'

  //

  listeners: ListenerFn[] = []
  isTransitioning: boolean = false

  constructor(options?: ReactLocationOptions<TLocationGenerics>) {
    this.history = options?.history || createDefaultHistory()
    this.basepath = options?.basepath || '/'
    this.stringifySearch = options?.stringifySearch ?? defaultStringifySearch
    this.parseSearch = options?.parseSearch ?? defaultParseSearch
    this.options = {
      ...options?.options,
      filterRoutes: options?.options?.filterRoutes ?? ((d) => d),
      defaultLinkPreloadMaxAge: options?.options?.defaultLinkPreloadMaxAge ?? 0,
      defaultLoaderMaxAge: options?.options?.defaultLoaderMaxAge ?? 0,
      useErrorBoundary: options?.options?.useErrorBoundary ?? false,
    }

    this.current = this.parseLocation(this.history.location)

    this.destroy = this.history.listen((event) => {
      this.current = this.parseLocation(event.location, this.current)
      this.notify()
    })
  }

  private notify = () => {
    this.listeners.forEach((listener) => {
      listener()
    })
  }

  subscribe = (cb: ListenerFn): (() => void) => {
    this.listeners.push(cb)

    return () => {
      this.listeners = this.listeners.filter((d) => d !== cb)
    }
  }

  buildNext<TGenerics extends PartialGenerics = TLocationGenerics>(
    dest: BuildNextOptions<TGenerics> = {},
  ): Location<TGenerics> {
    const from = {
      ...this.current,
      ...dest.from,
    }

    const pathname = resolvePath(from.pathname, dest.to ?? '.')
    const updatedSearch = functionalUpdate(dest.search, from.search)
    const search = updatedSearch
      ? replaceEqualDeep(from.search, updatedSearch)
      : {}
    const searchStr = this.stringifySearch(search)
    let hash = functionalUpdate(dest.hash, from.hash)
    hash = hash ? `#${hash}` : ''

    return {
      pathname,
      search,
      searchStr,
      hash,
      href: `${pathname}${searchStr}${hash}`,
      key: dest.key,
    }
  }

  navigate<TGenerics extends PartialGenerics = TLocationGenerics>(
    dest: NavigateOptions<TGenerics> = {},
  ): void {
    if (this.navigateTimeout) clearTimeout(this.navigateTimeout)

    let nextAction: 'push' | 'replace' = 'replace'

    if (!this.nextAction) {
      nextAction = dest.replace ? 'replace' : 'push'
    }

    if (!dest.replace) {
      nextAction = 'push'
    }

    this.nextAction = nextAction

    this.current = this.buildNext(dest)

    this.navigateTimeout = setTimeout(() => {
      let nextAction = this.nextAction
      delete this.nextAction

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
    }, 16)
  }

  parseLocation<TGenerics extends PartialGenerics = TLocationGenerics>(
    location: History['location'],
    previousLocation?: Location<TGenerics>,
  ): Location<TGenerics> {
    const parsedSearch = this.parseSearch(location.search)
    return {
      pathname: location.pathname,
      searchStr: location.search,
      search: replaceEqualDeep(previousLocation?.search, parsedSearch),
      hash: location.hash.split('#').reverse()[0] ?? '',
      href: `${location.pathname}${location.search}${location.hash}`,
      key: location.key,
    }
  }
}

export type RouterPropsType<
  TGenerics extends PartialGenerics = DefaultGenerics,
> = RouterProps<TGenerics>

export type RouterType<TGenerics extends PartialGenerics = DefaultGenerics> = (
  props: RouterProps<TGenerics>,
) => JSX.Element

export function Router<TGenerics extends PartialGenerics = DefaultGenerics>({
  children,
  location,
  ...rest
}: RouterProps<TGenerics>) {
  return (
    <LocationContext.Provider value={location}>
      <RouterInner {...rest}>{children ?? <Outlet />}</RouterInner>
    </LocationContext.Provider>
  )
}

function RouterInner<TGenerics extends PartialGenerics = DefaultGenerics>({
  children,
  ...rest
}: RouterInnerProps<TGenerics>) {
  const location = useLocation<TGenerics>()
  const matchCacheRef = React.useRef<Record<string, Match<TGenerics>>>()
  if (!matchCacheRef.current) matchCacheRef.current = {}
  const matchCache = matchCacheRef.current

  const options = {
    ...location.options,
    ...rest,
  }

  const [state, setState] = React.useState<RouterState<TGenerics>>({
    transition: {
      status: 'ready',
      location: location.current,
      matches: options.initialMatches ?? [],
    },
  })

  const stateRef = React.useRef<RouterState<TGenerics>>()
  React.useEffect(() => {
    stateRef.current = state
  })

  const rootMatch = React.useMemo((): Match<TGenerics> => {
    return {
      routePath: '',
      id: '__root__',
      route: null!,
      params: {} as any,
      routeIndex: 0,
      pathname: location.basepath,
      status: 'resolved',
      data: {},
      isLoading: false,
      originalRoute: null!,
    }
  }, [location.basepath])

  const getMatchLoaderFn: LoadRouteFn<TGenerics> = (navigate = true) => {
    const nextLocation =
      navigate === true
        ? location.buildNext({
            to: null,
            search: (d) => d!,
            hash: (d) => d!,
            from: location.current,
          })
        : location.buildNext({
            ...navigate,
            from: navigate.from ?? {
              ...state.transition.location,
              pathname: rootMatch.pathname,
            },
          })

    return new MatchLoader(router, matchCache, nextLocation, rootMatch)
  }

  const getMatchLoader = React.useCallback(getMatchLoaderFn, [])

  const clearMatchCache = React.useCallback(() => {
    const activeMatchIds = [
      ...(stateRef.current?.transition.matches ?? []),
      ...(stateRef.current?.nextTransition?.matches ?? []),
    ].map((d) => d.id)

    Object.values(matchCache).forEach((match) => {
      if (!match.updatedAt) return
      const age = Date.now() - match.updatedAt
      if (activeMatchIds.includes(match.id)) {
        return
      }

      if (!match.maxAge || age > match.maxAge) {
        delete matchCache[match.id]
      }
    })
  }, [])

  React.useEffect(() => {
    clearMatchCache()
  }, [state])

  const router = React.useMemo(
    (): Router<TGenerics> => ({
      ...state,
      ...options,
      __: {
        matchCache,
        setState: setState,
        getMatchLoader,
        clearMatchCache,
      },
    }),
    [state],
  )

  React.useLayoutEffect(() => {
    let outdated = false
    let unsubscribe: undefined | (() => void)
    ;(async () => {
      try {
        // Make a new match loader for the same location
        const matchLoader = getMatchLoader()

        await matchLoader.loadMatches()

        setState((old) => {
          old.transition.matches?.forEach((match) => {
            match.used = true
          })

          return old
        })

        if (outdated) {
          return
        }

        setState((old) => {
          return {
            ...old,
            nextTransition: {
              status: 'pending',
              location: matchLoader.location,
              matches: matchLoader.matches,
            },
          }
        })

        unsubscribe = matchLoader.subscribe(() => {
          setState((old) => {
            return {
              ...old,
              transition: {
                status: 'ready',
                location: matchLoader.location,
                matches: matchLoader.matches,
              },
              nextTransition: undefined,
            }
          })
        })

        matchLoader.loadData({ maxAge: options.defaultLoaderMaxAge })
        matchLoader.startPending()
      } catch (err) {
        console.error(err)
      }
    })()

    return () => {
      outdated = true
      if (unsubscribe) unsubscribe()
    }
  }, [location.current.key])

  // state.transition?.matches?.length
  // ? renderMatches(state.transition.matches)
  // : !state.transition
  // ? ((options.pendingElement ?? null) as JSX.Element)
  // : null

  return (
    <routerContext.Provider value={router}>
      <MatchesContext.Provider value={[rootMatch, ...state.transition.matches]}>
        {children}
      </MatchesContext.Provider>
    </routerContext.Provider>
  )
}

export type UseLocationType<
  TGenerics extends PartialGenerics = DefaultGenerics,
> = () => ReactLocation<TGenerics>

export function useLocation<
  TGenerics extends PartialGenerics = DefaultGenerics,
>(): ReactLocation<TGenerics> {
  const getIsMounted = useGetIsMounted()
  const [, rerender] = React.useReducer((d) => d + 1, 0)
  const instance = React.useContext(LocationContext) as ReactLocation<TGenerics>
  warning(!!instance, 'useLocation must be used within a <ReactLocation />')

  React.useLayoutEffect(() => {
    return instance.subscribe(() => {
      // Rerender all subscribers in a microtask
      Promise.resolve().then(() => {
        setTimeout(function renderAllLocationSubscribers() {
          if (getIsMounted()) {
            rerender()
          }
        }, 0)
      })
    })
  }, [instance])

  return instance
}

class MatchLoader<TGenerics extends PartialGenerics = DefaultGenerics> {
  router: Router<TGenerics>
  location: Location<TGenerics>
  matchCache: Record<string, Match<TGenerics>>
  parentMatch: Match<TGenerics>
  matches: Match<TGenerics>[]
  prepPromise?: Promise<void>
  matchPromise?: Promise<UnloadedMatch<TGenerics>[]>

  constructor(
    router: Router<TGenerics>,
    matchCache: Record<string, Match<TGenerics>>,
    nextLocation: Location<TGenerics>,
    parentMatch: Match<TGenerics>,
  ) {
    this.router = router
    this.matchCache = matchCache
    this.location = nextLocation
    this.parentMatch = parentMatch
    this.matches = []
  }

  listeners: (() => void)[] = []
  pendingStarters: (() => void)[] = []

  subscribe = (cb: () => void) => {
    this.listeners?.push(cb)

    return () => {
      this.listeners = this.listeners?.filter((d) => d !== cb)
    }
  }

  notify = () => {
    this.matches?.forEach((match, index) => {
      const parentMatch = this.matches?.[index - 1]

      match.data = {
        ...(parentMatch?.data ?? ({} as any)),
        ...match.data,
      }
    })

    this.listeners?.forEach((d) => d())
  }

  loadMatches = async () => {
    const unloadedMatches = await matchRoutes(
      this.router.routes,
      this.location,
      this.parentMatch,
      this.router,
    )

    this.matches = unloadedMatches?.map((unloadedMatch): Match<TGenerics> => {
      if (!this.matchCache[unloadedMatch.id]) {
        const match: Match<TGenerics> = {
          ...unloadedMatch,
          isLoading: false,
          status: 'pending',
          data: {},
          listeners: [],
          subscribe: (cb) => {
            match?.listeners?.push(cb)
            return () => {
              match.listeners = match.listeners?.filter((d) => d !== cb)
            }
          },
          notify: () => {
            match.listeners?.forEach((d) => d())
          },
        }

        this.matchCache[unloadedMatch.id] = match
      }

      return this.matchCache[unloadedMatch.id]!
    })
  }

  loadData = async ({ maxAge }: { maxAge?: number } = {}) => {
    this.router.__.clearMatchCache()

    if (!this.matches?.length) {
      this.notify()
      return
    }

    const firstRenderPromises: Promise<unknown>[] = []

    this.pendingStarters = []

    this.matches.forEach((match, index) => {
      match.maxAge = maxAge

      const parentMatch = this.matches?.[index - 1]

      if (!match) {
        return
      }

      let routePromises: Promise<any>[] = []

      // For each element type, potentially load it asynchronously
      const elementTypes = [
        'element',
        'errorElement',
        'pendingElement',
      ] as const

      elementTypes.forEach((type) => {
        const routeElement = match.route[type]

        if (match[type]) {
          return
        }

        if (typeof routeElement === 'function') {
          routePromises.push(
            (routeElement as AsyncElement)(match).then((res) => {
              match[type] = res
            }),
          )
        } else {
          match[type] = match.route[type]
        }
      })

      firstRenderPromises.push(Promise.all(routePromises))

      const load = match.route.loader

      match.subscribe?.(() => {
        this.notify()
      })

      if (!load) {
        match.status = 'resolved'
      } else if (!match.loaderPromise) {
        match.loaderPromise = new Promise(async (resolvePromise) => {
          let pendingTimeout: ReturnType<typeof setTimeout>
          let pendingMinPromise = Promise.resolve()

          match.startPending = () => {
            if (match.route.pendingMs) {
              pendingTimeout = setTimeout(() => {
                match.notify?.()
                if (typeof match.route.pendingMinMs !== 'undefined') {
                  pendingMinPromise = new Promise((r) =>
                    setTimeout(r, match.route.pendingMinMs),
                  )
                }
              }, match.route.pendingMs)
            }
          }

          let promise: undefined | Promise<any>

          const loading = () => {
            match.updatedAt = Date.now()
            match.isLoading = true
          }

          const resolve = (data: any) => {
            match.updatedAt = Date.now()
            match.status = 'resolved'
            match.data = data
            match.error = undefined
            match.isLoading = false
          }

          const reject = (err: any) => {
            match.updatedAt = Date.now()
            console.error(err)
            match.status = 'rejected'
            match.error = err
            match.isLoading = false
          }

          const finish = () => {
            clearTimeout(pendingTimeout!)
            resolvePromise(match.data!)
            promise = undefined
          }

          try {
            loading()

            promise = load(match, {
              parentMatch,
              dispatch: async (event) => {
                // Ignore async updates
                // while the initial call to the
                // loader is in flight
                if (!firstRendered) {
                  return
                }

                // If the initial render is done,
                // wait for the pendingMinPromise for this
                // laoder (it resolves immediately if there's
                // no pending state)
                await pendingMinPromise

                if (event.type === 'resolve') {
                  resolve(event.data)
                } else if (event.type === 'reject') {
                  reject(event.error)
                } else if (event.type === 'loading') {
                  loading()
                }

                match.notify?.()
              },
            }) as any

            const data = await promise
            resolve(data)
            await pendingMinPromise
            finish()
          } catch (err) {
            reject(err)
            finish()
          }
        })
      }

      firstRenderPromises.push(match.loaderPromise!)
    })

    let firstRendered = false

    return await Promise.all(firstRenderPromises).then(() => {
      firstRendered = true
      this.notify()
      return this.matches
    })
  }

  load = async ({ maxAge }: { maxAge?: number } = {}) => {
    await this.loadMatches()
    return await this.loadData({ maxAge })
  }

  startPending = async () => {
    this.matches.forEach((match) => match.startPending?.())
  }
}

export type UseRouterType<TGenerics extends PartialGenerics = DefaultGenerics> =
  () => Router<TGenerics>

export function useRouter<
  TGenerics extends PartialGenerics = DefaultGenerics,
>(): Router<TGenerics> {
  const context = React.useContext(routerContext)
  if (!context) {
    warning(true, 'You are trying to use useRouter() outside of ReactLocation!')
    throw new Error()
  }
  return context as Router<TGenerics>
}

export interface MatchRoutesOptions<TGenerics> {
  filterRoutes?: FilterRoutesFn
  defaultPendingMs?: number
  defaultPendingMinMs?: number
  defaultElement?: SyncOrAsyncElement<TGenerics>
  defaultErrorElement?: SyncOrAsyncElement<TGenerics>
  defaultPendingElement?: SyncOrAsyncElement<TGenerics>
}

export type MatchRoutesType<
  TGenerics extends PartialGenerics = DefaultGenerics,
> = (
  routes: undefined | Route<TGenerics>[],
  currentLocation: Location<TGenerics>,
  parentMatch: UnloadedMatch<TGenerics>,
  opts?: MatchRoutesOptions<TGenerics>,
) => Promise<UnloadedMatch<TGenerics>[]>

export async function matchRoutes<
  TGenerics extends PartialGenerics = DefaultGenerics,
>(
  routes: undefined | Route<TGenerics>[],
  currentLocation: Location<TGenerics>,
  parentMatch: UnloadedMatch<TGenerics>,
  opts?: MatchRoutesOptions<TGenerics>,
): Promise<UnloadedMatch<TGenerics>[]> {
  if (!routes?.length) {
    return []
  }

  const matches: UnloadedMatch<TGenerics>[] = []

  const recurse = async (
    routes: Route<TGenerics>[],
    parentMatch: UnloadedMatch<TGenerics>,
  ): Promise<void> => {
    let { pathname, params } = parentMatch
    const filteredRoutes = opts?.filterRoutes
      ? opts?.filterRoutes(routes)
      : routes

    let routeIndex: number = -1

    const originalRoute = filteredRoutes.find((route, index) => {
      const fullRoutePathName = joinPaths([pathname, route.path ?? '*'])

      const matchParams = matchRoute(currentLocation, {
        to: fullRoutePathName,
        search: route.search,
      })

      if (matchParams) {
        routeIndex = index
        params = {
          ...params,
          ...matchParams,
        }
      }

      return !!matchParams
    })

    if (!originalRoute) {
      return
    }

    const interpolatedPathSegments = parsePathname(originalRoute.path)

    const interpolatedPath = joinPaths(
      interpolatedPathSegments.map((segment) => {
        if (segment.value === '*') {
          return ''
        }

        if (segment.type === 'param') {
          return params![segment.value] ?? ''
        }

        return segment.value
      }),
    )

    pathname = joinPaths([pathname, interpolatedPath])

    let route: RouteResolved<TGenerics>

    if (originalRoute.import) {
      const res = await originalRoute.import({ params })
      route = {
        ...originalRoute,
        ...res,
      }
    } else {
      route = originalRoute
    }

    const routePath = joinPaths([parentMatch.routePath, routeIndex.toString()])

    const match: UnloadedMatch<TGenerics> = {
      routePath,
      id: JSON.stringify([routePath, params]),
      route: {
        pendingMs: opts?.defaultPendingMs,
        pendingMinMs: opts?.defaultPendingMinMs,
        ...route,
        element: route.element ?? opts?.defaultElement,
        errorElement: route.errorElement ?? opts?.defaultErrorElement,
        pendingElement: route.pendingElement ?? opts?.defaultPendingElement,
      },
      originalRoute,
      routeIndex,
      params,
      pathname,
    }

    matches.push(match)

    if (route.children?.length) {
      await recurse(route.children, match)
    }
  }

  await recurse(routes, parentMatch)

  return matches
}

export type UseLoadRouteType<
  THookGenerics extends PartialGenerics = DefaultGenerics,
> = (routes?: Route<THookGenerics>[]) => void

export function useLoadRoute<
  THookGenerics extends PartialGenerics = DefaultGenerics,
>() {
  const location = useLocation<THookGenerics>()
  const match = useMatch<THookGenerics>()
  const router = useRouter<THookGenerics>()

  return React.useCallback(
    async (
      navigate: NavigateOptions<THookGenerics> = location.current,
      opts?: { maxAge?: number },
    ) => {
      const matchLoader = router.__.getMatchLoader({
        ...navigate,
        from: { pathname: match.pathname },
      })

      return await matchLoader.load(opts)
    },
    [],
  )
}

export type UseMatchesType<
  TGenerics extends PartialGenerics = DefaultGenerics,
> = () => Match<TGenerics>[]

export function useMatches<
  TGenerics extends PartialGenerics = DefaultGenerics,
>(): Match<TGenerics>[] {
  return React.useContext(MatchesContext)
}

export type UseMatchType<TGenerics extends PartialGenerics = DefaultGenerics> =
  () => Match<TGenerics>

export function useMatch<
  TGenerics extends PartialGenerics = DefaultGenerics,
>(): Match<TGenerics> {
  return useMatches<TGenerics>()?.[0]!
}

export type LinkType<TGenerics extends PartialGenerics = DefaultGenerics> = (
  props: LinkProps<TGenerics>,
) => JSX.Element

export const Link = React.forwardRef(function Link<
  TGenerics extends PartialGenerics = DefaultGenerics,
>(
  {
    to = '.',
    search,
    hash,
    children,
    target,
    style = {},
    replace,
    onClick,
    onMouseEnter,
    className = '',
    getActiveProps = () => ({}),
    activeOptions,
    preload,
    ...rest
  }: LinkProps<TGenerics>,
  ref?: React.Ref<HTMLAnchorElement>,
) {
  const loadRoute = useLoadRoute<TGenerics>()
  const match = useMatch<TGenerics>()
  const location = useLocation<TGenerics>()
  const router = useRouter<TGenerics>()
  const navigate = useNavigate<TGenerics>()

  preload = preload ?? router.defaultLinkPreloadMaxAge

  // If this `to` is a valid external URL, log a warning
  try {
    const url = new URL(`${to}`)
    warning(
      false,
      `<Link /> should not be used for external URLs like: ${url.href}`,
    )
  } catch (e) {}

  const next = location.buildNext({
    to,
    search,
    hash,
    from: { pathname: match.pathname },
  })

  // The click handler
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (onClick) onClick(e)

    if (
      !isCtrlEvent(e) &&
      !e.defaultPrevented &&
      (!target || target === '_self') &&
      e.button === 0
    ) {
      e.preventDefault()
      // All is well? Navigate!
      navigate({
        to,
        search,
        hash,
        replace,
        from: { pathname: match.pathname },
      })
    }
  }

  // The click handler
  const handleMouseEnter = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (onMouseEnter) onMouseEnter(e)

    if (preload && preload > 0) {
      loadRoute(
        {
          to,
          search,
          hash,
        },
        { maxAge: preload },
      )
    }
  }

  // Compare path/hash for matches
  const pathIsEqual = location.current.pathname === next.pathname
  const currentPathSplit = location.current.pathname.split('/')
  const nextPathSplit = next.pathname.split('/')
  const pathIsFuzzyEqual = nextPathSplit.every(
    (d, i) => d === currentPathSplit[i],
  )
  const hashIsEqual = location.current.hash === next.hash

  // Combine the matches based on user options
  const pathTest = activeOptions?.exact ? pathIsEqual : pathIsFuzzyEqual
  const hashTest = activeOptions?.includeHash ? hashIsEqual : true

  // The final "active" test
  const isCurrent = pathTest && hashTest

  // Get the active props
  const {
    style: activeStyle = {},
    className: activeClassName = '',
    ...activeRest
  } = isCurrent ? getActiveProps() : {}

  return (
    <a
      {...{
        ref,
        href: next.href,
        onClick: handleClick,
        onMouseEnter: handleMouseEnter,
        target,
        style: {
          ...style,
          ...activeStyle,
        },
        className:
          [className, activeClassName].filter(Boolean).join(' ') || undefined,
        ...rest,
        ...activeRest,
        children,
      }}
    />
  )
})

export type UseNavigateType<
  THookGenerics extends PartialGenerics = DefaultGenerics,
> = (options: NavigateOptions<THookGenerics>) => void

export function useNavigate<
  THookGenerics extends PartialGenerics = DefaultGenerics,
>() {
  const match = useMatch<THookGenerics>()
  const location = useLocation<THookGenerics>()

  function navigate({
    search,
    hash,
    replace,
    from,
    to,
    fromCurrent,
  }: NavigateOptions<THookGenerics>) {
    fromCurrent = fromCurrent ?? typeof to === 'undefined'

    location.navigate({
      to,
      search,
      hash,
      replace,
      from: fromCurrent
        ? location.current
        : from ?? { pathname: match.pathname },
    })
  }

  return useLatestCallback(navigate)
}

export type NavigateType<TGenerics extends PartialGenerics = DefaultGenerics> =
  (options: NavigateOptions<TGenerics>) => null

export function Navigate<TGenerics extends PartialGenerics = DefaultGenerics>(
  options: NavigateOptions<TGenerics>,
) {
  let navigate = useNavigate<TGenerics>()

  React.useLayoutEffect(() => {
    navigate(options)
  }, [navigate])

  return null
}

export function Outlet<TGenerics extends PartialGenerics = DefaultGenerics>() {
  const router = useRouter<TGenerics>()
  const [_, ...matches] = useMatches<TGenerics>()

  const match = matches[0]

  if (!match) {
    return null
  }

  const element = (() => {
    if (match.status === 'rejected') {
      if (match.errorElement) {
        return match.errorElement
      }

      if (!router.useErrorBoundary) {
        if (__DEV__) {
          const preStyle: React.HTMLAttributes<HTMLPreElement>['style'] = {
            whiteSpace: 'normal',
            display: 'inline-block',
            background: 'rgba(0,0,0,.1)',
            padding: '.1rem .2rem',
            margin: '.1rem',
            lineHeight: '1',
            borderRadius: '.25rem',
          }

          return (
            <div style={{ lineHeight: '1.7' }}>
              <strong>
                The following error occured in the loader for you route at:{' '}
                <pre style={preStyle}>{match.pathname}</pre>
              </strong>
              .
              <br />
              <pre
                style={{
                  ...preStyle,
                  display: 'block',
                  padding: '.5rem',
                  borderRadius: '.5rem',
                }}
              >
                {(match.error as any).toString()}
              </pre>
              <br />
              Your users won't see this message in production, but they will see{' '}
              <strong>"An unknown error occured!"</strong>, which is at least
              better than breaking your entire app. 😊 For a better UX, please
              specify an <pre style={preStyle}>errorElement</pre> for all of
              your routes that contain asynchronous behavior, or at least
              provide your own
              <pre style={preStyle}>ErrorBoundary</pre> wrapper around your
              renders to both the elements rendered by{' '}
              <pre style={preStyle}>
                {'useRoutes(routes, { useErrorBoundary: true })'}
              </pre>{' '}
              and <pre style={preStyle}>{'<Routes useErrorBoundary />'}</pre>.{' '}
              <br />
              <br />
            </div>
          )
        }
        return 'An unknown error occured!'
      }

      throw match.error
    }

    if (match.status === 'pending') {
      if (match.route.pendingMs || match.pendingElement) {
        return match.pendingElement ?? null
      }
    }

    return match.element ? (
      <React.Fragment key={match.updatedAt}>{match.element}</React.Fragment>
    ) : (
      <Outlet<TGenerics> key={match.updatedAt} />
    )
  })()

  return (
    <MatchesContext.Provider value={matches} key={match.updatedAt}>
      {element}
    </MatchesContext.Provider>
  )
}

export function useResolvePath<
  THookGenerics extends PartialGenerics = DefaultGenerics,
>() {
  const match = useMatch<THookGenerics>()

  return React.useCallback(
    (path: string) => resolvePath(match.pathname!, cleanPath(path)),
    [match],
  )
}

export type UseSearchType<TGenerics extends PartialGenerics = DefaultGenerics> =
  () => Partial<Maybe<TGenerics['Search'], Search<any>>>

export function useSearch<
  TGenerics extends PartialGenerics = DefaultGenerics,
>() {
  const location = useLocation<TGenerics>()
  return location.current.search
}

export function useIsNextLocation<
  THookGenerics extends PartialGenerics = DefaultGenerics,
>() {
  const router = useRouter<THookGenerics>()
  const resolvePath = useResolvePath()

  return React.useCallback(
    (matchLocation: MatchLocation<THookGenerics>) => {
      return (
        router.nextTransition?.location &&
        matchRoute(router.nextTransition?.location, {
          ...matchLocation,
          to: matchLocation.to ? resolvePath(`${matchLocation.to}`) : undefined,
          exact: matchLocation.exact ?? true,
        })
      )
    },
    [router, resolvePath],
  )
}

export type UseMatchRouteType<
  TGenerics extends PartialGenerics = DefaultGenerics,
> = () => (
  matchLocation: MatchLocation<TGenerics>,
) => Maybe<TGenerics['Params'], Params<any>> | undefined

export function useMatchRoute<
  TGenerics extends PartialGenerics = DefaultGenerics,
>(): (
  matchLocation: MatchLocation<TGenerics>,
) => Maybe<TGenerics['Params'], Params<any>> | undefined {
  const location = useLocation<TGenerics>()
  const resolvePath = useResolvePath<TGenerics>()

  return useLatestCallback((matchLocation: MatchLocation<TGenerics>) =>
    matchRoute(location.current, {
      ...matchLocation,
      to: matchLocation.to ? resolvePath(`${matchLocation.to}`) : undefined,
    }),
  )
}
export function usePrompt(message: string, when = true): void {
  const location = useLocation()

  React.useEffect(() => {
    if (!when) return

    let unblock = location.history.block((transition) => {
      if (window.confirm(message)) {
        unblock()
        transition.retry()
      } else {
        location.current.pathname = window.location.pathname
      }
    })

    return unblock
  }, [when, location, message])
}

export function Prompt({ message, when }: PromptProps) {
  usePrompt(message, when)
  return null
}

export type MatchRouteType<
  TGenerics extends PartialGenerics = DefaultGenerics,
> = (
  currentLocation: Location<TGenerics>,
  matchLocation: MatchLocation<TGenerics>,
) => UseGeneric<TGenerics, 'Params'> | undefined

export function matchRoute<TGenerics extends PartialGenerics = DefaultGenerics>(
  currentLocation: Location<TGenerics>,
  matchLocation: MatchLocation<TGenerics>,
): UseGeneric<TGenerics, 'Params'> | undefined {
  const pathParams = matchByPath(currentLocation, matchLocation)
  const searchMatched = matchBySearch(currentLocation, matchLocation)

  if (matchLocation.to && !pathParams) {
    return
  }

  if (matchLocation.search && !searchMatched) {
    return
  }

  return (pathParams ?? {}) as UseGeneric<TGenerics, 'Params'>
}

function warning(cond: boolean, message: string) {
  if (!cond) {
    if (typeof console !== 'undefined') console.warn(message)

    try {
      throw new Error(message)
    } catch {}
  }
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
  path = `${path}`.replace(/\/{2,}/g, '/')

  // // remove trailing slash
  // if (path !== '/') {
  //   path = path.replace(/(\/)$/g, '')
  // }

  return path
}

function matchByPath<TGenerics extends PartialGenerics = DefaultGenerics>(
  currentLocation: Location<TGenerics>,
  matchLocation: MatchLocation<TGenerics>,
): UseGeneric<TGenerics, 'Params'> | undefined {
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
          return true
        }

        if (routeSegment.type === 'pathname') {
          if (isLastRouteSegment && routeSegment.value === '/') {
            if (!baseSegment) {
              return true
            }
            if (!isLastBaseSegment) {
              return false
            }
          }

          if (baseSegment) {
            if (routeSegment.value !== baseSegment.value) {
              return false
            }
          }
        }

        if (!baseSegment) {
          return false
        }

        if (routeSegment.type === 'param') {
          params[routeSegment.value] = baseSegment.value
        }
      } else if (matchLocation.exact && baseSegment) {
        return false
      }
    }
    return true
  })()

  return isMatch ? (params as UseGeneric<TGenerics, 'Params'>) : undefined
}

function matchBySearch<TGenerics extends PartialGenerics = DefaultGenerics>(
  currentLocation: Location<TGenerics>,
  matchLocation: MatchLocation<TGenerics>,
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
          value: part.substring(1),
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

function resolvePath(base: string, to: string) {
  let baseSegments = parsePathname(base)
  const toSegments = parsePathname(to)

  toSegments.forEach((toSegment, index) => {
    if (toSegment.type !== 'pathname') {
      warning(
        true,
        'Destination pathnames may not contain route parameter placeholders or wildcards.',
      )
      throw new Error()
    }

    if (toSegment.value === '/') {
      if (!index) {
        baseSegments = [toSegment]
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

  const joined = baseSegments.map((d) => d.value).join('/')

  return cleanPath(joined)
}

function isCtrlEvent(e: React.MouseEvent) {
  return !!(e.metaKey || e.altKey || e.ctrlKey || e.shiftKey)
}

function useLatestCallback<TCallback extends (...args: any[]) => any>(
  cb: TCallback,
) {
  const stableFnRef =
    React.useRef<(...args: Parameters<TCallback>) => ReturnType<TCallback>>()
  const cbRef = React.useRef<TCallback>(cb)

  cbRef.current = cb

  if (!stableFnRef.current) {
    stableFnRef.current = (...args) => cbRef.current(...args)
  }

  return stableFnRef.current
}

function useGetIsMounted() {
  const ref = React.useRef(false)

  React.useEffect(() => {
    ref.current = true

    return () => {
      ref.current = false
    }
  })

  return () => ref.current
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

export function defaultStringifySearch(search: Record<string, unknown>) {
  search = { ...search }

  if (search) {
    Object.keys(search).forEach((key) => {
      const val = search[key]
      if (typeof val === 'undefined' || val === undefined) {
        delete search[key]
      } else if (val && isPlainObject(val)) {
        try {
          search[key] = JSON.stringify(val)
        } catch (err) {
          // silent
        }
      }
    })
  }

  const searchStr = new URLSearchParams(
    search as Record<string, string>,
  ).toString()

  return searchStr ? `?${searchStr}` : ''
}

export function defaultParseSearch(searchStr: string): Record<string, any> {
  if (searchStr.substring(0, 1) === '?') {
    searchStr = searchStr.substring(1)
  }

  let query: Record<string, unknown> = Object.fromEntries(
    (new URLSearchParams(searchStr) as any).entries(),
  )

  // Try to parse query params
  for (let key in query) {
    const value = query[key]

    try {
      query[key] = JSON.parse(value as string)
    } catch (err) {
      //
    }
  }

  return query
}
