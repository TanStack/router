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

export type BuildNextOptions = {
  from?: string
  search?: Updater<SearchObj>
  state?: Updater<StateObj>
  hash?: Updater<string>
}

export type NavigateOptions = BuildNextOptions & {
  replace?: boolean
}

export type SearchObj = Record<string, unknown>
export type StateObj = Record<string, unknown>

export type Updater<TResult, TPrevious = TResult> =
  | TResult
  | ((prev: TPrevious) => TResult)

export type Location = {
  href: string
  pathname: string
  search: SearchObj
  searchStr: string
  state: StateObj
  hash: string
  key: string
}

export type Route = RouteBasic | RouteAsync

type RouteBasic = {
  path: string
  load?: LoadFn
  waitForParents?: boolean
  element?: React.ReactNode
  children?: Route[]
  import?: never
}

type RouteImported = Omit<RouteBasic, 'path'>

type RouteAsync = {
  path: string
  import: RouteImportFn
}

export type RouteMatch = {
  route: RouteBasic
  pathname: string
  params: Params
  data: LoadData
  childMatch?: RouteMatch
}

export type Params = Record<string, string>
export type LoadData = Record<string, unknown>

export type RouteImportFn = (route: {
  params: Params
}) => PromiseLike<RouteImported>

export type LoadFn = (routeMatch: RouteMatch) => PromiseLike<LoadData>

type PromiseLike<T> = Promise<T> | T

export type ListenerFn = () => void

export type Segment = {
  type: 'pathname' | 'param'
  value: string
}

export type ReactLocationProps = {
  children: React.ReactNode
  location: ReactLocation
}

export type NavigateTo = string | null | undefined

export type UseNavigateOptions = {
  to?: string | null
  search?: Updater<SearchObj>
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

export type LinkProps = Omit<
  React.AnchorHTMLAttributes<HTMLAnchorElement>,
  'href'
> & {
  to: string
  search?: Updater<SearchObj>
  state?: Updater<StateObj>
  hash?: Updater<string>
  replace?: boolean
  getActiveProps?: () => Record<string, any>
  activeOptions?: ActiveOptions
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

const LocationContext = React.createContext<ReactLocation>(undefined!)

const RouteContext = React.createContext<RouteMatch>({
  route: null!,
  pathname: '/',
  params: {},
  data: {},
})

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

function stringifySearch(search: SearchObj) {
  search = { ...search }

  if (search) {
    Object.keys(search).forEach(key => {
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

const parseLocation = (
  location: History['location'],
  previousLocation?: Location,
): Location => {
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

export class ReactLocation {
  history: BrowserHistory | MemoryHistory
  basepath: string
  current: Location
  destroy: () => void

  //

  listeners: ListenerFn[] = []

  constructor(options?: ReactLocationOptions) {
    this.history = options?.history || createDefaultHistory()
    this.basepath = options?.basepath || '/'
    this.current = parseLocation(this.history.location)

    this.destroy = this.history.listen(event => {
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
    this.listeners.forEach(listener => {
      listener()
    })
  }

  subscribe = (cb: ListenerFn) => {
    this.listeners.push(cb)

    return () => {
      this.listeners = this.listeners.filter(d => d !== cb)
    }
  }

  private buildSearch = (updater?: Updater<SearchObj>) => {
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

  buildNext = (to: NavigateTo, options: BuildNextOptions = {}): Location => {
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

  navigate = (to: NavigateTo, options: NavigateOptions = {}) => {
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

export function ReactLocationProvider({
  children,
  location: locationInstance,
}: ReactLocationProps) {
  // React.useEffect(() => locationInstance.commit());

  const rootMatch = React.useMemo((): RouteMatch => {
    return {
      params: {},
      pathname: locationInstance.basepath,
      route: null!,
      data: {},
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

export function useLocation() {
  const getIsMounted = useGetIsMounted()
  const [, rerender] = React.useReducer(d => d + 1, 0)
  const instance = React.useContext(LocationContext)
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

function parsePath(path: string) {
  path = cleanRoutePath(path)
  const segments = segmentPathname(path)

  return [path, segments] as const
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
          ;([
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
          ] as const).some(condition => {
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

export function useRoute() {
  return React.useContext(RouteContext)
}

export function useNavigate() {
  const route = useRoute()
  const location = useLocation()

  return useLatestCallback(
    (
      toOrOptions: NavigateTo | UseNavigateOptions,
      options?: UseNavigateOptions,
    ) => {
      let to: NavigateTo = typeof toOrOptions === 'string' ? toOrOptions : null

      let { search, state, hash, replace, fromCurrent, to: optionalTo } =
        (typeof toOrOptions === 'string' ? options : toOrOptions) ?? {}

      to = to ?? optionalTo ?? null

      fromCurrent = fromCurrent ?? to === null

      location.navigate(to, {
        from: fromCurrent ? location.current.pathname : route.pathname,
        search,
        state,
        hash,
        replace,
      })
    },
  )
}

export function useSearch() {
  const location = useLocation()
  return location.current.search
}

export function useMatch() {
  const location = useLocation()
  const route = useRoute()

  return useLatestCallback(
    (matchPath: string, options?: { exact?: boolean }) => {
      const [path] = parsePath(matchPath)
      const fullPath = joinPaths([route.pathname, path])
      return matchRoute(location.current.pathname, fullPath, {
        exact: options?.exact,
      })
    },
  )
}

export function usePrompt(message: string, when = true): void {
  const location = useLocation()

  React.useEffect(() => {
    if (!when) return

    let unblock = location.history.block(transition => {
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
  fallback?: React.ReactNode
  initialMatch?: RouteMatch
}) {
  const { routes, ...rest } = options
  return useRoutes(routes, rest)
}

export function useRoutes(
  routes?: Route[],
  options?: { initialMatch?: RouteMatch; fallback?: React.ReactNode },
) {
  const location = useLocation()
  const route = useRoute()
  const [matchedRoute, setMatchedRoute] = React.useState(options?.initialMatch)

  if (!routes) {
    return null
  }

  const latestRef = React.useRef(0)

  React.useEffect(() => {
    ;(async () => {
      const id = Date.now()
      latestRef.current = id

      try {
        const newMatch = await matchRoutes(
          location.current.pathname,
          routes,
          route.pathname,
          route.params,
        )

        if (latestRef.current === id) {
          await loadMatch(newMatch)
          console.log(newMatch)
        }

        if (latestRef.current === id) {
          setMatchedRoute(newMatch)
        }
      } catch (err) {
        console.error(err)
      }
    })()
  }, [location.current.pathname])

  if (!matchedRoute) {
    return options?.fallback ?? null
  }

  return (
    <RouteContext.Provider value={matchedRoute}>
      {matchedRoute.route?.element ?? null}
    </RouteContext.Provider>
  )
}

export async function matchRoutes(
  currentPathname: string,
  routes: Route[],
  userBasePath?: string,
  userParams?: Params,
): Promise<undefined | RouteMatch> {
  if (!routes?.length) {
    return
  }

  const basePath = userBasePath ?? '/'
  const params = userParams ?? {}

  const rankedRoutes = rankRoutes(routes)

  let route = rankedRoutes.find(route => {
    const fullRoutePathName = joinPaths([basePath, route.path])

    const matchParams = matchRoute(currentPathname, fullRoutePathName)

    if (matchParams) {
      Object.assign(params, matchParams)
    }

    return !!matchParams
  })

  if (!route) {
    return
  }

  const interpolatedPathSegments = segmentPathname(route.path)

  const interpolatedPath = joinPaths(
    interpolatedPathSegments.map(segment => {
      if (segment.value === '*') {
        return ''
      }

      if (segment.type === 'param') {
        return params[segment.value] ?? ''
      }

      return segment.value
    }),
  )

  const pathname = joinPaths([basePath, interpolatedPath])

  if (route.import) {
    route = {
      path: route.path,
      ...(await route.import({ params })),
    }
  }

  const match: RouteMatch = {
    route,
    params,
    pathname,
    data: {},
  }

  match.childMatch = await matchRoutes(
    currentPathname,
    route.children ?? [],
    match.pathname,
    match.params,
  )

  return match
}

export async function loadMatch(match?: RouteMatch) {
  if (!match) {
    return
  }

  let promises: Promise<unknown>[] = []

  const recurse = (
    match: RouteMatch,
    parentPromise: Promise<unknown>,
    parentMatch?: RouteMatch,
  ) => {
    if (!match) {
      return
    }

    const load = match.route.load

    if (load) {
      let promise = Promise.resolve() as Promise<unknown>

      if (match.route.waitForParents) {
        promise = parentPromise
      }

      promise = promise.then(async () => {
        match.data = {
          ...parentMatch?.data,
        }

        const loadData = await load(match)

        match.data = {
          ...parentMatch?.data,
          ...loadData,
        }
      })

      promises.push(promise)

      if (match.childMatch) {
        recurse(match.childMatch, promise, match)
      }
    }
  }

  recurse(match, Promise.resolve())

  if (__DEV__) console.time('Match Loaded')
  await Promise.all(promises)
  if (__DEV__) console.timeEnd('Match Loaded')
}

export function Link({
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
}: LinkProps) {
  const route = useRoute()
  const location = useLocation()
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

export function Outlet(_props: {}) {
  const route = useRoute()

  const { childMatch } = route

  if (!childMatch) {
    return null
  }

  return (
    <RouteContext.Provider value={childMatch}>
      {childMatch.route?.element ?? null}
    </RouteContext.Provider>
  )
}

export function Navigate({
  to,
  ...options
}: { to: NavigateTo } & UseNavigateOptions) {
  let navigate = useNavigate()

  React.useLayoutEffect(() => {
    navigate(to, options)
  }, [navigate])

  return null
}

function cleanPathname(pathname: string) {
  return `${pathname}`.replace(/\/{2,}/g, '/')
}

export function cleanRoutePath(path: string) {
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
  const split = pathname.split('/').filter(path => {
    return path.length && path !== '.'
  })

  segments.push(
    ...split.map(
      (part): Segment => {
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
      },
    ),
  )

  return segments
}

function resolvePath(base: string, to: string) {
  let baseSegments = segmentPathname(base)
  const toSegments = segmentPathname(to)

  toSegments.forEach(toSegment => {
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

  const joined = baseSegments.map(d => d.value).join('/')

  return cleanPathname(joined)
}

function isCtrlEvent(e: React.MouseEvent) {
  return !!(e.metaKey || e.altKey || e.ctrlKey || e.shiftKey)
}

function useLatestCallback<TCallback extends (...args: any[]) => any>(
  cb: TCallback,
) {
  const stableFnRef = React.useRef<
    (...args: Parameters<TCallback>) => ReturnType<TCallback>
  >()
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
