import * as React from 'react'
import * as qss from './qss'

import {
  createHashHistory,
  createBrowserHistory,
  createMemoryHistory,
  BrowserHistory,
  MemoryHistory,
  History,
  HashHistory,
} from 'history'
import { parse, stringify } from './jsurl'

export { createHashHistory, createBrowserHistory, createMemoryHistory }

//

declare global {
  const __DEV__: boolean
}

export type ReactLocationOptions = {
  history?: BrowserHistory | MemoryHistory | HashHistory
  basepath?: string
}

export type BuildNextOptions<TSearch> = {
  from?: string
  search?: Updater<TSearch>
  state?: Updater<StateObj>
  hash?: Updater<string>
}

export type NavigateOptions<TSearch> = BuildNextOptions<TSearch> & {
  replace?: boolean
}

export type SearchObj = Record<string, unknown>
export type StateObj = Record<string, unknown>

export type Updater<TResult, TPrevious = TResult> =
  | TResult
  | ((prev: TPrevious) => TResult)

export type Location<TSearch> = {
  href: string
  pathname: string
  search: TSearch
  searchStr: string
  state: StateObj
  hash: string
  key: string
}

export type Route = RouteBasic | RouteAsync

export type RouteBasic = {
  path: string
  loader?: LoaderFn
  element?: SyncOrAsyncNode
  errorElement?: SyncOrAsyncNode
  pendingElement?: SyncOrAsyncNode
  pendingMs?: number
  pendingMinMs?: number
  children?: Route[]
  import?: never
}

export type SyncOrAsyncNode = React.ReactNode | AsyncNode

export type AsyncNode = (opts: { params: Params }) => Promise<React.ReactNode>

export type RouteResolved = Omit<RouteBasic, 'import'>
export type RouteImported = Omit<RouteBasic, 'path' | 'import'>

export type RouteAsync = {
  path: string
  import: RouteImportFn
}

export type RouteImportFn = (opts: { params: Params }) => Promise<RouteImported>

export type RouteMatch<TParams = unknown, TData = unknown> = {
  route: RouteBasic
  pathname: string
  params: TParams extends {} ? TParams : Params
  status: 'pending' | 'resolved' | 'rejected'
  element?: React.ReactNode
  errorElement?: React.ReactNode
  pendingElement?: React.ReactNode
  data: TData extends {} ? TData : LoaderData
  error?: unknown
  isLoading: boolean
  loaderPromise: Promise<void>
  childMatch?: RouteMatch<TParams, TData>
  parentMatch?: RouteMatch<TParams, TData>
}

export type Params = Record<string, string>
export type LoaderData = Record<string, any>

export type LoaderFn = (
  routeMatch: RouteMatch,
  opts: LoaderFnOptions,
) => PromiseLike<LoaderData>

export type LoaderFnOptions = { dispatch: (event: LoaderDispatchEvent) => void }

type PromiseLike<T> = Promise<T> | T

export type ListenerFn = () => void

export type Segment = {
  type: 'pathname' | 'param'
  value: string
}

export type ReactLocationProps<TSearch> = {
  children: React.ReactNode
  location: ReactLocation<TSearch>
}

export type NavigateTo = string | null | undefined

export type UseNavigateOptions<TSearch> = {
  to?: string | null
  search?: Updater<TSearch>
  state?: Updater<StateObj>
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

export type LinkProps<TSearch> = Omit<
  React.AnchorHTMLAttributes<HTMLAnchorElement>,
  'href'
> & {
  to?: string
  search?: Updater<TSearch>
  state?: Updater<StateObj>
  hash?: Updater<string>
  replace?: boolean
  getActiveProps?: () => Record<string, any>
  activeOptions?: ActiveOptions
}

export type LocationState = {
  routeMatch?: RouteMatch
}

export type LoaderDispatchEvent =
  | {
      type: 'loading'
    }
  | {
      type: 'resolve'
      data: LoaderData
    }
  | {
      type: 'reject'
      error: unknown
    }

export type RouterState = {
  currentMatch?: RouteMatch
  isTransitioning: boolean
  isLoading: boolean
  previousLocation?: Location<LoaderData>
  currentLocation: Location<LoaderData>
  nextLocation?: Location<LoaderData>
}

//

function warning(cond: boolean, message: string) {
  if (!cond) {
    if (typeof console !== 'undefined') console.warn(message)

    try {
      throw new Error(message)
    } catch {}
  }
}

const LocationContext = React.createContext<ReactLocation<any>>(undefined!)

const defaultRouteMatch = {
  params: {},
  pathname: '/',
  route: null!,
  data: {},
  status: 'resolved',
  isLoading: false,
  element: <Outlet />,
  loaderPromise: Promise.resolve(),
} as const

const RouteContext = React.createContext<RouteMatch>(defaultRouteMatch)

// Detect if we're in the DOM
const isDOM = Boolean(
  typeof window !== 'undefined' &&
    window.document &&
    window.document.createElement,
)

// This is the default history object if none is defined
const createDefaultHistory = () =>
  isDOM ? createBrowserHistory() : createMemoryHistory()

function isFunction(d: any): d is Function {
  return typeof d === 'function'
}

export function functionalUpdate<TResult, TPrevious>(
  updater: Updater<TResult, TPrevious>,
  previous: TPrevious,
) {
  if (isFunction(updater)) {
    return updater(previous)
  }

  return updater
}

function parseSearch(search: string) {
  if (search.substring(0, 1) === '?') {
    search = search.substring(1)
  }

  let query = qss.decode(search)

  // Try to parse any query params that might be json
  for (let key in query) {
    const value = query[key]
    if (typeof value === 'string') {
      try {
        query[key] = parse(value)
      } catch (err) {
        //
      }
    }
  }

  return query
}

function stringifySearch(search: Record<string, unknown>) {
  search = { ...search }

  if (search) {
    Object.keys(search).forEach((key) => {
      const val = search[key]
      if (val && typeof val === 'object' && val !== null) {
        try {
          search[key] = stringify(val)
        } catch (err) {
          // silent
        }
      }
    })
  }

  let searchStr = qss.encode(search, '')

  return (searchStr = searchStr ? `?${searchStr}` : '')
}

function parseLocation<TSearch>(
  location: History['location'],
  previousLocation?: Location<TSearch>,
): Location<TSearch> {
  return {
    pathname: location.pathname,
    state: replaceEqualDeep(
      previousLocation?.state ?? {},
      location.state ?? {},
    ),
    searchStr: location.search,
    search: replaceEqualDeep(
      previousLocation?.search,
      parseSearch(location.search),
    ),
    hash: location.hash.split('#').reverse()[0] ?? '',
    href: `${location.pathname}${location.search}${location.hash}`,
    key: location.key,
  }
}

export class ReactLocation<TSearch> {
  history: BrowserHistory | MemoryHistory
  basepath: string
  current: Location<TSearch>
  destroy: () => void

  //

  listeners: ListenerFn[] = []

  constructor(options?: ReactLocationOptions) {
    this.history = options?.history || createDefaultHistory()
    this.basepath = options?.basepath || '/'
    this.current = parseLocation(this.history.location)

    this.destroy = this.history.listen((event) => {
      this.current = parseLocation(event.location, this.current)
      this.notify()
    })
  }

  // commit = () => {
  //   clearTimeout(this.commitTimeout);
  //   this.notify();
  //   return this.destroy;
  // };

  notify = () => {
    this.listeners.forEach((listener) => {
      listener()
    })
  }

  subscribe = (cb: ListenerFn) => {
    this.listeners.push(cb)

    return () => {
      this.listeners = this.listeners.filter((d) => d !== cb)
    }
  }

  private buildSearch(updater?: Updater<TSearch>) {
    const newSearch = functionalUpdate(updater, this.current.search)

    if (newSearch) {
      return replaceEqualDeep(this.current.search, newSearch)
    }

    return {}
  }

  private buildState = (updater?: Updater<StateObj>) => {
    const newState = functionalUpdate(updater, this.current.state)
    if (newState) {
      return replaceEqualDeep(this.current.state, newState)
    }

    return {}
  }

  private buildHash = (updater?: Updater<string>) => {
    return functionalUpdate(updater, this.current.hash)
  }

  buildNext = (
    to: NavigateTo,
    options: BuildNextOptions<TSearch> = {},
  ): Location<TSearch> => {
    const pathname = resolvePath(
      options.from || this.current.pathname,
      to ?? '.',
    )

    const search = this.buildSearch(options.search)

    const searchStr = stringifySearch(search)

    const state = this.buildState(options.state)

    let hash = this.buildHash(options.hash)
    hash = hash ? `#${hash}` : ''

    return {
      pathname,
      search,
      searchStr,
      state,
      hash,
      href: `${pathname}${searchStr}${hash}`,
      key: this.current.key,
    }
  }

  navigate(to: NavigateTo, options: NavigateOptions<TSearch> = {}) {
    this.current = this.buildNext(to, options)

    if (options.replace) {
      return this.history.replace(
        {
          pathname: this.current.pathname,
          hash: this.current.hash,
          search: this.current.searchStr,
        },
        this.current.state,
      )
    }

    return this.history.push(
      {
        pathname: this.current.pathname,
        hash: this.current.hash,
        search: this.current.searchStr,
      },
      this.current.state,
    )
  }
}

export function ReactLocationProvider<TSearch>({
  children,
  location: locationInstance,
}: ReactLocationProps<TSearch>) {
  const rootMatch = React.useMemo((): RouteMatch => {
    return {
      ...defaultRouteMatch,
      pathname: locationInstance.basepath,
    }
  }, [locationInstance.basepath])

  return (
    <LocationContext.Provider value={locationInstance}>
      <RouteContext.Provider value={rootMatch}>
        {children}
      </RouteContext.Provider>
    </LocationContext.Provider>
  )
}

export function useLocation<TSearch>() {
  const getIsMounted = useGetIsMounted()
  const [, rerender] = React.useReducer((d) => d + 1, 0)
  const instance = React.useContext(LocationContext) as ReactLocation<TSearch>
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

function rankRoutes(routes: Route[]): Route[] {
  return [...routes]
    .map((d, i) => {
      return { ...d, index: i }
    })
    .sort((a, b) => {
      const aSegments = segmentPathname(a.path)
      const bSegments = segmentPathname(b.path)

      // Multi-sort by each segment
      for (let i = 0; i < aSegments.length; i++) {
        const aSegment = aSegments[i]
        const bSegment = bSegments[i]

        if (aSegment && bSegment) {
          let sort: -1 | 1 | 0 = 0
          ;(
            [
              {
                key: 'value',
                value: '*',
              },
              {
                key: 'value',
                value: '/',
              },
              {
                key: 'type',
                value: 'param',
              },
            ] as const
          ).some((condition) => {
            if (
              [aSegment[condition.key], bSegment[condition.key]].includes(
                condition.value,
              ) &&
              aSegment[condition.key] !== bSegment[condition.key]
            ) {
              sort = aSegment[condition.key] === condition.value ? 1 : -1
              return true
            }

            return false
          })

          if (sort !== 0) {
            return sort
          }
        } else {
          // Then shorter segments last
          return aSegment ? -1 : 1
        }
      }

      // Keep things stable by route index
      return a.index - b.index
    })
}

export function useRoute<TParams, TData>() {
  return React.useContext(RouteContext) as RouteMatch<TParams, TData>
}

export function useNavigate<TSearch>() {
  const route = useRoute()
  const location = useLocation()

  function navigate(
    toOrOptions: NavigateTo | UseNavigateOptions<TSearch>,
    options?: UseNavigateOptions<TSearch>,
  ) {
    let to: NavigateTo = typeof toOrOptions === 'string' ? toOrOptions : null

    let {
      search,
      state,
      hash,
      replace,
      fromCurrent,
      to: optionalTo,
    } = (typeof toOrOptions === 'string' ? options : toOrOptions) ?? {}

    to = to ?? optionalTo ?? null

    fromCurrent = fromCurrent ?? to === null

    location.navigate(to, {
      from: fromCurrent ? location.current.pathname : route.pathname,
      search,
      state,
      hash,
      replace,
    })
  }

  return useLatestCallback(navigate)
}

export function useSearch<TSearch>() {
  const location = useLocation<TSearch>()
  return location.current.search
}

export function useResolvePath() {
  // TODO: document
  const route = useRoute()

  return React.useCallback(
    (path: string) => resolvePath(route.pathname, cleanPath(path)),
    [route],
  )
}

export function useMatch() {
  const location = useLocation()
  const resolvePath = useResolvePath()

  return useLatestCallback(
    (matchPath: string, options?: { exact?: boolean }) => {
      return matchRoute(location.current.pathname, resolvePath(matchPath), {
        exact: options?.exact,
      })
    },
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

export function Routes(options: {
  routes: Route[]
  pendingElement?: React.ReactNode
  initialMatch?: RouteMatch
}) {
  const { routes, ...rest } = options
  return useRoutes(routes, rest)
}

function findMatch<T>(match: T, fn: (match: T) => any): T | undefined {
  if (!match) {
    return
  }

  if (fn(match)) {
    return match
  }

  return findMatch((match as any).childMatch, fn)
}

const routerStateContext = React.createContext<RouterState>(null!)

export function useRouterState() {
  // TODO: add docs
  const context = React.useContext(routerStateContext)
  if (!context) {
    warning(
      true,
      'You are trying to use useRouterState() outside of ReactLocation!',
    )
    throw new Error()
  }
  return context
}

export function useRoutes(
  routes: Route[],
  options?: {
    initialMatch?: RouteMatch
    pendingElement?: React.ReactNode
  },
): JSX.Element {
  const location = useLocation<LoaderData>()
  const route = useRoute()
  const startTransition =
    (React as any).useTransition?.() ??
    function <T>(cb: () => T): void {
      cb()
    }

  const [state, setState] = React.useState<RouterState>({
    isLoading: null!, // This get's overwritten
    isTransitioning: !options?.initialMatch,
    currentMatch: options?.initialMatch,
    currentLocation: location.current,
  })

  const isLoading = !!(
    state.currentMatch && findMatch(state.currentMatch, (d) => d.isLoading)
  )

  const routerStateContextValue = React.useMemo(
    (): RouterState => ({
      ...state,
      isLoading,
    }),
    [state],
  )

  const latestRef = React.useRef(0)

  const loadNextLocation = (nextLocation: Location<LoaderData>) => {
    let done = false

    setState((old) => ({
      ...old,
      isTransitioning: true,
      previousLocation: old.currentLocation,
      nextLocation,
    }))

    //
    ;(async () => {
      const id = Date.now()
      latestRef.current = id

      const isLatest = () => !done && latestRef.current === id

      const nextMatch = await matchRoutes(
        location.current.pathname,
        routes,
        route,
      )

      setState((old) => ({
        ...old,
        previousMatch: old.currentMatch,
        nextMatch,
      }))

      if (!nextMatch || !isLatest()) {
        setState((old) => ({
          ...old,
          currentMatch: undefined,
          isTransitioning: false,
          currentLocation: nextLocation,
          nextLocation: undefined,
        }))
        return
      }

      loadMatch(nextMatch, () => {
        if (!isLatest()) {
          return
        }

        startTransition(() => {
          setState((old) => ({
            ...old,
            isTransitioning: false,
            currentMatch: { ...nextMatch },
            currentLocation: nextLocation,
            nextLocation: undefined,
          }))
        })
      })
    })()

    return () => {
      done = true
    }
  }

  React.useEffect(() => {
    try {
      return loadNextLocation(location.current)
    } catch (err) {
      console.error(err)
    }
  }, [location.current.key])

  return (
    <routerStateContext.Provider value={routerStateContextValue}>
      {state.currentMatch
        ? renderMatch(state.currentMatch)
        : ((options?.pendingElement ?? null) as JSX.Element)}
    </routerStateContext.Provider>
  )
}

function renderMatch(match: RouteMatch) {
  const element = (() => {
    if (match.status === 'rejected') {
      if (match.errorElement) {
        return match.errorElement
      }
      throw match.error
    }

    if (match.status === 'pending') {
      if (match.route.pendingMs || match.pendingElement) {
        return match.pendingElement ?? null
      }
    }

    return match.element ?? <Outlet />
  })()

  return (
    <RouteContext.Provider value={match} key={match.status}>
      {element}
    </RouteContext.Provider>
  )
}

export async function matchRoutes(
  currentPathname: string,
  routes: Route[],
  parentMatch: RouteMatch,
): Promise<undefined | RouteMatch> {
  if (!routes?.length) {
    return
  }

  const recurse = async (routes: Route[], parentMatch: RouteMatch) => {
    // Import (handle this here)
    // - Elements (handle the rest later)
    // - Loader
    // - Children

    let { pathname, params } = parentMatch

    const rankedRoutes = rankRoutes(routes)

    const flexRoute = rankedRoutes.find((route) => {
      const fullRoutePathName = joinPaths([pathname, route.path])

      const matchParams = matchRoute(currentPathname, fullRoutePathName)

      if (matchParams) {
        Object.assign(params, matchParams)
      }

      return !!matchParams
    })

    if (!flexRoute) {
      return
    }

    const interpolatedPathSegments = segmentPathname(flexRoute.path)

    const interpolatedPath = joinPaths(
      interpolatedPathSegments.map((segment) => {
        if (segment.value === '*') {
          return ''
        }

        if (segment.type === 'param') {
          return params[segment.value] ?? ''
        }

        return segment.value
      }),
    )

    pathname = joinPaths([pathname, interpolatedPath])

    let route: RouteResolved

    if (flexRoute.import) {
      const res = await flexRoute.import({ params })
      route = {
        ...flexRoute,
        ...res,
      }
    } else {
      route = flexRoute
    }

    const match: RouteMatch = {
      parentMatch,
      route,
      params,
      pathname,
      data: {},
      status: 'pending',
      isLoading: false,
      loaderPromise: Promise.resolve() as Promise<any>,
    }

    if (route.children) {
      match.childMatch = await recurse(route.children, match)
    }

    return match
  }

  return await recurse(routes, parentMatch)
}

export function loadMatch(
  rootMatch: RouteMatch | undefined,
  onRender: () => void,
) {
  if (!rootMatch) {
    return
  }

  const firstRenderPromises: Promise<unknown>[] = []

  const recurse = (match: RouteMatch, parentMatch?: RouteMatch) => {
    let routePromises: Promise<any>[] = []

    // For each element type, potentially load it asynchronously
    const elementTypes = ['element', 'errorElement', 'pendingElement'] as const

    elementTypes.forEach((type) => {
      const routeElement = match.route[type]

      if (typeof routeElement === 'function') {
        routePromises.push(
          (routeElement as AsyncNode)(match).then((res) => {
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
      match.status === 'resolved'
    } else {
      match.loaderPromise = match.loaderPromise.then(() => {
        match.data = {
          ...parentMatch?.data,
        }

        return new Promise<void>(async (resolve) => {
          let pendingTimeout: ReturnType<typeof setTimeout>
          let pendingMinPromise = Promise.resolve()

          if (match.route.pendingMs) {
            pendingTimeout = setTimeout(() => {
              onRender()
              if (match.route.pendingMinMs) {
                pendingMinPromise = new Promise((r) =>
                  setTimeout(r, match.route.pendingMinMs),
                )
              }
            }, match.route.pendingMs)
          }

          const finish = () => {
            clearTimeout(pendingTimeout!)
            resolve()
            match.isLoading = false
          }

          try {
            match.isLoading = true
            const loadData = await load(match, {
              dispatch: async (event) => {
                await Promise.all([
                  match.loaderPromise,
                  firstRenderPromise,
                  pendingMinPromise,
                ])
                if (event.type === 'resolve') {
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
                onRender()
              },
            })
            match.status = 'resolved'
            match.data = {
              ...parentMatch?.data,
              ...loadData,
            }
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

      if (match.childMatch) {
        recurse(match.childMatch, match)
      }
    }
  }

  recurse(rootMatch)

  const firstRenderPromise = Promise.all(firstRenderPromises).then(onRender)
}

export function Link<TSearch>({
  to = '.',
  search,
  state,
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
}: LinkProps<TSearch>) {
  const route = useRoute()
  const location = useLocation<TSearch>()
  const navigate = useNavigate()

  // If this `to` is a valid external URL, log a warning
  try {
    const url = new URL(to)
    warning(
      false,
      `<Link /> should not be used for external URLs like: ${url.href}`,
    )
  } catch (e) {}

  const next = location.buildNext(to, {
    from: route.pathname,
    search,
    state,
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
      navigate(to, {
        search,
        state,
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

export function Outlet() {
  const route = useRoute()

  const { childMatch } = route

  if (!childMatch) {
    return null
  }

  return renderMatch(childMatch)
}

export function Navigate<TSearch>({
  to,
  ...options
}: { to: NavigateTo } & UseNavigateOptions<TSearch>) {
  let navigate = useNavigate()

  React.useLayoutEffect(() => {
    navigate(to, options)
  }, [navigate])

  return null
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

function joinPaths(paths: string[]) {
  return cleanPathname(paths.join('/'))
}

function matchRoute(
  base: string,
  path: string,
  options?: { exact?: boolean },
): null | Params {
  const baseSegments = segmentPathname(base)
  const routeSegments = segmentPathname(path)

  const params: Params = {}

  // /workspaces/tanner/teams
  // /workspaces/:idddd/teams/new
  // /workspaces/:idddd/teams/:teamId

  const max = Math.max(baseSegments.length, routeSegments.length)

  let isMatch = (() => {
    for (let i = 0; i < max; i++) {
      const baseSegment = baseSegments[i]
      const routeSegment = routeSegments[i]

      if (!baseSegment) {
        if (routeSegment?.type === 'pathname' && routeSegment?.value === '/') {
          return true
        }
        return false
      }

      if (routeSegment?.value === '*') {
        return true
      }

      if (!baseSegment) {
        return false
      }

      if (!routeSegment?.value) {
        return !options?.exact
      }

      if (routeSegment.type === 'param') {
        params[routeSegment.value] = baseSegment.value
      } else if (routeSegment.value !== baseSegment.value) {
        return false
      }
    }

    return true
  })()

  if (isMatch) {
    return params
  }

  return null
}

function segmentPathname(pathname: string) {
  pathname = cleanPathname(pathname)

  const segments: Segment[] = []

  if (pathname.substring(0, 1) === '/') {
    segments.push({
      type: 'pathname',
      value: '/',
    })
    pathname = pathname.substring(1)
  }

  // Remove empty segments and '.' segments
  const split = pathname.split('/').filter((path) => {
    return path.length && path !== '.'
  })

  segments.push(
    ...split.map((part): Segment => {
      if ([':', '$'].includes(part.charAt(0))) {
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
  let baseSegments = segmentPathname(base)
  const toSegments = segmentPathname(to)

  toSegments.forEach((toSegment) => {
    if (toSegment.type === 'param') {
      warning(
        true,
        'Destination pathnames may not contain route parameter placeholders.',
      )
      throw new Error()
    } else if (toSegment.value === '/') {
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
