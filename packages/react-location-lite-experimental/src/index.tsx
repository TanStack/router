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
import { decode, encode } from './qss'

export { createHashHistory, createBrowserHistory, createMemoryHistory }

// Types

type Timeout = ReturnType<typeof setTimeout>

type Maybe<T, TUnknown> = T extends {} ? T : TUnknown

export type DefaultGenerics = {
  Params: Params<string>
  Search: Search<unknown>
  RouteMeta: RouteMeta<unknown>
}

export type PartialGenerics = Partial<DefaultGenerics>
export type MakeGenerics<TGenerics extends PartialGenerics> = TGenerics

export type Search<T> = Record<string, T>
export type Params<T> = Record<string, T>
export type RouteMeta<T> = Record<string, T>

export type UseGeneric<
  TGenerics extends PartialGenerics,
  TGeneric extends keyof PartialGenerics,
> = TGeneric extends 'Search'
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

export type Route<TGenerics extends PartialGenerics = DefaultGenerics> = {
  // The path to match (relative to the nearest parent `Route` component or root basepath)
  path?: string
  // An ID to uniquely identify this route within its siblings. This is only required for routes that *only match on search* or if you have multiple routes with the same path
  id?: string
  // If true, this route will be matched as case-sensitive
  caseSensitive?: boolean
  // Either (1) an object that will be used to shallowly match the current location's search or (2) A function that receives the current search params and can return truthy if they are matched.
  search?: SearchPredicate<UseGeneric<TGenerics, 'Search'>>
  // Filter functions that can manipulate search params *before* they are passed to links and navigate
  // calls that match this route.
  preSearchFilters?: SearchFilter<TGenerics>[]
  // Filter functions that can manipulate search params *after* they are passed to links and navigate
  // calls that match this route.
  postSearchFilters?: SearchFilter<TGenerics>[]
  // An array of child routes
  children?: Route<TGenerics>[]
  // Route Loaders (see below) can be inline on the route, or resolved async
  pendingElement?: React.ReactNode
} & RouteLoaders<TGenerics>

export type RouteLoaders<TGenerics extends PartialGenerics = DefaultGenerics> =
  {
    // The content to be rendered when the route is matched. If no element is provided, defaults to `<Outlet />`
    element?: React.ReactNode
    // An asynchronous function responsible for preparing or fetching data for the route before it is rendered
    // An object of whatever you want! This object is accessible anywhere matches are.
    meta?: UseGeneric<TGenerics, 'RouteMeta'>
  }

export type SearchFilter<TGenerics extends PartialGenerics = DefaultGenerics> =
  (prev: UseGeneric<TGenerics, 'Search'>) => UseGeneric<TGenerics, 'Search'>

export type MatchLocation<TGenerics extends PartialGenerics = DefaultGenerics> =
  {
    to?: string | number | null
    search?: SearchPredicate<UseGeneric<TGenerics, 'Search'>>
    fuzzy?: boolean
    caseSensitive?: boolean
  }

export type SearchPredicate<TSearch> = (search: TSearch) => any

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

export type RouterOptions<TGenerics extends PartialGenerics = DefaultGenerics> =
  {
    // An array of route objects to match
    routes: Route<TGenerics>[]
    basepath?: string
    filterRoutes?: FilterRoutesFn
    useErrorBoundary?: boolean
    defaultElement?: React.ReactNode
    defaultPendingElement?: React.ReactNode
    caseSensitive?: boolean
    // An array of route match objects that have been both _matched_ and _loaded_. See the [SRR](#ssr) section for more details
    // snapshot?: RouterSnapshot<TGenerics>
  }

export type BuildNextOptions<
  TGenerics extends PartialGenerics = DefaultGenerics,
> = {
  to?: string | number | null
  search?: true | Updater<UseGeneric<TGenerics, 'Search'>>
  hash?: true | Updater<string>
  from?: Partial<Location<TGenerics>>
  key?: string
  __preSearchFilters?: SearchFilter<TGenerics>[]
  __postSearchFilters?: SearchFilter<TGenerics>[]
}

export type NavigateOptions<
  TGenerics extends PartialGenerics = DefaultGenerics,
> = BuildNextOptions<TGenerics> & {
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

export type TransitionState<
  TGenerics extends PartialGenerics = DefaultGenerics,
> = {
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
const routerContext = React.createContext<
  RouterInstance<any> & { state: TransitionState<any> }
>(null!)

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

  listeners: Listener[] = []
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

  subscribe(listener: Listener): () => void {
    this.listeners.push(listener as Listener)

    return () => {
      this.listeners = this.listeners.filter((x) => x !== listener)
    }
  }

  notify(): void {
    this.listeners.forEach((listener) => listener())
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

    // Pre filters first
    const preFilteredSearch = dest.__preSearchFilters?.length
      ? dest.__preSearchFilters.reduce((prev, next) => next(prev), from.search)
      : from.search

    // Then the link/navigate function
    const destSearch =
      dest.search === true
        ? preFilteredSearch // Preserve from true
        : dest.search
        ? functionalUpdate(dest.search, preFilteredSearch) ?? {} // Updater
        : dest.__preSearchFilters?.length
        ? preFilteredSearch // Preserve from filters
        : {}

    // Then post filters
    const postFilteredSearch = dest.__postSearchFilters?.length
      ? dest.__postSearchFilters.reduce((prev, next) => next(prev), destSearch)
      : destSearch

    const search = replaceEqualDeep(from.search, postFilteredSearch)

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

export type MatchesProviderProps<
  TGenerics extends PartialGenerics = DefaultGenerics,
> = {
  value: RouteMatch<TGenerics>[]
  children: React.ReactNode
}

export function MatchesProvider<
  TGenerics extends PartialGenerics = DefaultGenerics,
>(props: MatchesProviderProps<TGenerics>) {
  return <MatchesContext.Provider {...props} />
}

export type RouterInstance<
  TGenerics extends PartialGenerics = DefaultGenerics,
> = {
  routesById: Record<string, Route<TGenerics>>
  basepath: string
  rootMatch?: RouteMatch<TGenerics>
  routes: Route<TGenerics>[]
  filterRoutes?: FilterRoutesFn
  useErrorBoundary?: boolean
  defaultElement?: React.ReactNode
  defaultPendingElement?: React.ReactNode
  caseSensitive?: boolean
  state: TransitionState<TGenerics>
}

export function Router<TGenerics extends PartialGenerics = DefaultGenerics>({
  children,
  location,
  routes,
  basepath: userBasepath,
  // snapshot,
  ...rest
}: RouterProps<TGenerics>) {
  const basepath = cleanPath(`/${userBasepath ?? ''}`)

  const [routerState, setRouterState] = React.useState<
    TransitionState<TGenerics>
  >({
    location: location.current,
    matches: [],
  })

  const rootMatch = React.useMemo(
    () => ({
      id: 'root',
      params: {} as any,
      search: {} as any,
      pathname: basepath,
      route: null!,
    }),
    [basepath],
  )

  const router: RouterInstance<TGenerics> = React.useMemo(() => {
    const routesById: RouterInstance<TGenerics>['routesById'] = {}

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
          id,
        }

        if (routesById[id]) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn(
              `Duplicate routes found with id: ${id}`,
              routesById,
              route,
            )
          }
          throw new Error()
        }

        routesById[id] = route

        route.children = route.children?.length
          ? recurseRoutes(route.children, route)
          : undefined

        return route
      })
    }

    routes = recurseRoutes(routes)

    return {
      ...rest,
      routesById,
      routes,
      basepath,
      rootMatch,
      state: routerState,
    }
  }, [routerState, rootMatch, basepath])

  useLayoutEffect(() => {
    const update = () => {
      const matches = matchRoutes(router, location.current)

      setRouterState(() => {
        return {
          location: location.current,
          matches: matches,
        }
      })
    }

    update()

    return location.subscribe(update)
  }, [location])

  return (
    <LocationContext.Provider value={{ location }}>
      <routerContext.Provider value={router}>
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

export type RouteMatch<TGenerics extends PartialGenerics = DefaultGenerics> = {
  id: string
  route: Route<TGenerics>
  pathname: string
  params: UseGeneric<TGenerics, 'Params'>
  search: UseGeneric<TGenerics, 'Search'>
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

  return value as RouterInstance<TGenerics>
}

export type MatchRoutesType<
  TGenerics extends PartialGenerics = DefaultGenerics,
> = (
  router: RouterInstance<TGenerics>[],
  currentLocation: Location<TGenerics>,
) => Promise<RouteMatch<TGenerics>[]>

export function matchRoutes<
  TGenerics extends PartialGenerics = DefaultGenerics,
>(
  router: RouterInstance<TGenerics>,
  currentLocation: Location<TGenerics>,
): RouteMatch<TGenerics>[] {
  if (!router.routes.length) {
    return []
  }

  const matches: RouteMatch<TGenerics>[] = []

  const recurse = (
    routes: Route<TGenerics>[],
    parentMatch: RouteMatch<TGenerics>,
  ) => {
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

    const match: RouteMatch<TGenerics> = {
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

function useBuildNext<TGenerics extends PartialGenerics = DefaultGenerics>() {
  const location = useLocation<TGenerics>()
  const router = useRouter<TGenerics>()

  const buildNext = (opts: BuildNextOptions<TGenerics>) => {
    const next = location.buildNext(router.basepath, opts)

    const matches = matchRoutes<TGenerics>(router, next)

    const __preSearchFilters = matches
      .map((match) => match.route.preSearchFilters ?? [])
      .flat()
      .filter(Boolean)

    const __postSearchFilters = matches
      .map((match) => match.route.postSearchFilters ?? [])
      .flat()
      .filter(Boolean)

    return location.buildNext(router.basepath, {
      ...opts,
      __preSearchFilters,
      __postSearchFilters,
    })
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
  disabled,
  _ref,
  ...rest
}: LinkProps<TGenerics>) {
  const match = useMatch<TGenerics>()
  const location = useLocation<TGenerics>()
  const navigate = useNavigate<TGenerics>()
  const buildNext = useBuildNext<TGenerics>()

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

  const matchElement = match.route.element ?? router.defaultElement

  const element = (
    <MatchesProvider value={matches}>
      {matchElement ?? <Outlet />}
    </MatchesProvider>
  )

  const pendingElement =
    match.route.pendingElement ?? router.defaultPendingElement

  if (pendingElement) {
    return <React.Suspense fallback={pendingElement}>{element}</React.Suspense>
  }

  return element
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

export function useMatchRoute<
  TGenerics extends PartialGenerics = DefaultGenerics,
>(): (
  matchLocation: MatchLocation<TGenerics>,
  opts?: { caseSensitive?: boolean },
) => Maybe<TGenerics['Params'], Params<any>> | undefined {
  const router = useRouter<TGenerics>()
  const resolvePath = useResolvePath<TGenerics>()

  return useLatestCallback(
    (matchLocation: MatchLocation<TGenerics> & { pending?: boolean }) => {
      matchLocation = {
        ...matchLocation,
        to: matchLocation.to ? resolvePath(`${matchLocation.to}`) : undefined,
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
}: MatchLocation<TGenerics> & {
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
): TCallback {
  const stableFnRef =
    React.useRef<(...args: Parameters<TCallback>) => ReturnType<TCallback>>()
  const cbRef = React.useRef<TCallback>(cb)

  cbRef.current = cb

  if (!stableFnRef.current) {
    stableFnRef.current = (...args) => cbRef.current(...args)
  }

  return stableFnRef.current as TCallback
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

    const searchStr = encode(search as Record<string, string>)

    return searchStr ? `?${searchStr}` : ''
  }
}
