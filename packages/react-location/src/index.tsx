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

// Types

declare global {
  const __DEV__: boolean
}

type Timeout = ReturnType<typeof setTimeout>

type Maybe<T, TUnknown> = T extends {} ? T : TUnknown

export type DefaultGenerics = {
  LoaderData: LoaderData<unknown>
  Params: Params<string>
  Search: Search<unknown>
  RouteMeta: RouteMeta<unknown>
}

export type PartialGenerics = Partial<DefaultGenerics>

export type MakeGenerics<TGenerics extends PartialGenerics> = TGenerics

export type Search<T> = Record<string, T>
export type Params<T> = Record<string, T>
export type LoaderData<T> = Record<string, T>
export type RouteMeta<T> = Record<string, T>

export type UseGeneric<
  TGenerics extends PartialGenerics,
  TGeneric extends keyof PartialGenerics,
> = TGeneric extends 'LoaderData' | 'Search'
  ? Partial<Maybe<TGenerics[TGeneric], DefaultGenerics[TGeneric]>>
  : Maybe<TGenerics[TGeneric], DefaultGenerics[TGeneric]>

export type ReactLocationOptions = {
  // The history object to be used internally by react-location
  // A history will be created automatically if not provided.
  history?: BrowserHistory | MemoryHistory | HashHistory
  stringifySearch?: SearchSerializer
  parseSearch?: SearchParser
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
  // Route Loaders (see below) can be inline on the route, or resolved async
  // via the `import` property
  RouteLoaders<TGenerics> & {
    // The path to match (relative to the nearest parent `Route` component or root basepath)
    path?: string
    // Either (1) an object that will be used to shallowly match the current location's search or (2) A function that receives the current search params and can return truthy if they are matched.
    search?: SearchPredicate<UseGeneric<TGenerics, 'Search'>>
    // The duration to wait during `loader` execution before showing the `pendingElement`
    pendingMs?: number
    // _If the `pendingElement` is shown_, the minimum duration for which it will be visible.
    pendingMinMs?: number
    // Search filters can be used to rewrite, persist, default and manipulate search params for link that
    // point to their routes or child routes. See the "basic" example to see them in action.
    searchFilters?: SearchFilter<TGenerics>[]
    // An array of child routes
    children?: Route<TGenerics>[]
  } & {
    // If `import` is defined, this route can resolve its elements and loaders in a single asynchronous call
    // This is particularly useful for code-splitting or module federation
    import?: (opts: {
      params: UseGeneric<TGenerics, 'Params'>
    }) => Promise<RouteLoaders<TGenerics>>
  }

export type RouteLoaders<TGenerics> = {
  // The content to be rendered when the route is matched. If no element is provided, defaults to `<Outlet />`
  element?: SyncOrAsyncElement<TGenerics>
  // The content to be rendered when `loader` encounters an error
  errorElement?: SyncOrAsyncElement<TGenerics>
  // The content to be rendered when the duration of `loader` execution surpasses the `pendingMs` duration
  pendingElement?: SyncOrAsyncElement<TGenerics>
  // An asynchronous function responsible for preparing or fetching data for the route before it is rendered
  loader?: LoaderFn<TGenerics>
  // An object of whatever you want! This object is accessible anywhere matches are.
  meta?: UseGeneric<TGenerics, 'RouteMeta'>
}

export type SearchFilter<TGenerics> = (
  prev: UseGeneric<TGenerics, 'Search'>,
  next: UseGeneric<TGenerics, 'Search'>,
) => UseGeneric<TGenerics, 'Search'>

export type MatchLocation<TGenerics extends PartialGenerics = DefaultGenerics> =
  {
    to?: string | number | null
    search?: SearchPredicate<UseGeneric<TGenerics, 'Search'>>
    fuzzy?: boolean
  }

export type SearchPredicate<TSearch> = (search: TSearch) => any

export type SyncOrAsyncElement<
  TGenerics extends PartialGenerics = DefaultGenerics,
> = React.ReactNode | AsyncElement<TGenerics>

export type AsyncElement<TGenerics extends PartialGenerics = DefaultGenerics> =
  (opts: {
    params: UseGeneric<TGenerics, 'Params'>
  }) => Promise<React.ReactNode>

export type UnloadedMatch<TGenerics extends PartialGenerics = DefaultGenerics> =
  {
    routePath: string
    id: string
    route: Route<TGenerics>
    routeIndex: number
    pathname: string
    params: UseGeneric<TGenerics, 'Params'>
  }

export type LoaderFn<TGenerics extends PartialGenerics = DefaultGenerics> = (
  routeMatch: RouteMatch<TGenerics>,
  opts: LoaderFnOptions<TGenerics>,
) => PromiseLike<UseGeneric<TGenerics, 'LoaderData'>>

export type LoaderFnOptions<
  TGenerics extends PartialGenerics = DefaultGenerics,
> = {
  parentMatch?: RouteMatch<TGenerics>
  dispatch: (event: LoaderDispatchEvent<TGenerics>) => void
}

type PromiseLike<T> = Promise<T> | T

export type ListenerFn = () => void

export type Segment = {
  type: 'pathname' | 'param' | 'wildcard'
  value: string
}

export type RouterProps<TGenerics extends PartialGenerics = DefaultGenerics> = {
  // An instance of the `ReactLocation` class
  location: ReactLocation<TGenerics>
} & RouterInnerProps<TGenerics>

type RouterInnerProps<TGenerics extends PartialGenerics = DefaultGenerics> = {
  // Children will default to `<Outlet />` if not provided
  children?: React.ReactNode
} & RouterOptions<TGenerics>

export type RouterOptions<TGenerics> = {
  // An array of route objects to match
  routes?: Route<TGenerics>[]
  basepath?: string
  filterRoutes?: FilterRoutesFn
  defaultLinkPreloadMaxAge?: number
  defaultLoaderMaxAge?: number
  useErrorBoundary?: boolean
  defaultElement?: SyncOrAsyncElement<TGenerics>
  defaultErrorElement?: SyncOrAsyncElement<TGenerics>
  defaultPendingElement?: SyncOrAsyncElement<TGenerics>
  defaultPendingMs?: number
  defaultPendingMinMs?: number
  // An array of route match objects that have been both _matched_ and _loaded_. See the [SRR](#ssr) section for more details
  initialMatches?: RouteMatch<TGenerics>[]
}

export type BuildNextOptions<
  TGenerics extends PartialGenerics = DefaultGenerics,
> = {
  to?: string | number | null
  search?: true | Updater<UseGeneric<TGenerics, 'Search'>>
  hash?: Updater<string>
  from?: Partial<Location<TGenerics>>
  key?: string
  __searchFilters?: SearchFilter<TGenerics>[]
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
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'children'> & {
    // The absolute or relative destination pathname
    to?: string | number | null
    // The new search object or a function to update it
    search?: true | Updater<UseGeneric<TGenerics, 'Search'>>
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
    // If true, will render the link without the href attribute
    disabled?: boolean
    // A custom ref prop because of this: https://stackoverflow.com/questions/58469229/react-with-typescript-generics-while-using-react-forwardref/58473012
    _ref?: React.Ref<HTMLAnchorElement>
    // If a function is pass as a child, it will be given the `isActive` boolean to aid in further styling on the element it returns
    children?:
      | React.ReactNode
      | ((state: { isActive: boolean }) => React.ReactNode)
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

export type Router<TGenerics extends PartialGenerics = DefaultGenerics> = Omit<
  RouterOptions<TGenerics>,
  'basepath'
> & { basepath: string } & RouterState<TGenerics> & {
    __: {
      rootMatch: RouteMatch<TGenerics>
      matchCache: Record<string, RouteMatch<TGenerics>>
      setState: React.Dispatch<React.SetStateAction<RouterState<TGenerics>>>
      getMatchLoader: LoadRouteFn<TGenerics>
      clearMatchCache: () => void
    }
  }

export type LoadRouteFn<TGenerics> = (
  next: Location<TGenerics>,
) => MatchLoader<TGenerics>

export type RouterState<TGenerics> = {
  state: TransitionState<TGenerics>
  pending?: TransitionState<TGenerics>
}

export type TransitionState<TGenerics> = {
  status: 'pending' | 'ready'
  location: Location<TGenerics>
  matches: RouteMatch<TGenerics>[]
}

export type FilterRoutesFn = <
  TGenerics extends PartialGenerics = DefaultGenerics,
>(
  routes: Route<TGenerics>[],
) => Route<TGenerics>[]

export type RouterPropsType<
  TGenerics extends PartialGenerics = DefaultGenerics,
> = RouterProps<TGenerics>

export type RouterType<TGenerics extends PartialGenerics = DefaultGenerics> = (
  props: RouterProps<TGenerics>,
) => JSX.Element

// Source

const LocationContext = React.createContext<ReactLocation<any>>(null!)
const MatchesContext = React.createContext<RouteMatch<any>[]>(null!)
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
  TGenerics extends PartialGenerics = DefaultGenerics,
> {
  history: BrowserHistory | MemoryHistory
  stringifySearch: SearchSerializer
  parseSearch: SearchParser

  current: Location<TGenerics>
  destroy: () => void
  navigateTimeout?: Timeout
  nextAction?: 'push' | 'replace'

  //

  listeners: ListenerFn[] = []
  isTransitioning: boolean = false

  constructor(options?: ReactLocationOptions) {
    this.history = options?.history || createDefaultHistory()
    this.stringifySearch = options?.stringifySearch ?? defaultStringifySearch
    this.parseSearch = options?.parseSearch ?? defaultParseSearch

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

  buildNext(
    basepath: string = '/',
    dest: BuildNextOptions<TGenerics> = {},
  ): Location<TGenerics> {
    const from = {
      ...this.current,
      ...dest.from,
    }

    const pathname = resolvePath(basepath, from.pathname, `${dest.to ?? '.'}`)

    const updatedSearch =
      (dest.search === true
        ? from.search
        : functionalUpdate(dest.search, from.search)) ?? {}

    const filteredSearch = dest.__searchFilters?.length
      ? dest.__searchFilters.reduce(
          (prev, next) => next(prev, updatedSearch),
          from.search,
        )
      : updatedSearch

    const search = replaceEqualDeep(from.search, filteredSearch)

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

  navigate(next: Location<TGenerics>, replace?: boolean): void {
    this.current = next

    if (this.navigateTimeout) clearTimeout(this.navigateTimeout)

    let nextAction: 'push' | 'replace' = 'replace'

    if (!this.nextAction) {
      nextAction = replace ? 'replace' : 'push'
    }

    if (!replace) {
      nextAction = 'push'
    }

    this.nextAction = nextAction

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

  parseLocation(
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

export type MatchesProviderProps<TGenerics> = {
  value: RouteMatch<TGenerics>[]
  children: React.ReactNode
}

export function MatchesProvider<TGenerics>(
  props: MatchesProviderProps<TGenerics>,
) {
  return <MatchesContext.Provider {...props} />
}

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
  const matchCacheRef = React.useRef<Record<string, RouteMatch<TGenerics>>>()
  if (!matchCacheRef.current) matchCacheRef.current = {}
  const matchCache = matchCacheRef.current

  const basepath = cleanPath(`/${rest.basepath ?? ''}`)

  const [state, setState] = React.useState<RouterState<TGenerics>>({
    state: {
      status: 'ready',
      location: location.current,
      matches: rest.initialMatches ?? [],
    },
  })

  const stateRef = React.useRef<RouterState<TGenerics>>()
  React.useEffect(() => {
    stateRef.current = state
  })

  const rootMatch = React.useMemo(() => {
    const rootMatch: RouteMatch<TGenerics> = {
      routePath: '',
      id: '__root__',
      params: {} as any,
      routeIndex: 0,
      pathname: basepath,
      route: null!,
      data: {},
      isLoading: false,
      status: 'resolved',
    }

    return rootMatch
  }, [basepath])

  const getMatchLoader: LoadRouteFn<TGenerics> = useLatestCallback(
    (next: Location<TGenerics>) => {
      return new MatchLoader(
        router,
        matchCache,
        next,
        rootMatch as RouteMatch<TGenerics>,
      )
    },
  )

  const clearMatchCache = useLatestCallback(() => {
    const activeMatchIds = [
      ...(stateRef.current?.state.matches ?? []),
      ...(stateRef.current?.pending?.matches ?? []),
    ].map((d) => d.id)

    Object.values(matchCache).forEach((match) => {
      if (!match.updatedAt) {
        return
      }

      if (activeMatchIds.includes(match.id)) {
        return
      }

      const age = Date.now() - (match.updatedAt ?? 0)

      if (!match.maxAge || age > match.maxAge) {
        delete matchCache[match.id]
      }
    })
  })

  React.useEffect(() => {
    clearMatchCache()
  }, [state])

  const router = React.useMemo(
    (): Router<TGenerics> => ({
      ...state,
      ...rest,
      basepath,
      __: {
        rootMatch,
        matchCache,
        setState: setState,
        getMatchLoader,
        clearMatchCache,
      },
    }),
    [state],
  )

  React.useLayoutEffect(() => {
    // Make a new match loader for the same location
    const matchLoader = getMatchLoader(location.current)

    setState((old) => {
      old.state.matches?.forEach((match) => {
        match.used = true
      })

      return old
    })

    setState((old) => {
      return {
        ...old,
        pending: {
          status: 'pending',
          location: matchLoader.location,
          matches: matchLoader.matches,
        },
      }
    })

    const unsubscribe = matchLoader.subscribe(() => {
      setState((old) => {
        return {
          ...old,
          state: {
            status: 'ready',
            location: matchLoader.location,
            matches: matchLoader.matches,
          },
          pending: undefined,
        }
      })
    })

    matchLoader.loadData({ maxAge: rest.defaultLoaderMaxAge })
    matchLoader.startPending()

    return unsubscribe
  }, [location.current.key])

  return (
    <routerContext.Provider value={router}>
      <MatchesProvider value={[rootMatch, ...state.state.matches]}>
        {children}
      </MatchesProvider>
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

export class RouteMatch<TGenerics extends PartialGenerics = DefaultGenerics> {
  routePath: string
  id: string
  route: Route<TGenerics>
  routeIndex: number
  pathname: string
  params: UseGeneric<TGenerics, 'Params'>
  updatedAt?: number
  element?: React.ReactNode
  errorElement?: React.ReactNode
  pendingElement?: React.ReactNode
  error?: unknown
  loaderPromise?: Promise<UseGeneric<TGenerics, 'LoaderData'>>
  used?: boolean
  maxAge?: number
  matchLoader?: MatchLoader<TGenerics>
  pendingTimeout?: Timeout
  pendingMinPromise?: Promise<void>

  constructor(unloadedMatch: UnloadedMatch<TGenerics>) {
    this.routePath = unloadedMatch.routePath
    this.id = unloadedMatch.id
    this.route = unloadedMatch.route
    this.routeIndex = unloadedMatch.routeIndex
    this.pathname = unloadedMatch.pathname
    this.params = unloadedMatch.params
  }

  status: 'pending' | 'resolved' | 'rejected' = 'pending'
  data: UseGeneric<TGenerics, 'LoaderData'> = {}
  isLoading: boolean = false

  private notify? = (isSoft?: boolean) => {
    this.matchLoader?.notify(isSoft)
  }

  assignMatchLoader? = (matchLoader: MatchLoader<TGenerics>) => {
    this.matchLoader = matchLoader
  }

  startPending? = () => {
    if (this.pendingTimeout) {
      clearTimeout(this.pendingTimeout)
    }

    if (this.route.pendingMs) {
      this.pendingTimeout = setTimeout(() => {
        this.notify?.()
        if (typeof this.route.pendingMinMs !== 'undefined') {
          this.pendingMinPromise = new Promise((r) =>
            setTimeout(r, this.route.pendingMinMs),
          )
        }
      }, this.route.pendingMs)
    }
  }

  load? = (opts: { maxAge?: number; parentMatch?: RouteMatch<TGenerics> }) => {
    this.maxAge = opts.maxAge

    if (this.loaderPromise) {
      return
    }

    const importer = this.route.import

    // First, run any importers
    this.loaderPromise = (
      !importer
        ? Promise.resolve()
        : importer({ params: this.params }).then((imported) => {
            this.route = {
              ...this.route,
              ...imported,
            }
          })
    )
      // then run all element and data loaders in parallel
      .then(() => {
        const elementPromises: Promise<void>[] = []

        // For each element type, potentially load it asynchronously
        const elementTypes = [
          'element',
          'errorElement',
          'pendingElement',
        ] as const

        elementTypes.forEach((type) => {
          const routeElement = this.route[type]

          if (this[type]) {
            return
          }

          if (typeof routeElement === 'function') {
            elementPromises.push(
              (routeElement as AsyncElement)(this).then((res) => {
                this[type] = res
              }),
            )
          } else {
            this[type] = this.route[type]
          }
        })

        const loader = this.route.loader

        const dataPromise = !loader
          ? Promise.resolve().then(() => {
              this.status = 'resolved'
            })
          : new Promise(async (resolveLoader, rejectLoader) => {
              let pendingTimeout: Timeout

              const resolve = (data: any) => {
                this.status = 'resolved'
                this.data = data
                this.error = undefined
              }

              const reject = (err: any) => {
                console.error(err)
                this.status = 'rejected'
                this.error = err
                rejectLoader(err)
              }

              const finish = () => {
                this.isLoading = false
                this.startPending = undefined
                clearTimeout(pendingTimeout)
                resolveLoader(this.data)
              }

              try {
                this.isLoading = true

                resolve(
                  await loader(this, {
                    parentMatch: opts.parentMatch,
                    dispatch: async (event) => {
                      if (event.type === 'resolve') {
                        resolve(event.data)
                      } else if (event.type === 'reject') {
                        reject(event.error)
                      } else if (event.type === 'loading') {
                        this.isLoading = true
                      }

                      this.updatedAt = Date.now()

                      this.notify?.(true)
                    },
                  }),
                )
                await this.pendingMinPromise
                finish()
              } catch (err) {
                reject(err)
                finish()
              }
            })

        return Promise.all([...elementPromises, dataPromise]).then(() => {
          this.updatedAt = Date.now()
        })
      })
      .then(() => {
        return this.data
      })
  }
}

class MatchLoader<TGenerics extends PartialGenerics = DefaultGenerics> {
  router: Router<TGenerics>
  location: Location<TGenerics>
  matchCache: Record<string, RouteMatch<TGenerics>>
  parentMatch: RouteMatch<TGenerics>
  matches: RouteMatch<TGenerics>[]
  prepPromise?: Promise<void>
  matchPromise?: Promise<UnloadedMatch<TGenerics>[]>
  firstRenderPromises?: Promise<any>[]

  constructor(
    router: Router<TGenerics>,
    matchCache: Record<string, RouteMatch<TGenerics>>,
    nextLocation: Location<TGenerics>,
    parentMatch: RouteMatch<TGenerics>,
  ) {
    this.router = router
    this.matchCache = matchCache
    this.location = nextLocation
    this.parentMatch = parentMatch
    this.matches = []

    this.loadMatches()
  }

  status: 'pending' | 'resolved' = 'pending'

  listeners: (() => void)[] = []

  subscribe = (cb: () => void) => {
    this.listeners?.push(cb)

    return () => {
      this.listeners = this.listeners?.filter((d) => d !== cb)
    }
  }

  notify = (isSoft?: boolean) => {
    if (this.status === 'pending' && isSoft) {
      return
    }

    this.status = 'resolved'

    this.matches?.forEach((match, index) => {
      const parentMatch = this.matches?.[index - 1]

      match.data = {
        ...(parentMatch?.data ?? ({} as any)),
        ...match.data,
      }
    })

    this.listeners?.forEach((d) => d())
  }

  private loadMatches = () => {
    const unloadedMatches = matchRoutes(
      this.router.routes,
      this.location,
      this.parentMatch,
      this.router,
    )

    this.matches = unloadedMatches?.map(
      (unloadedMatch): RouteMatch<TGenerics> => {
        if (!this.matchCache[unloadedMatch.id]) {
          this.matchCache[unloadedMatch.id] = new RouteMatch(unloadedMatch)
        }

        return this.matchCache[unloadedMatch.id]!
      },
    )
  }

  loadData = async ({ maxAge }: { maxAge?: number } = {}) => {
    this.loadMatches()
    this.router.__.clearMatchCache()

    if (!this.matches?.length) {
      this.notify()
      return
    }

    this.firstRenderPromises = []

    this.matches.forEach((match, index) => {
      const parentMatch = this.matches?.[index - 1]
      match.assignMatchLoader?.(this)
      match.load?.({ maxAge, parentMatch })
      this.firstRenderPromises?.push(match.loaderPromise!)
    })

    return await Promise.all(this.firstRenderPromises).then(() => {
      this.notify()
      return this.matches
    })
  }

  load = async ({ maxAge }: { maxAge?: number } = {}) => {
    this.loadMatches()
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

export function matchRoutes<
  TGenerics extends PartialGenerics = DefaultGenerics,
>(
  routes: undefined | Route<TGenerics>[],
  currentLocation: Location<TGenerics>,
  parentMatch: UnloadedMatch<TGenerics>,
  opts?: MatchRoutesOptions<TGenerics>,
): UnloadedMatch<TGenerics>[] {
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
        fuzzy: true,
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

    const routePath = joinPaths([parentMatch.routePath, routeIndex.toString()])

    const match: UnloadedMatch<TGenerics> = {
      routePath,
      id: JSON.stringify([routePath, params]),
      route: {
        ...originalRoute,
        pendingMs: originalRoute.pendingMs ?? opts?.defaultPendingMs,
        pendingMinMs: originalRoute.pendingMinMs ?? opts?.defaultPendingMinMs,
      },
      routeIndex,
      params,
      pathname,
    }

    matches.push(match)

    if (originalRoute.children?.length) {
      recurse(originalRoute.children, match)
    }
  }

  recurse(routes, parentMatch)

  return matches
}

export type UseLoadRouteType<
  TGenerics extends PartialGenerics = DefaultGenerics,
> = (routes?: Route<TGenerics>[]) => void

export function useLoadRoute<
  TGenerics extends PartialGenerics = DefaultGenerics,
>() {
  const location = useLocation<TGenerics>()
  const match = useMatch<TGenerics>()
  const router = useRouter<TGenerics>()
  const buildNext = useBuildNext<TGenerics>()

  return useLatestCallback(
    async (
      navigate: NavigateOptions<TGenerics> = location.current,
      opts?: { maxAge?: number },
    ) => {
      const next = buildNext({
        ...navigate,
        from: navigate.from ?? { pathname: match.pathname },
      })

      const matchLoader = router.__.getMatchLoader(next)

      return await matchLoader.load(opts)
    },
  )
}

export type UseMatchesType<
  TGenerics extends PartialGenerics = DefaultGenerics,
> = () => RouteMatch<TGenerics>[]

export function useParentMatches<
  TGenerics extends PartialGenerics = DefaultGenerics,
>(): RouteMatch<TGenerics>[] {
  const router = useRouter<TGenerics>()
  const match = useMatch()

  const matches = router.state.matches

  return matches.slice(0, matches.findIndex((d) => d.id === match.id) - 1)
}

export function useMatches<
  TGenerics extends PartialGenerics = DefaultGenerics,
>(): RouteMatch<TGenerics>[] {
  return React.useContext(MatchesContext)
}

export type UseMatchType<TGenerics extends PartialGenerics = DefaultGenerics> =
  () => RouteMatch<TGenerics>

export function useMatch<
  TGenerics extends PartialGenerics = DefaultGenerics,
>(): RouteMatch<TGenerics> {
  return useMatches<TGenerics>()?.[0]!
}

export type UseNavigateType<
  TGenerics extends PartialGenerics = DefaultGenerics,
> = (options: NavigateOptions<TGenerics>) => void

export function useNavigate<
  TGenerics extends PartialGenerics = DefaultGenerics,
>() {
  const location = useLocation<TGenerics>()
  const match = useMatch<TGenerics>()
  const buildNext = useBuildNext<TGenerics>()

  function navigate({
    search,
    hash,
    replace,
    from,
    to,
    fromCurrent,
  }: NavigateOptions<TGenerics> & {
    replace?: boolean
  }) {
    fromCurrent = fromCurrent ?? typeof to === 'undefined'

    const next = buildNext({
      to,
      search,
      hash,
      from: fromCurrent
        ? location.current
        : from ?? { pathname: match.pathname },
    })

    location.navigate(next, replace)
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

function useBuildNext<TGenerics>() {
  const location = useLocation<TGenerics>()
  const router = useRouter<TGenerics>()

  const buildNext = (opts: BuildNextOptions<TGenerics>) => {
    const next = location.buildNext(router.basepath, opts)

    const matches = matchRoutes<TGenerics>(
      router.routes,
      next,
      router.__.rootMatch,
      router,
    )

    const __searchFilters = matches
      .map((match) => match.route.searchFilters ?? [])
      .flat()
      .filter(Boolean)

    return location.buildNext(router.basepath, { ...opts, __searchFilters })
  }

  return useLatestCallback(buildNext)
}

export type LinkType<TGenerics extends PartialGenerics = DefaultGenerics> = (
  props: LinkProps<TGenerics>,
) => JSX.Element

export const Link = function Link<
  TGenerics extends PartialGenerics = DefaultGenerics,
>({
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
  disabled,
  _ref,
  ...rest
}: LinkProps<TGenerics>) {
  const loadRoute = useLoadRoute<TGenerics>()
  const match = useMatch<TGenerics>()
  const location = useLocation<TGenerics>()
  const router = useRouter<TGenerics>()
  const navigate = useNavigate<TGenerics>()
  const buildNext = useBuildNext<TGenerics>()

  preload = preload ?? router.defaultLinkPreloadMaxAge

  // If this `to` is a valid external URL, log a warning
  try {
    const url = new URL(`${to}`)
    warning(
      false,
      `<Link /> should not be used for external URLs like: ${url.href}`,
    )
  } catch (e) {}

  const next = buildNext({
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
  const isActive = pathTest && hashTest

  // Get the active props
  const {
    style: activeStyle = {},
    className: activeClassName = '',
    ...activeRest
  } = isActive ? getActiveProps() : {}

  return (
    <a
      {...{
        ref: _ref,
        href: disabled ? undefined : next.href,
        onClick: handleClick,
        onMouseEnter: handleMouseEnter,
        target,
        style: {
          ...style,
          ...activeStyle,
        },
        className:
          [className, activeClassName].filter(Boolean).join(' ') || undefined,
        ...(disabled
          ? {
              role: 'link',
              'aria-disabled': true,
            }
          : undefined),
        ...rest,
        ...activeRest,
        children:
          typeof children === 'function' ? children({ isActive }) : children,
      }}
    />
  )
}

export function Outlet<TGenerics extends PartialGenerics = DefaultGenerics>() {
  const router = useRouter<TGenerics>()
  const [_, ...matches] = useMatches<TGenerics>()

  const match = matches[0]

  if (!match) {
    return null
  }

  const errorElement = match.errorElement ?? router.defaultErrorElement

  const element = (() => {
    if (match.status === 'rejected') {
      if (errorElement) {
        return errorElement
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
              and <pre style={preStyle}>{'<Router useErrorBoundary />'}</pre>.{' '}
              <br />
              <br />
            </div>
          )
        }
        return 'An unknown error occured!'
      }

      throw match.error
    }

    const pendingElement = match.pendingElement ?? router.defaultPendingElement

    if (match.status === 'pending') {
      if (match.route.pendingMs || pendingElement) {
        return pendingElement ?? null
      }
    }

    const matchElement = match.element ?? router.defaultElement

    return matchElement ? (
      <React.Fragment>{matchElement}</React.Fragment>
    ) : (
      <Outlet<TGenerics> />
    )
  })()

  return <MatchesProvider value={matches}>{element}</MatchesProvider>
}

export function useResolvePath<
  TGenerics extends PartialGenerics = DefaultGenerics,
>() {
  const router = useRouter<TGenerics>()
  const match = useMatch<TGenerics>()

  return useLatestCallback((path: string) =>
    resolvePath(router.basepath!, match.pathname!, cleanPath(path)),
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

export type UseMatchRouteType<
  TGenerics extends PartialGenerics = DefaultGenerics,
> = () => (
  matchLocation: MatchLocation<TGenerics>,
) => Maybe<TGenerics['Params'], Params<any>> | undefined

export type UseMatchRouteOptions<TGenerics> = MatchLocation<TGenerics> & {
  pending?: boolean
}

export function useMatchRoute<
  TGenerics extends PartialGenerics = DefaultGenerics,
>(): (
  matchLocation: UseMatchRouteOptions<TGenerics>,
) => Maybe<TGenerics['Params'], Params<any>> | undefined {
  const router = useRouter<TGenerics>()
  const resolvePath = useResolvePath<TGenerics>()

  return useLatestCallback(
    ({
      pending,
      ...matchLocation
    }: MatchLocation<TGenerics> & { pending?: boolean }) => {
      matchLocation = {
        ...matchLocation,
        to: matchLocation.to ? resolvePath(`${matchLocation.to}`) : undefined,
      }

      if (pending) {
        if (!router.pending?.location) {
          return undefined
        }
        return matchRoute(router.pending.location, matchLocation)
      }

      return matchRoute(router.state.location, matchLocation)
    },
  )
}

export function MatchRoute<
  TGenerics extends PartialGenerics = DefaultGenerics,
>({
  children,
  ...rest
}: UseMatchRouteOptions<TGenerics> & {
  children:
    | React.ReactNode
    | ((isNextLocation?: Params<TGenerics>) => React.ReactNode)
}) {
  const matchRoute = useMatchRoute<TGenerics>()
  const match = matchRoute(rest)

  if (typeof children === 'function') {
    return children(match as any)
  }

  return match ? children : null
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
  return `${path}`.replace(/\/{2,}/g, '/')
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
          if (baseSegment?.value) {
            params['*'] = joinPaths(baseSegments.slice(i).map((d) => d.value))
            return true
          }
          return false
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
      } else if (!matchLocation.fuzzy && baseSegment) {
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

function resolvePath(basepath: string, base: string, to: string) {
  base = base.replace(new RegExp(`^${basepath}`), '/')
  to = to.replace(new RegExp(`^${basepath}`), '/')

  let baseSegments = parsePathname(base)
  const toSegments = parsePathname(to)

  toSegments.forEach((toSegment, index) => {
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

  const joined = joinPaths([basepath, ...baseSegments.map((d) => d.value)])

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
