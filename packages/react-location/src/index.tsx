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

import { decode, encode } from './qss'

// Types

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

export type SearchSerializer = (searchObj: Record<string, any>) => string
export type SearchParser = (searchStr: string) => Record<string, any>

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

export type Route<TGenerics extends PartialGenerics = DefaultGenerics> = {
  // The path to match (relative to the nearest parent `Route` component or root basepath)
  path?: string
  // An ID to uniquely identify this route within its siblings. This is only required for routes that *only match on search* or if you have multiple routes with the same path
  id?: string
  // If true, this route will be matched as case-sensitive
  caseSensitive?: boolean
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
  // Route Loaders (see below) can be inline on the route, or resolved async
} & RouteLoaders<TGenerics> & {
    // If `import` is defined, this route can resolve its elements and loaders in a single asynchronous call
    // This is particularly useful for code-splitting or module federation
    import?: (opts: {
      params: UseGeneric<TGenerics, 'Params'>
      search: UseGeneric<TGenerics, 'Search'>
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
  // An asynchronous function responsible for cleaning up when the match cache is cleared. This is useful when
  // the loader function has side effects that need to be cleaned up when the match is no longer in use.
  unloader?: UnloaderFn<TGenerics>
  // An integer of milliseconds representing how long data should be cached for the route
  loaderMaxAge?: number
  // Similar to React's useEffect hook, this function is called
  // when moving from an inactive state to an active one. Likewise, when moving from
  // an active to an inactive state, the return function (if provided) is called.
  onMatch?: (
    match: RouteMatch<TGenerics>,
  ) => void | undefined | ((match: RouteMatch<TGenerics>) => void)
  // This function is called when the route remains active from one transition to the next.
  onTransition?: (match: RouteMatch<TGenerics>) => void
  // An object of whatever you want! This object is accessible anywhere matches are.
  meta?: UseGeneric<TGenerics, 'RouteMeta'>
}

export type SearchFilter<TGenerics> = (
  prev: UseGeneric<TGenerics, 'Search'>,
) => UseGeneric<TGenerics, 'Search'>

export type MatchLocation<TGenerics extends PartialGenerics = DefaultGenerics> =
  {
    to?: string | number | null
    search?: SearchPredicate<UseGeneric<TGenerics, 'Search'>>
    fuzzy?: boolean
    caseSensitive?: boolean
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
    id: string
    route: Route<TGenerics>
    pathname: string
    params: UseGeneric<TGenerics, 'Params'>
    search: UseGeneric<TGenerics, 'Search'>
  }

export type LoaderFn<TGenerics extends PartialGenerics = DefaultGenerics> = (
  routeMatch: RouteMatch<TGenerics>,
  opts: LoaderFnOptions<TGenerics>,
) => PromiseLike<UseGeneric<TGenerics, 'LoaderData'>>

export type UnloaderFn<TGenerics extends PartialGenerics = DefaultGenerics> = (
  routeMatch: RouteMatch<TGenerics>,
) => void

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
  // Children will default to `<Outlet />` if not provided
  children?: React.ReactNode
  location: ReactLocation<TGenerics>
} & RouterOptions<TGenerics>

export type RouterOptions<TGenerics> = {
  // An array of route objects to match
  routes: Route<TGenerics>[]
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
  caseSensitive?: boolean
  __experimental__snapshot?: __Experimental__RouterSnapshot<TGenerics>
}

export type __Experimental__RouterSnapshot<TGenerics> = {
  // matches: Partial<RouteMatch<TGenerics>>[]
  location: Location<TGenerics>
  matches: SnapshotRouteMatch<TGenerics>[]
}

export type SnapshotRouteMatch<TGenerics> = {
  id: string
  ownData: UseGeneric<TGenerics, 'LoaderData'>
}

export type BuildNextOptions<
  TGenerics extends PartialGenerics = DefaultGenerics,
> = {
  to?: string | number | null
  search?: true | Updater<UseGeneric<TGenerics, 'Search'>>
  hash?: true | Updater<string>
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
  when?: boolean | any
  children?: React.ReactNode
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
    // A function that is passed the [Location API](#location-api) and returns additional props for the `inactive` state of this link. These props override other props passed to the link (`style`'s are merged, `className`'s are concatenated)
    getInactiveProps?: () => Record<string, any>
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
      type: 'maxAge'
      maxAge: number
    }
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

export type LoadRouteFn<TGenerics> = (
  next: Location<TGenerics>,
) => MatchLoader<TGenerics>

export type TransitionState<TGenerics> = {
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

type Listener = () => void

// Source

const LocationContext = React.createContext<{ location: ReactLocation<any> }>(
  null!,
)
const MatchesContext = React.createContext<RouteMatch<any>[]>(null!)
const routerContext = React.createContext<{ router: RouterInstance<any> }>(
  null!,
)

// Detect if we're in the DOM
const isDOM = Boolean(
  typeof window !== 'undefined' &&
    window.document &&
    window.document.createElement,
)

const useLayoutEffect = isDOM ? React.useLayoutEffect : React.useEffect

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

export class ReactLocation<
  TGenerics extends PartialGenerics = DefaultGenerics,
> extends Subscribable {
  history: BrowserHistory | MemoryHistory
  stringifySearch: SearchSerializer
  parseSearch: SearchParser

  current: Location<TGenerics>
  destroy: () => void
  navigateTimeout?: Timeout
  nextAction?: 'push' | 'replace'

  //

  isTransitioning: boolean = false

  constructor(options?: ReactLocationOptions) {
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

  buildNext(
    basepath: string = '/',
    dest: BuildNextOptions<TGenerics> = {},
  ): Location<TGenerics> {
    const from = {
      ...this.current,
      ...dest.from,
    }

    const pathname = resolvePath(basepath, from.pathname, `${dest.to ?? '.'}`)

    const filteredSearch = dest.__searchFilters?.length
      ? dest.__searchFilters.reduce((prev, next) => next(prev), from.search)
      : from.search

    const updatedSearch =
      dest.search === true
        ? filteredSearch // Preserve from true
        : dest.search
        ? functionalUpdate(dest.search, filteredSearch) ?? {} // Updater
        : dest.__searchFilters?.length
        ? filteredSearch // Preserve from filters
        : {}

    const search = replaceEqualDeep(from.search, updatedSearch)

    const searchStr = this.stringifySearch(search)
    let hash =
      dest.hash === true ? from.hash : functionalUpdate(dest.hash, from.hash)
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
  __experimental__snapshot,
  ...rest
}: RouterProps<TGenerics>) {
  const routerRef = React.useRef<RouterInstance<TGenerics>>(null!)
  if (!routerRef.current) {
    routerRef.current = new RouterInstance<TGenerics>({
      location,
      __experimental__snapshot,
      routes: rest.routes,
    })
  }
  const router = routerRef.current

  const [nonce, rerender] = React.useReducer(() => ({}), {})

  router.update(rest)

  useLayoutEffect(() => {
    return router.subscribe(() => {
      rerender()
    })
  }, [])

  useLayoutEffect(() => {
    return router.updateLocation(location.current).unsubscribe
  }, [location.current.key])

  return (
    <LocationContext.Provider value={{ location }}>
      <routerContext.Provider value={{ router }}>
        <InitialSideEffects />
        <MatchesProvider value={[router.rootMatch!, ...router.state.matches]}>
          {children ?? <Outlet />}
        </MatchesProvider>
      </routerContext.Provider>
    </LocationContext.Provider>
  )
}

function InitialSideEffects() {
  const location = useLocation()
  const buildNext = useBuildNext()
  const navigate = useNavigate()

  useLayoutEffect(() => {
    const next = buildNext({
      to: '.',
      search: true,
      hash: true,
    })

    if (next.href !== location.current.href) {
      navigate({
        to: '.',
        search: true,
        hash: true,
        fromCurrent: true,
        replace: true,
      })
    }
  }, [])

  return null
}

type RouterInstanceState<TGenerics> = {
  state: TransitionState<TGenerics>
  pending?: TransitionState<TGenerics>
}

export class RouterInstance<
  TGenerics extends PartialGenerics = DefaultGenerics,
> extends Subscribable {
  basepath?: string
  rootMatch?: RouteMatch<TGenerics>
  state: TransitionState<TGenerics>
  pending?: TransitionState<TGenerics>
  routes!: Route<TGenerics>[]
  filterRoutes?: FilterRoutesFn
  defaultLinkPreloadMaxAge?: number
  defaultLoaderMaxAge?: number
  useErrorBoundary?: boolean
  defaultElement: SyncOrAsyncElement<TGenerics>
  defaultErrorElement: SyncOrAsyncElement<TGenerics>
  defaultPendingElement: SyncOrAsyncElement<TGenerics>
  defaultPendingMs?: number
  defaultPendingMinMs?: number
  caseSensitive?: boolean

  routesById: Record<string, Route<TGenerics>> = {}

  constructor({
    location,
    __experimental__snapshot,
    ...rest
  }: {
    location: ReactLocation<TGenerics>
    __experimental__snapshot?: __Experimental__RouterSnapshot<TGenerics>
  } & RouterOptions<TGenerics>) {
    super()

    this.update(rest)

    let matches: RouteMatch<TGenerics>[] = []

    if (__experimental__snapshot) {
      const matchLoader = new MatchLoader(this, location.current)
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
      location: __experimental__snapshot?.location ?? location.current,
      matches: matches,
    }

    location.subscribe(() => this.notify())
  }

  update = ({ basepath, routes, ...opts }: RouterOptions<TGenerics>) => {
    Object.assign(this, opts)

    this.basepath = cleanPath(`/${basepath ?? ''}`)

    this.routesById = {}

    const recurseRoutes = (
      routes: Route<TGenerics>[],
      parent?: Route<TGenerics>,
    ): Route<TGenerics>[] => {
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
      route: null!,
      ownData: {},
      data: {},
      isLoading: false,
      status: 'resolved',
    }
  }

  setState = (
    updater: (
      old: RouterInstanceState<TGenerics>,
    ) => RouterInstanceState<TGenerics>,
  ) => {
    const newState = updater({ state: this.state, pending: this.pending })
    this.state = newState.state
    this.pending = newState.pending
    this.cleanMatchCache()
    this.notify()
  }

  matchCache: Record<string, RouteMatch<TGenerics>> = {}

  cleanMatchCache = () => {
    const activeMatchIds = [
      ...(this?.state.matches ?? []),
      ...(this?.pending?.matches ?? []),
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
        if (match.route.unloader) {
          match.route.unloader(match)
        }

        delete this.matchCache[match.id]
      }
    })
  }

  updateLocation = (next: Location<TGenerics>) => {
    let unsubscribe: () => void

    const promise = new Promise<void>((resolve) => {
      const matchLoader = new MatchLoader(this, next)

      this.setState((old) => {
        return {
          ...old,
          pending: {
            location: matchLoader.location,
            matches: matchLoader.matches,
          },
        }
      })

      unsubscribe = matchLoader.subscribe(() => {
        const currentMatches = this.state.matches

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
            state: {
              location: matchLoader.location,
              matches: matchLoader.matches,
            },
            pending: undefined,
          }
        })

        resolve()
      })

      matchLoader.loadData()
      matchLoader.startPending()
    })

    return {
      promise,
      unsubscribe: unsubscribe!,
    }
  }

  __experimental__createSnapshot =
    (): __Experimental__RouterSnapshot<TGenerics> => {
      return {
        location: this.state.location,
        matches: this.state.matches.map(({ ownData, id }) => {
          return {
            id,
            ownData,
          }
        }),
      }
    }
}

export type UseLocationType<
  TGenerics extends PartialGenerics = DefaultGenerics,
> = () => ReactLocation<TGenerics>

export function useLocation<
  TGenerics extends PartialGenerics = DefaultGenerics,
>(): ReactLocation<TGenerics> {
  const context = React.useContext(LocationContext) as {
    location: ReactLocation<TGenerics>
  }
  warning(!!context, 'useLocation must be used within a <ReactLocation />')

  return context.location
}

export class RouteMatch<TGenerics extends PartialGenerics = DefaultGenerics> {
  id!: string
  route!: Route<TGenerics>
  pathname!: string
  params!: UseGeneric<TGenerics, 'Params'>
  search!: UseGeneric<TGenerics, 'Search'>
  updatedAt?: number
  element?: React.ReactNode
  errorElement?: React.ReactNode
  pendingElement?: React.ReactNode
  error?: unknown
  loaderPromise?: Promise<UseGeneric<TGenerics, 'LoaderData'>>
  maxAge?: number
  matchLoader?: MatchLoader<TGenerics>
  pendingTimeout?: Timeout
  pendingMinPromise?: Promise<void>
  onExit?: void | ((match: RouteMatch<TGenerics>) => void)

  constructor(unloadedMatch: UnloadedMatch<TGenerics>) {
    Object.assign(this, unloadedMatch)
  }

  status: 'loading' | 'pending' | 'resolved' | 'rejected' = 'loading'
  ownData: UseGeneric<TGenerics, 'LoaderData'> = {}
  data: UseGeneric<TGenerics, 'LoaderData'> = {}
  isLoading: boolean = false

  private notify? = (isSoft?: boolean) => {
    this.matchLoader?.preNotify(isSoft ? this : undefined)
  }

  assignMatchLoader? = (matchLoader: MatchLoader<TGenerics>) => {
    this.matchLoader = matchLoader
  }

  startPending? = () => {
    if (this.pendingTimeout) {
      clearTimeout(this.pendingTimeout)
    }

    if (this.route.pendingMs !== undefined) {
      this.pendingTimeout = setTimeout(() => {
        if (this.status === 'loading') {
          this.status = 'pending'
        }
        this.notify?.()
        if (typeof this.route.pendingMinMs !== 'undefined') {
          this.pendingMinPromise = new Promise((r) =>
            setTimeout(r, this.route.pendingMinMs),
          )
        }
      }, this.route.pendingMs)
    }
  }

  load? = (opts: {
    maxAge?: number
    parentMatch?: RouteMatch<TGenerics>
    router: RouterInstance<TGenerics>
  }) => {
    this.maxAge =
      opts.maxAge ?? this.route.loaderMaxAge ?? opts.router.defaultLoaderMaxAge

    if (this.loaderPromise) {
      return
    }

    const importer = this.route.import

    // First, run any importers
    this.loaderPromise = (
      !importer
        ? Promise.resolve()
        : (() => {
            this.isLoading = true
            return importer({ params: this.params, search: this.search }).then(
              (imported) => {
                this.route = {
                  ...this.route,
                  ...imported,
                }
              },
            )
          })()
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
            this.isLoading = true
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
          ? Promise.resolve()
          : new Promise(async (resolveLoader) => {
              this.isLoading = true

              const loaderReady = (status: 'resolved' | 'rejected') => {
                this.updatedAt = Date.now()
                resolveLoader(this.ownData)
                this.status = status
              }

              const resolve = (data: any) => {
                this.ownData = data
                this.error = undefined
                loaderReady('resolved')
              }

              const reject = (err: any) => {
                console.error(err)
                this.error = err
                loaderReady('rejected')
              }

              try {
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
                      } else if (event.type === 'maxAge') {
                        this.maxAge = event.maxAge
                      }

                      this.updatedAt = Date.now()
                      this.notify?.(true)
                    },
                  }),
                )
              } catch (err) {
                reject(err)
              }
            })

        return Promise.all([...elementPromises, dataPromise])
          .then(() => {
            this.status = 'resolved'
            this.isLoading = false
            this.startPending = undefined
          })
          .then(() => this.pendingMinPromise)
          .then(() => {
            if (this.pendingTimeout) {
              clearTimeout(this.pendingTimeout)
            }
            this.notify?.(true)
          })
      })
      .then(() => {
        return this.ownData
      })
  }
}

class MatchLoader<
  TGenerics extends PartialGenerics = DefaultGenerics,
> extends Subscribable {
  router: RouterInstance<TGenerics>
  location: Location<TGenerics>
  matches: RouteMatch<TGenerics>[]
  prepPromise?: Promise<void>
  matchPromise?: Promise<UnloadedMatch<TGenerics>[]>
  firstRenderPromises?: Promise<any>[]
  preNotifiedMatches: RouteMatch<TGenerics>[] = []

  constructor(
    router: RouterInstance<TGenerics>,
    nextLocation: Location<TGenerics>,
  ) {
    super()
    this.router = router
    this.location = nextLocation
    this.matches = []

    const unloadedMatches = matchRoutes(this.router, this.location)

    this.matches = unloadedMatches?.map(
      (unloadedMatch): RouteMatch<TGenerics> => {
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

  preNotify = (routeMatch?: RouteMatch<TGenerics>) => {
    if (routeMatch) {
      if (!this.preNotifiedMatches.includes(routeMatch)) {
        this.preNotifiedMatches.push(routeMatch)
      }
    }

    if (!routeMatch || this.preNotifiedMatches.length === this.matches.length) {
      this.status = 'resolved'
      cascadeMatchData(this.matches)
      this.notify()
    }
  }

  loadData = async ({ maxAge }: { maxAge?: number } = {}) => {
    this.router.cleanMatchCache()

    if (!this.matches?.length) {
      this.preNotify()
      return
    }

    this.firstRenderPromises = []

    this.matches.forEach((match, index) => {
      const parentMatch = this.matches?.[index - 1]
      match.assignMatchLoader?.(this)
      match.load?.({ maxAge, parentMatch, router: this.router })
      this.firstRenderPromises?.push(match.loaderPromise!)
    })

    return await Promise.all(this.firstRenderPromises).then(() => {
      this.preNotify()
      return this.matches
    })
  }

  load = async ({ maxAge }: { maxAge?: number } = {}) => {
    return await this.loadData({ maxAge })
  }

  startPending = async () => {
    this.matches.forEach((match) => match.startPending?.())
  }
}

function cascadeMatchData<TGenerics>(matches?: RouteMatch<TGenerics>[]) {
  matches?.forEach((match, index) => {
    const parentMatch = matches?.[index - 1]

    match.data = {
      ...(parentMatch?.data ?? ({} as any)),
      ...match.ownData,
    }
  })
}

export type UseRouterType<TGenerics extends PartialGenerics = DefaultGenerics> =
  () => RouterInstance<TGenerics>

export function useRouter<
  TGenerics extends PartialGenerics = DefaultGenerics,
>(): RouterInstance<TGenerics> {
  const value = React.useContext(routerContext)
  if (!value) {
    warning(true, 'You are trying to use useRouter() outside of ReactLocation!')
    throw new Error()
  }

  return value.router as RouterInstance<TGenerics>
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
  router: RouterInstance<TGenerics>[],
  currentLocation: Location<TGenerics>,
) => Promise<UnloadedMatch<TGenerics>[]>

export function matchRoutes<
  TGenerics extends PartialGenerics = DefaultGenerics,
>(
  router: RouterInstance<TGenerics>,
  currentLocation: Location<TGenerics>,
): UnloadedMatch<TGenerics>[] {
  if (!router.routes.length) {
    return []
  }

  const matches: UnloadedMatch<TGenerics>[] = []

  const recurse = async (
    routes: Route<TGenerics>[],
    parentMatch: UnloadedMatch<TGenerics>,
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

    const match: UnloadedMatch<TGenerics> = {
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

  recurse(router.routes, router.rootMatch!)

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

      const matchLoader = new MatchLoader(router, next)

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

  useLayoutEffect(() => {
    navigate(options)
  }, [navigate])

  return null
}

function useBuildNext<TGenerics>() {
  const location = useLocation<TGenerics>()
  const router = useRouter<TGenerics>()

  const buildNext = (opts: BuildNextOptions<TGenerics>) => {
    const next = location.buildNext(router.basepath, opts)

    const matches = matchRoutes<TGenerics>(router, next)

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
  getActiveProps = () => ({ className: 'active' }),
  getInactiveProps = () => ({}),
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
    if (disabled) return
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

  // Get the inactive props
  const {
    style: inactiveStyle = {},
    className: inactiveClassName = '',
    ...inactiveRest
  } = isActive ? {} : getInactiveProps()

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
          ...inactiveStyle,
        },
        className:
          [className, activeClassName, inactiveClassName]
            .filter(Boolean)
            .join(' ') || undefined,
        ...(disabled
          ? {
              role: 'link',
              'aria-disabled': true,
            }
          : undefined),
        ...rest,
        ...activeRest,
        ...inactiveRest,
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
        if (process.env.NODE_ENV !== 'production') {
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

    if (match.status === 'loading') {
      return null
    }

    if (match.status === 'pending') {
      if (match.route.pendingMs || pendingElement) {
        return pendingElement ?? null
      }
    }

    const matchElement = match.element ?? router.defaultElement

    return matchElement ?? <Outlet />
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
  opts?: { caseSensitive?: boolean },
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

export function usePrompt(message: string, when: boolean | any): void {
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

export function Prompt({ message, when, children }: PromptProps) {
  usePrompt(message, when ?? true)
  return (children ?? null) as React.ReactNode
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

export function matchByPath<
  TGenerics extends PartialGenerics = DefaultGenerics,
>(
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
  base = base.replace(new RegExp(`^${basepath}`), '/')
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
