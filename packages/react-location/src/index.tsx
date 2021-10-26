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

export type BuildNextOptions<
  TGenerics extends PartialGenerics = DefaultGenerics,
> = {
  to?: string | null
  search?: Updater<UseGeneric<TGenerics, 'Search'>>
  hash?: Updater<string>
  from?: string
}

export type NavigateOptions<
  TGenerics extends PartialGenerics = DefaultGenerics,
> = BuildNextOptions<TGenerics> & {
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
  loaderPromise: Promise<void>
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

export type RouterState<TGenerics extends PartialGenerics = DefaultGenerics> = {
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
  initialMatches?: RouteMatch<TGenerics>[]
  pendingElement?: React.ReactNode
  filterRoutes?: FilterRoutesFn
}

type MatchLoader = {
  promise: Promise<void>
  subscribe: (listener: () => void) => void
  startPending: () => void
}

//

const LocationContext = React.createContext<ReactLocation<any>>(undefined!)

const defaultRouteMatch = {
  params: {} as any,
  pathname: '/',
  route: null!,
  data: {} as any,
  status: 'resolved',
  isLoading: false,
  loaderPromise: Promise.resolve(),
} as const

const RootMatchContext = React.createContext<RouteMatch<any>>(defaultRouteMatch)
const RouteMatchContext = React.createContext<RouteMatch<any>[]>([
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

const routerStateContext = React.createContext<RouterState<any>>(null!)

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

  //

  listeners: ListenerFn[] = []

  constructor(options?: ReactLocationOptions) {
    this.history = options?.history || createDefaultHistory()
    this.basepath = options?.basepath || '/'
    this.stringifySearch = options?.stringifySearch ?? defaultStringifySearch
    this.parseSearch = options?.parseSearch ?? defaultParseSearch
    this.filterRoutes = options?.filterRoutes ?? ((d) => d)
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
    options: BuildNextOptions<TGenerics> = {},
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

    return {
      pathname,
      search,
      searchStr,
      hash,
      href: `${pathname}${searchStr}${hash}`,
      key: this.current.key,
    }
  }

  navigate<TGenerics extends PartialGenerics = TLocationGenerics>(
    options: NavigateOptions<TGenerics> = {},
  ): void {
    this.current = this.buildNext(options)

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
        <RouteMatchContext.Provider value={routeMatch}>
          {children}
        </RouteMatchContext.Provider>
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

export class Router<TRouterGenerics extends PartialGenerics = DefaultGenerics> {
  routes: Route<TRouterGenerics>[]
  filterRoutes?: FilterRoutesFn
  transitions: Record<
    string,
    {
      promise?: Promise<any>
      matchLoader?: MatchLoader
      matches?: RouteMatch<TRouterGenerics>[]
      listeners: LoaderListeners<TRouterGenerics>[]
      subscribe: (listeners: LoaderListeners<TRouterGenerics>) => () => void
      timeout?: ReturnType<typeof setTimeout>
      remove: () => void
    }
  >

  constructor(options: {
    routes: Route<TRouterGenerics>[]
    filterRoutes?: FilterRoutesFn
  }) {
    this.routes = options.routes
    this.filterRoutes = options.filterRoutes
    this.transitions = {}
  }

  matchRoutes = async <TGenerics extends PartialGenerics = TRouterGenerics>(
    currentLocation: Location<TGenerics>,
    opts?: {
      parentMatch?: RouteMatch<TGenerics>
      filterRoutes?: FilterRoutesFn
    },
  ): Promise<RouteMatch<TGenerics>[]> => {
    if (!this.routes?.length) {
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

    await recurse(this.routes, opts?.parentMatch ?? defaultRouteMatch)

    return matches
  }

  useLoadRoute = <
    THookGenerics extends PartialGenerics = TRouterGenerics,
  >() => {
    const match = this.useMatch<THookGenerics>()
    const location = useLocation<THookGenerics>()
    const rootRoute = this.useRootMatch()

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
        const nextLocation = location.buildNext({
          ...navigate,
          from: match.pathname,
        })

        let transition = this.transitions[nextLocation.href]!

        if (!transition) {
          transition = this.transitions[nextLocation.href] = {
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
              delete this.transitions[nextLocation.href]
            },
          }
        }

        if (transition.timeout) clearTimeout(transition.timeout)

        if (!transition.promise) {
          transition.promise = Promise.resolve().then(async () => {
            transition.matches = await this.matchRoutes(nextLocation, {
              parentMatch: rootRoute,
              filterRoutes: this.filterRoutes ?? opts?.filterRoutes,
            })

            transition.listeners.forEach((listeners) => {
              listeners.onMatch?.(transition.matches)
            })

            if (transition.matches?.length) {
              if (!transition.matchLoader) {
                transition.matchLoader = loadMatches(transition.matches)
              }

              transition.matchLoader?.subscribe(() => {
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

  useRoutes = <TGenerics extends PartialGenerics = TRouterGenerics>(
    options?: UseRoutesOptions<TGenerics>,
  ): JSX.Element => {
    const location = useLocation<TGenerics>()
    const loadRoute = this.useLoadRoute()
    const startTransition =
      (React as any).useTransition?.() ??
      function <T>(cb: () => T): void {
        cb()
      }

    const [state, setState] = React.useState<RouterState<TGenerics>>({
      isLoading: null!, // This get's overwritten
      isTransitioning: !options?.initialMatches,
      matches: options?.initialMatches,
      currentLocation: location.current,
    })

    const isLoading = !!(
      state.matches && state.matches.find((d) => d.isLoading)
    )

    const routerStateContextValue = React.useMemo(
      (): RouterState<TGenerics> => ({
        ...state,
        isLoading,
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
            filterRoutes: options?.filterRoutes ?? location.filterRoutes,
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
      <routerStateContext.Provider value={routerStateContextValue}>
        {state.matches?.length
          ? this.renderMatches(state.matches)
          : state.isTransitioning
          ? ((options?.pendingElement ?? null) as JSX.Element)
          : null}
      </routerStateContext.Provider>
    )
  }

  Routes = <TGenerics extends PartialGenerics = TRouterGenerics>(
    options: UseRoutesOptions<TGenerics>,
  ) => {
    return this.useRoutes(options)
  }

  useMatches = <
    TGenerics extends PartialGenerics = TRouterGenerics,
  >(): RouteMatch<TGenerics>[] => {
    return React.useContext(RouteMatchContext)
  }

  useMatch = <
    TGenerics extends PartialGenerics = TRouterGenerics,
  >(): RouteMatch<TGenerics> => {
    return React.useContext(RouteMatchContext)[0]!
  }

  Link = <TGenerics extends PartialGenerics = TRouterGenerics>({
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
  }: LinkProps<TGenerics>) => {
    const match = this.useMatch<TGenerics>()
    const location = useLocation<TGenerics>()
    const navigate = this.useNavigate<TGenerics>()

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

  useNavigate<THookGenerics extends PartialGenerics = TRouterGenerics>() {
    const match = this.useMatch<THookGenerics>()
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

  Navigate = <TGenerics extends PartialGenerics = TRouterGenerics>(
    options: UseNavigateOptions<TGenerics>,
  ) => {
    let navigate = this.useNavigate<TGenerics>()

    React.useLayoutEffect(() => {
      navigate(options)
    }, [navigate])

    return null
  }

  Outlet = <TGenerics extends PartialGenerics = TRouterGenerics>() => {
    const [_, ...matches] = this.useMatches<TGenerics>()
    if (!matches.length) {
      return null
    }
    return this.renderMatches(matches)
  }

  renderMatches = <TGenerics extends PartialGenerics = TRouterGenerics>(
    matches: RouteMatch<TGenerics>[],
    opts?: { useErrorBoundary?: boolean },
  ) => {
    const [match, ...childMatches] = matches

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
                Your users won't see this message in production, but they will
                see <strong>"An unknown error occured!"</strong>, which is at
                least better than breaking your entire app. 😊 For a better UX,
                please specify an <pre style={preStyle}>errorElement</pre> for
                all of your routes that contain asynchronous behavior, or at
                least provide your own
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

      return match.element ?? <this.Outlet />
    })()

    return (
      <RouteMatchContext.Provider value={childMatches}>
        {element}
      </RouteMatchContext.Provider>
    )
  }

  useResolvePath = <
    THookGenerics extends PartialGenerics = TRouterGenerics,
  >() => {
    const match = this.useMatch<THookGenerics>()

    return React.useCallback(
      (path: string) => resolvePath(match.pathname!, cleanPath(path)),
      [match],
    )
  }

  useRootMatch = <
    TGenerics extends PartialGenerics = TRouterGenerics,
  >(): RouteMatch<TGenerics> => {
    return React.useContext(RootMatchContext)
  }

  useSearch = <TGenerics extends PartialGenerics = TRouterGenerics>() => {
    const location = useLocation<TGenerics>()
    return location.current.search
  }

  useIsNextPath = () => {
    const routerState = this.useRouterState()
    const resolvePath = this.useResolvePath()

    return React.useCallback(
      (pathname: string) =>
        routerState.nextLocation?.pathname === resolvePath(pathname),
      [routerState, resolvePath],
    )
  }

  useMatchRoute = <TGenerics extends PartialGenerics = TRouterGenerics>() => {
    const location = useLocation<TGenerics>()
    const resolvePath = this.useResolvePath<TGenerics>()

    return useLatestCallback((matchLocation: MatchLocation<TGenerics>) =>
      matchRoute(location.current, {
        ...matchLocation,
        to: matchLocation.to ? resolvePath(matchLocation.to) : undefined,
      }),
    )
  }

  useRouterState = <TGenerics extends PartialGenerics = TRouterGenerics>() => {
    const context = React.useContext(routerStateContext)
    if (!context) {
      warning(
        true,
        'You are trying to use useRouterState() outside of ReactLocation!',
      )
      throw new Error()
    }
    return context as RouterState<TGenerics>
  }
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
>(matches: RouteMatch<TGenerics>[] | undefined): MatchLoader | undefined {
  if (!matches?.length) {
    return
  }

  const firstRenderPromises: Promise<unknown>[] = []

  let listeners: (() => void)[] = []
  const subscribe = (listener: () => void) => {
    listeners.push(listener)

    return () => {
      listeners = listeners.filter((d) => d !== listener)
    }
  }
  const notify = () => {
    listeners.forEach((listener) => listener())
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
      match.loaderPromise = match.loaderPromise.then(() => {
        match.data = {
          ...(parentMatch?.data as any),
        }

        return new Promise<void>(async (resolve) => {
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

          const finish = () => {
            clearTimeout(pendingTimeout!)
            resolve()
            match.isLoading = false
          }

          try {
            match.isLoading = true
            const data = await load(match, {
              dispatch: async (event) => {
                await Promise.all([
                  match.loaderPromise,
                  firstRenderPromise,
                  pendingMinPromise,
                ])
                if (event.type === 'resolve') {
                  match.status = 'resolved'
                  match.data = {
                    ...parentMatch?.data,
                    ...event.data,
                  } as any
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
            })
            match.status = 'resolved'
            match.data = {
              ...parentMatch?.data,
              ...data,
            } as any
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

  const firstRenderPromise = Promise.all(firstRenderPromises).then(notify)

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

function cleanPathname(pathname: string) {
  return `${pathname}`.replace(/\/{2,}/g, '/')
}

export function cleanPath(path: string) {
  path = cleanPathname(path)

  // Remove '/' and './' prefixes from route paths
  if (path !== '/') {
    path = path.replace(/^(\/|\.\/)/g, '')
  }

  return path
}

function joinPaths(paths: (string | undefined)[]) {
  return cleanPathname(paths.filter(Boolean).join('/'))
}

function matchByPath<TGenerics extends PartialGenerics = DefaultGenerics>(
  currentLocation: Location<TGenerics>,
  matchLocation: MatchLocation<TGenerics>,
): UseGeneric<TGenerics, 'Params'> | undefined {
  const baseSegments = parsePathname(currentLocation.pathname)
  const routeSegments = parsePathname(matchLocation.to ?? '*')

  console.log(baseSegments, routeSegments)

  const params: Record<string, string> = {}

  let isMatch = (() => {
    for (
      let i = 0;
      i < Math.max(baseSegments.length, routeSegments.length);
      i++
    ) {
      const baseSegment = baseSegments[i]!
      const routeSegment = routeSegments[i]!

      const isLastRouteSegment = i === routeSegments.length - 1
      const isLastBaseSegment = i === baseSegments.length - 1

      if (routeSegment) {
        if (routeSegment.type === 'wildcard') {
          return true
        }

        if (routeSegment.type === 'param') {
          if (!baseSegment) {
            return false
          }

          params[routeSegment.value] = baseSegment.value
        }

        if (routeSegment.type === 'pathname') {
          if (!baseSegment) {
            return false
          }

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
      } else {
        return true
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

  pathname = cleanPathname(pathname)

  const segments: Segment[] = []

  if (pathname.charAt(0) === '/') {
    segments.push({
      type: 'pathname',
      value: '/',
    })
    pathname = pathname.substring(1)
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

  return cleanPathname(joined)
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
      if (val && typeof val === 'object' && val !== null) {
        try {
          search[key] = JSON.stringify(val)
        } catch (err) {
          // silent
        }
      }
    })
  }

  return new URLSearchParams(search as Record<string, string>).toString()
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
    if (value === 'false') {
      query[key] = false
    } else if (value === 'true') {
      query[key] = true
    } else if (value === 'null') {
      query[key] = null
    } else if (typeof value === 'string') {
      try {
        query[key] = JSON.parse(value)
      } catch (err) {
        //
      }
    }
  }

  return query
}
