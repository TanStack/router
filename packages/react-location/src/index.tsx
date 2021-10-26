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

export type MakeGenerics<T extends PartialGenerics> = T

export type Search<T> = Record<string, T>
export type Params<T> = Record<string, T>
export type LoaderData<T> = Record<string, T>

export type UseGeneric<
  TGenerics extends PartialGenerics,
  TGeneric extends keyof PartialGenerics,
> = TGeneric extends 'LoaderData' | 'Search'
  ? Partial<Maybe<TGenerics[TGeneric], DefaultGenerics[TGeneric]>>
  : Maybe<TGenerics[TGeneric], DefaultGenerics[TGeneric]>

export type ReactLocationOptions = {
  history?: BrowserHistory | MemoryHistory | HashHistory
  basepath?: string
  stringifySearch?: SearchSerializer
  parseSearch?: SearchParser
  filterRoutes?: FilterRoutesFn
}

type SearchSerializer = (searchObj: Record<string, any>) => string
type SearchParser = (searchStr: string) => Record<string, any>

export type NavigateOptions<
  TGenerics extends PartialGenerics = DefaultGenerics,
> = {
  to?: string | null
  search?: Updater<UseGeneric<TGenerics, 'Search'>>
  hash?: Updater<string>
  from?: string
  replace?: boolean
}

export type Updater<TResult> = TResult | ((prev?: TResult) => TResult)

export type Location<TGenerics extends PartialGenerics = DefaultGenerics> = {
  href: string
  pathname: string
  search: UseGeneric<TGenerics, 'Search'>
  searchStr: string
  hash: string
  key: string
  nextAction?: 'push' | 'replace'
}

export type Route<TGenerics extends PartialGenerics = DefaultGenerics> =
  | RouteBasic<TGenerics>
  | RouteAsync<TGenerics>

export type RouteBasic<TGenerics extends PartialGenerics = DefaultGenerics> = {
  path?: string
  search?: SearchPredicate<UseGeneric<TGenerics, 'Search'>>
  loader?: LoaderFn<TGenerics>
  element?: SyncOrAsyncElement<TGenerics>
  errorElement?: SyncOrAsyncElement<TGenerics>
  pendingElement?: SyncOrAsyncElement<TGenerics>
  pendingMs?: number
  pendingMinMs?: number
  children?: Route<TGenerics>[]
  import?: never
}

export type RouteAsync<TGenerics extends PartialGenerics = DefaultGenerics> = {
  path?: string
  search?: SearchPredicate<UseGeneric<TGenerics, 'Search'>>
  import: RouteImportFn<TGenerics>
}

export type MatchLocation<TGenerics extends PartialGenerics = DefaultGenerics> =
  {
    to?: string
    search?: SearchPredicate<UseGeneric<TGenerics, 'Search'>>
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

export type RouteMatch<TGenerics extends PartialGenerics = DefaultGenerics> = {
  route: RouteBasic<TGenerics>
  pathname: string
  params: UseGeneric<TGenerics, 'Params'>
  status: 'pending' | 'resolved' | 'rejected'
  element?: React.ReactNode
  errorElement?: React.ReactNode
  pendingElement?: React.ReactNode
  data: UseGeneric<TGenerics, 'LoaderData'>
  error?: unknown
  isLoading: boolean
  loaderPromise?: Promise<UseGeneric<TGenerics, 'LoaderData'>>
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

export type ReactLocationProps<
  TGenerics extends PartialGenerics = DefaultGenerics,
> = {
  children: React.ReactNode
  location: ReactLocation<TGenerics>
}

export type UseNavigateOptions<
  TGenerics extends PartialGenerics = DefaultGenerics,
> = {
  to?: string | null
  search?: Updater<UseGeneric<TGenerics, 'Search'>>
  hash?: Updater<string>
  replace?: boolean
  fromCurrent?: boolean
}

export type PromptProps = {
  message: string
  when?: boolean
}

export type RouteProps = {
  path: string
  element?: React.ReactNode
  children?: React.ReactNode
}

type ActiveOptions = {
  exact?: boolean
  includeHash?: boolean
}

export type LinkProps<TGenerics extends PartialGenerics = DefaultGenerics> =
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
    to?: string
    search?: Updater<UseGeneric<TGenerics, 'Search'>>
    hash?: Updater<string>
    replace?: boolean
    getActiveProps?: () => Record<string, any>
    activeOptions?: ActiveOptions
  }

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

export type RouterContext<TGenerics extends PartialGenerics = DefaultGenerics> =
  {
    filterRoutes?: FilterRoutesFn
    routes: Route<TGenerics>[]
    previousMatches?: RouteMatch<TGenerics>[]
    matches?: RouteMatch<TGenerics>[]
    nextMatches?: RouteMatch<TGenerics>[]
    isTransitioning: boolean
    isLoading: boolean
    previousLocation?: Location<TGenerics>
    currentLocation: Location<TGenerics>
    nextLocation?: Location<TGenerics>
  }

export type FilterRoutesFn = <
  TGenerics extends PartialGenerics = DefaultGenerics,
>(
  routes: Route<TGenerics>[],
) => Route<TGenerics>[]

export type UseRoutesOptions<
  TGenerics extends PartialGenerics = DefaultGenerics,
> = {
  routes: Route<TGenerics>[]
  initialMatches?: RouteMatch<TGenerics>[]
  pendingElement?: React.ReactNode
  filterRoutes?: FilterRoutesFn
}

type MatchLoader<TGenerics extends PartialGenerics = DefaultGenerics> = {
  promise: Promise<RouteMatch<TGenerics>[]>
  subscribe: (listener: (matches: RouteMatch<TGenerics>[]) => void) => void
  startPending: () => void
}

export type Transition<TGenerics> = {
  promise?: Promise<any>
  matchLoader?: MatchLoader<TGenerics>
  matches?: RouteMatch<TGenerics>[]
  listeners: LoaderListeners<TGenerics>[]
  subscribe: (listeners: LoaderListeners<TGenerics>) => () => void
  timeout?: ReturnType<typeof setTimeout>
  remove: () => void
}

export type Transitions<TGenerics> = Record<string, Transition<TGenerics>>

//

const LocationContext = React.createContext<ReactLocation<any>>(undefined!)

const defaultRouteMatch = {
  params: {} as any,
  pathname: '/',
  route: null!,
  data: {} as any,
  status: 'resolved',
  isLoading: false,
} as const

const RootMatchContext = React.createContext<RouteMatch<any>>(defaultRouteMatch)
const MatchesContext = React.createContext<RouteMatch<any>[]>([
  defaultRouteMatch,
])

// Detect if we're in the DOM
const isDOM = Boolean(
  typeof window !== 'undefined' &&
    window.document &&
    window.document.createElement,
)

// This is the default history object if none is defined
const createDefaultHistory = () =>
  isDOM ? createBrowserHistory() : createMemoryHistory()

const routerContext = React.createContext<RouterContext<any>>(null!)

export class ReactLocation<
  TLocationGenerics extends PartialGenerics = DefaultGenerics,
> {
  history: BrowserHistory | MemoryHistory
  basepath: string
  current: Location<TLocationGenerics>
  destroy: () => void
  stringifySearch: SearchSerializer
  parseSearch: SearchParser
  filterRoutes: FilterRoutesFn
  transitions: Transitions<TLocationGenerics>
  navigateTimeout?: ReturnType<typeof setTimeout>

  //

  listeners: ListenerFn[] = []

  constructor(options?: ReactLocationOptions) {
    this.history = options?.history || createDefaultHistory()
    this.basepath = options?.basepath || '/'
    this.stringifySearch = options?.stringifySearch ?? defaultStringifySearch
    this.parseSearch = options?.parseSearch ?? defaultParseSearch
    this.filterRoutes = options?.filterRoutes ?? ((d) => d)
    this.current = this.parseLocation(this.history.location)
    this.transitions = {}

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

  buildSearch<TGenerics extends PartialGenerics = TLocationGenerics>(
    updater?: Updater<any>,
  ): Partial<Maybe<TGenerics['Search'], Search<any>>> {
    const newSearch = functionalUpdate(updater, this.current.search)

    if (newSearch) {
      return replaceEqualDeep(this.current.search, newSearch)
    }

    return {}
  }

  buildHash = (updater?: Updater<string>): string | undefined => {
    return functionalUpdate(updater, this.current.hash)
  }

  buildNext<TGenerics extends PartialGenerics = TLocationGenerics>(
    options: NavigateOptions<TGenerics> = {},
  ): Location<TGenerics> {
    if (options.to === '') {
      options.from = this.current.pathname
    }

    const pathname = resolvePath(
      options.from || this.current.pathname,
      options.to ?? '.',
    )

    const search = this.buildSearch(options.search)

    const searchStr = this.stringifySearch(search)

    // searchStr = (searchStr = searchStr ? `?${searchStr}` : '')

    let hash = this.buildHash(options.hash)
    hash = hash ? `#${hash}` : ''

    let nextAction: 'push' | 'replace' = 'replace'

    if (!this.current.nextAction) {
      nextAction = options.replace ? 'replace' : 'push'
    }

    if (!options.replace) {
      nextAction = 'push'
    }

    return {
      pathname,
      search,
      searchStr,
      hash,
      href: `${pathname}${searchStr}${hash}`,
      key: this.current.key,
      nextAction,
    }
  }

  navigate<TGenerics extends PartialGenerics = TLocationGenerics>(
    options: NavigateOptions<TGenerics> = {},
  ): void {
    if (this.navigateTimeout) clearTimeout(this.navigateTimeout)

    this.current = this.buildNext(options)

    this.navigateTimeout = setTimeout(() => {
      delete this.current.nextAction

      if (options.replace) {
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

export function ReactLocationProvider<
  TGenerics extends PartialGenerics = DefaultGenerics,
>({ children, location: locationInstance }: ReactLocationProps<TGenerics>) {
  const rootMatch = React.useMemo((): RouteMatch<TGenerics> => {
    return {
      ...defaultRouteMatch,
      pathname: locationInstance.basepath,
    }
  }, [locationInstance.basepath])

  const routeMatch = React.useMemo(() => [rootMatch], [rootMatch])

  return (
    <LocationContext.Provider value={locationInstance}>
      <RootMatchContext.Provider value={rootMatch}>
        <MatchesContext.Provider value={routeMatch}>
          {children}
        </MatchesContext.Provider>
      </RootMatchContext.Provider>
    </LocationContext.Provider>
  )
}

export function useLocation<
  TGenerics extends PartialGenerics = DefaultGenerics,
>() {
  const getIsMounted = useGetIsMounted()
  const [, rerender] = React.useReducer((d) => d + 1, 0)
  const instance = React.useContext(LocationContext) as ReactLocation<TGenerics>
  warning(!!instance, 'useLocation must be used within a <ReactLocation />')

  React.useLayoutEffect(() => {
    return instance.subscribe(() => {
      if (getIsMounted()) {
        rerender()
      }
    })
  }, [instance])

  return instance
}

type LoaderListeners<TGenerics> = {
  onMatch?: (match?: RouteMatch<TGenerics>[]) => void
  onLoad?: (match?: RouteMatch<TGenerics>[]) => void
}

export async function matchRoutes<
  TGenerics extends PartialGenerics = DefaultGenerics,
>(
  routes: Route<TGenerics>[],
  currentLocation: Location<TGenerics>,
  opts?: {
    parentMatch?: RouteMatch<TGenerics>
    filterRoutes?: FilterRoutesFn
  },
): Promise<RouteMatch<TGenerics>[]> {
  if (!routes?.length) {
    return []
  }

  const matches: RouteMatch<TGenerics>[] = []

  const recurse = async (
    routes: Route<TGenerics>[],
    parentMatch: RouteMatch<TGenerics>,
  ) => {
    let { pathname, params } = parentMatch
    const filteredRoutes = opts?.filterRoutes
      ? opts?.filterRoutes(routes)
      : routes

    const flexRoute = filteredRoutes.find((route) => {
      const fullRoutePathName = joinPaths([pathname, route.path ?? '*'])

      const matchParams = matchRoute(currentLocation, {
        to: fullRoutePathName,
      })

      if (matchParams) {
        Object.assign(params, matchParams)
      }

      return !!matchParams
    })

    if (!flexRoute) {
      return
    }

    const interpolatedPathSegments = parsePathname(flexRoute.path)

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

    if (flexRoute.import) {
      const res = await flexRoute.import({ params })
      route = {
        ...flexRoute,
        ...res,
      }
    } else {
      route = flexRoute
    }

    const match: RouteMatch<TGenerics> = {
      route,
      params,
      pathname,
      data: {} as any,
      status: 'pending',
      isLoading: false,
      loaderPromise: Promise.resolve() as Promise<any>,
    }

    matches.push(match)

    if (route.children) {
      await recurse(route.children, match)
    }
  }

  await recurse(routes, opts?.parentMatch ?? defaultRouteMatch)

  return matches
}

export function useLoadRoute<
  THookGenerics extends PartialGenerics = DefaultGenerics,
>(routes?: Route<THookGenerics>[]) {
  const router = useRouter<THookGenerics>(undefined, true)
  const match = useMatch<THookGenerics>()
  const location = useLocation<THookGenerics>()
  const rootRoute = useRootMatch<THookGenerics>()

  routes = routes ?? router?.routes

  return React.useCallback(
    <TGenerics extends PartialGenerics = THookGenerics>(
      navigate: NavigateOptions<TGenerics>,
      opts?: {
        onMatch?: (match?: RouteMatch<TGenerics>[]) => undefined | false
        onLoad?: (match?: RouteMatch<TGenerics>[]) => void
        timeoutMs?: number
        filterRoutes?: FilterRoutesFn
        // This is a hint to our loader that the pendingMs should start,
        // since we are trying to render the route, as opposed to just
        // arbitrarily loading it eg. for prefetching
        isTransition?: boolean
      },
    ) => {
      const filterRoutes = opts?.filterRoutes ?? router?.filterRoutes

      const nextLocation = location.buildNext({
        ...navigate,
        from: match.pathname,
      })

      let transition = location.transitions[nextLocation.href]!

      if (!transition) {
        transition = location.transitions[nextLocation.href] = {
          listeners: [],
          subscribe: (listener) => {
            transition.listeners.push(listener)

            if (transition.matches?.length) {
              listener.onMatch?.(transition.matches)

              transition.promise?.then(() =>
                listener.onLoad?.(transition.matches),
              )
            }

            return () => {
              transition.listeners = transition.listeners.filter(
                (d) => d !== listener,
              )

              if (!transition.listeners.length) {
                transition.remove()
              }
            }
          },
          remove: () => {
            delete location.transitions[nextLocation.href]
          },
        }
      }

      if (transition.timeout) clearTimeout(transition.timeout)

      if (!transition.promise) {
        transition.promise = Promise.resolve().then(async () => {
          transition.matches = await matchRoutes(routes!, nextLocation, {
            parentMatch: rootRoute,
            filterRoutes,
          })

          transition.listeners.forEach((listeners) => {
            listeners.onMatch?.(transition.matches)
          })

          if (transition.matches?.length) {
            if (!transition.matchLoader) {
              transition.matchLoader = loadMatches(transition.matches)
            }

            transition.matchLoader?.subscribe((newMatches) => {
              transition.matches = newMatches

              transition.listeners.forEach((listeners) => {
                listeners.onLoad?.(transition.matches)
              })
            })
          }

          await transition.matchLoader?.promise

          if (!opts?.isTransition) {
            transition.timeout = setTimeout(() => {
              transition.remove()
            }, opts?.timeoutMs ?? 0)
          }
        })
      }

      return transition
    },
    [],
  )
}

export function useRoutes<TGenerics extends PartialGenerics = DefaultGenerics>(
  options: UseRoutesOptions<TGenerics>,
): JSX.Element {
  const location = useLocation<TGenerics>()
  const loadRoute = useLoadRoute<TGenerics>(options.routes)
  const startTransition =
    (React as any).useTransition?.() ??
    function <T>(cb: () => T): void {
      cb()
    }

  const [state, setState] = React.useState<{
    isTransitioning: boolean
    matches?: RouteMatch<TGenerics>[]
    currentLocation: Location<TGenerics>
  }>({
    isTransitioning: !options.initialMatches,
    matches: options.initialMatches,
    currentLocation: location.current,
  })

  const isLoading = !!(state.matches && state.matches.find((d) => d.isLoading))

  const routerContextValue = React.useMemo(
    (): RouterContext<TGenerics> => ({
      ...state,
      isLoading,
      routes: options.routes,
      filterRoutes: options.filterRoutes,
    }),
    [state],
  )

  // const latestRef = React.useRef(0)

  React.useEffect(() => {
    try {
      const nextLocation = location.current

      // let done = false

      setState((old) => ({
        ...old,
        isTransitioning: true,
        previousLocation: old.currentLocation,
        nextLocation,
      }))

      //
      // const id = Date.now()
      // latestRef.current = id

      // const isLatest = () => !done && latestRef.current === id

      const transition = loadRoute(
        { to: '' },
        {
          isTransition: true,
          filterRoutes: options.filterRoutes ?? location.filterRoutes,
        },
      )

      const unsubscribe = transition.subscribe({
        onMatch: (nextMatches) => {
          setState((old) => ({
            ...old,
            nextMatches,
          }))

          if (!nextMatches?.length) {
            setState((old) => ({
              ...old,
              previousMatches: old.matches,
              matches: undefined,
              nextMatches: undefined,
              isTransitioning: false,
              currentLocation: nextLocation,
              nextLocation: undefined,
            }))
            return false
          }
        },
        onLoad: (nextMatches) => {
          startTransition(() => {
            setState((old) => ({
              ...old,
              isTransitioning: false,
              previousMatches: old.matches,
              matches: nextMatches,
              nextMatches: undefined,
              currentLocation: nextLocation,
              nextLocation: undefined,
            }))
          })
        },
      })

      return () => {
        unsubscribe()
      }
    } catch (err) {
      console.error(err)
    }
  }, [location.current.key])

  return (
    <routerContext.Provider value={routerContextValue}>
      {state.matches?.length
        ? renderMatches(state.matches)
        : state.isTransitioning
        ? ((options.pendingElement ?? null) as JSX.Element)
        : null}
    </routerContext.Provider>
  )
}

export function Routes<TGenerics extends PartialGenerics = DefaultGenerics>(
  options: UseRoutesOptions<TGenerics>,
) {
  return useRoutes(options)
}

export function useMatches<
  TGenerics extends PartialGenerics = DefaultGenerics,
>(): RouteMatch<TGenerics>[] {
  return React.useContext(MatchesContext)
}

export function useMatch<
  TGenerics extends PartialGenerics = DefaultGenerics,
>(): RouteMatch<TGenerics> {
  return useMatches<TGenerics>()[0]!
}

export function Link<TGenerics extends PartialGenerics = DefaultGenerics>({
  to = '.',
  search,
  hash,
  children,
  target,
  style = {},
  replace,
  onClick,
  className = '',
  getActiveProps = () => ({}),
  activeOptions,
  ...rest
}: LinkProps<TGenerics>) {
  const match = useMatch<TGenerics>()
  const location = useLocation<TGenerics>()
  const navigate = useNavigate<TGenerics>()

  // If this `to` is a valid external URL, log a warning
  try {
    const url = new URL(to)
    warning(
      false,
      `<Link /> should not be used for external URLs like: ${url.href}`,
    )
  } catch (e) {}

  const next = location.buildNext({
    to,
    from: match.pathname,
    search,
    hash,
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
      })
    }
  }

  // Compare path/hash for matches
  const pathIsEqual = location.current.pathname === next.pathname
  const pathIsFuzzyEqual = location.current.pathname.startsWith(next.pathname)
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
        href: next.href,
        onClick: handleClick,
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
}

export function useNavigate<
  THookGenerics extends PartialGenerics = DefaultGenerics,
>() {
  const match = useMatch<THookGenerics>()
  const location = useLocation<THookGenerics>()

  function navigate<TGenerics extends PartialGenerics = THookGenerics>({
    search,
    hash,
    replace,
    fromCurrent,
    to,
  }: UseNavigateOptions<TGenerics>) {
    fromCurrent = fromCurrent ?? typeof to === 'undefined'

    location.navigate({
      to,
      from: fromCurrent ? location.current.pathname : match.pathname,
      search,
      hash,
      replace,
    })
  }

  return useLatestCallback(navigate)
}

export function Navigate<TGenerics extends PartialGenerics = DefaultGenerics>(
  options: UseNavigateOptions<TGenerics>,
) {
  let navigate = useNavigate<TGenerics>()

  React.useLayoutEffect(() => {
    navigate(options)
  }, [navigate])

  return null
}

export function Outlet<TGenerics extends PartialGenerics = DefaultGenerics>() {
  const [_, ...matches] = useMatches<TGenerics>()
  if (!matches.length) {
    return null
  }
  return renderMatches<TGenerics>(matches)
}

export function renderMatches<
  TGenerics extends PartialGenerics = DefaultGenerics,
>(matches: RouteMatch<TGenerics>[], opts?: { useErrorBoundary?: boolean }) {
  const [match] = matches

  if (!match) {
    throw new Error()
  }

  const element = (() => {
    if (match.status === 'rejected') {
      if (match.errorElement) {
        return match.errorElement
      }

      if (!opts?.useErrorBoundary) {
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

    return match.element ?? <Outlet<TGenerics> />
  })()

  return (
    <MatchesContext.Provider value={matches}>{element}</MatchesContext.Provider>
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

export function useRootMatch<
  TGenerics extends PartialGenerics = DefaultGenerics,
>(): RouteMatch<TGenerics> {
  return React.useContext(RootMatchContext)
}

export function useSearch<
  TGenerics extends PartialGenerics = DefaultGenerics,
>() {
  const location = useLocation<TGenerics>()
  return location.current.search
}

export function useIsNextPath() {
  const routerState = useRouter()
  const resolvePath = useResolvePath()

  return React.useCallback(
    (pathname: string) =>
      routerState.nextLocation?.pathname === resolvePath(pathname),
    [routerState, resolvePath],
  )
}

export function useMatchRoute<
  TGenerics extends PartialGenerics = DefaultGenerics,
>() {
  const location = useLocation<TGenerics>()
  const resolvePath = useResolvePath<TGenerics>()

  return useLatestCallback((matchLocation: MatchLocation<TGenerics>) =>
    matchRoute(location.current, {
      ...matchLocation,
      to: matchLocation.to ? resolvePath(matchLocation.to) : undefined,
    }),
  )
}

export function useRouter<TGenerics extends PartialGenerics = DefaultGenerics>(
  _?: undefined,
  unsafe?: boolean,
) {
  const context = React.useContext(routerContext)
  if (!context && !unsafe) {
    warning(true, 'You are trying to use useRouter() outside of ReactLocation!')
    throw new Error()
  }
  return context as RouterContext<TGenerics>
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

export function loadMatches<
  TGenerics extends PartialGenerics = DefaultGenerics,
>(
  matches: RouteMatch<TGenerics>[] | undefined,
): MatchLoader<TGenerics> | undefined {
  if (!matches?.length) {
    return
  }

  const firstRenderPromises: Promise<unknown>[] = []

  let listeners: ((newMatches: RouteMatch<TGenerics>[]) => void)[] = []
  const subscribe = (
    listener: (newMatches: RouteMatch<TGenerics>[]) => void,
  ) => {
    listeners.push(listener)

    return () => {
      listeners = listeners.filter((d) => d !== listener)
    }
  }

  const notify = (): RouteMatch<TGenerics>[] => {
    const newMatches = matches.map((match, index) => {
      const parentMatch = matches[index - 1]

      return {
        ...match,
        data: {
          ...(parentMatch?.data ?? {}),
          ...match.data,
        },
      }
    })

    listeners.forEach((listener) => listener(newMatches))

    return newMatches
  }

  let pendingStarters: (() => void)[] = []
  const startPending = () => {
    pendingStarters.forEach((starter) => starter())
  }

  matches.forEach((match, index) => {
    const parentMatch = matches[index - 1]

    if (!match) {
      return
    }

    let routePromises: Promise<any>[] = []

    // For each element type, potentially load it asynchronously
    const elementTypes = ['element', 'errorElement', 'pendingElement'] as const

    elementTypes.forEach((type) => {
      const routeElement = match.route[type]

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

    if (!load) {
      match.status = 'resolved'
    } else {
      match.loaderPromise = Promise.resolve().then(() => {
        return new Promise(async (resolve) => {
          let pendingTimeout: ReturnType<typeof setTimeout>
          let pendingMinPromise = Promise.resolve()

          if (match.route.pendingMs) {
            pendingStarters.push(() => {
              pendingTimeout = setTimeout(() => {
                notify()
                if (match.route.pendingMinMs) {
                  pendingMinPromise = new Promise((r) =>
                    setTimeout(r, match.route.pendingMinMs),
                  )
                }
              }, match.route.pendingMs)
            })
          }

          let promise: undefined | Promise<any>

          const finish = () => {
            clearTimeout(pendingTimeout!)
            resolve(match.data)
            match.isLoading = false
            promise = undefined
          }

          try {
            match.isLoading = true

            promise = load(match, {
              parentMatch,
              dispatch: async (event) => {
                // Do not allow async updates
                // while the loader is in flight
                if (!firstRendered) {
                  return
                }

                // // Wait for the initial render to complete or at least
                // // the first pending render
                // await Promise.all([firstRenderPromise, pendingMinPromise])

                if (event.type === 'resolve') {
                  match.status = 'resolved'
                  match.data = event.data
                  match.error = undefined
                  match.isLoading = false
                } else if (event.type === 'reject') {
                  match.status = 'rejected'
                  match.error = event.error
                  match.isLoading = false
                } else if (event.type === 'loading') {
                  match.isLoading = true
                }
                notify()
              },
            }) as any

            const data = await promise
            match.status = 'resolved'
            match.data = data
            await pendingMinPromise
            finish()
          } catch (err) {
            console.error(err)
            match.status = 'rejected'
            match.error = err
            finish()
          }
        })
      })

      firstRenderPromises.push(match.loaderPromise)
    }
  })

  let firstRendered = false
  const firstRenderPromise = Promise.all(firstRenderPromises).then(() => {
    const newMatches = notify()
    firstRendered = true
    return newMatches
  })

  return {
    promise: firstRenderPromise,
    subscribe,
    startPending,
  }
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

  // remove trailing slash
  if (path !== '/') {
    path = path.replace(/(\/)$/g, '')
  }

  return path
}

function matchByPath<TGenerics extends PartialGenerics = DefaultGenerics>(
  currentLocation: Location<TGenerics>,
  matchLocation: MatchLocation<TGenerics>,
): UseGeneric<TGenerics, 'Params'> | undefined {
  const baseSegments = parsePathname(currentLocation.pathname)
  const routeSegments = parsePathname(matchLocation.to ?? '*')

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

      if (!routeSegment) {
        // /a/b
        // contains
        // /a
        return true
      } else {
        if (routeSegment.type === 'wildcard') {
          // /a/b
          // contains
          // /a/*
          return true
        }

        if (!baseSegment) {
          // /a
          // contains
          // /a/b
          return false
        }

        if (routeSegment.type === 'param') {
          // /a/b
          // contains
          // /a/:param
          params[routeSegment.value] = baseSegment.value
        }

        if (routeSegment.type === 'pathname') {
          if (
            routeSegment.value === '/' &&
            isLastRouteSegment &&
            !isLastBaseSegment
          ) {
            return false
          }

          if (routeSegment.value !== baseSegment.value) {
            return false
          }
        }
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

  if (pathname.charAt(0) === '/') {
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
  const split = pathname.split('/')

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

  return segments
}

function resolvePath(base: string, to: string) {
  let baseSegments = parsePathname(base)
  const toSegments = parsePathname(to)

  toSegments.forEach((toSegment) => {
    if (toSegment.type !== 'pathname') {
      warning(
        true,
        'Destination pathnames may not contain route parameter placeholders or wildcards.',
      )
      throw new Error()
    }

    if (toSegment.value === '/') {
      baseSegments = [toSegment]
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
      if (val && isPlainObject(val)) {
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
