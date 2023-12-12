import {
  HistoryLocation,
  HistoryState,
  RouterHistory,
  createBrowserHistory,
  createMemoryHistory,
} from '@tanstack/history'
import { Store } from '@tanstack/store'

//

import {
  AnySearchSchema,
  AnyRoute,
  AnyContext,
  AnyPathParams,
  RouteMask,
  Route,
  LoaderFnContext,
} from './route'
import { FullSearchSchema, RoutesById, RoutesByPath } from './routeInfo'
import { defaultParseSearch, defaultStringifySearch } from './searchParams'
import {
  PickAsRequired,
  Updater,
  NonNullableUpdater,
  replaceEqualDeep,
  deepEqual,
  escapeJSON,
  functionalUpdate,
  last,
  pick,
} from './utils'
import {
  ErrorRouteComponent,
  PendingRouteComponent,
  RouteComponent,
} from './route'
import { AnyRouteMatch, RouteMatch } from './Matches'
import { ParsedLocation } from './location'
import { LocationState } from './location'
import { SearchSerializer, SearchParser } from './searchParams'
import {
  BuildLinkFn,
  BuildLocationFn,
  CommitLocationOptions,
  InjectedHtmlEntry,
  MatchRouteFn,
  NavigateFn,
  getRouteMatch,
} from './RouterProvider'

import {
  cleanPath,
  interpolatePath,
  joinPaths,
  matchPathname,
  parsePathname,
  removeBasepath,
  resolvePath,
  trimPath,
  trimPathLeft,
  trimPathRight,
} from './path'
import invariant from 'tiny-invariant'
import { isRedirect } from './redirects'
// import warning from 'tiny-warning'

//

declare global {
  interface Window {
    __TSR_DEHYDRATED__?: HydrationCtx
    __TSR_ROUTER_CONTEXT__?: React.Context<Router<any>>
  }
}

export interface Register {
  // router: Router
}

export type AnyRouter = Router<AnyRoute, any>

export type RegisteredRouter = Register extends {
  router: infer TRouter extends AnyRouter
}
  ? TRouter
  : AnyRouter

export type HydrationCtx = {
  router: DehydratedRouter
  payload: Record<string, any>
}

export type RouterContextOptions<TRouteTree extends AnyRoute> =
  AnyContext extends TRouteTree['types']['routerContext']
    ? {
        context?: TRouteTree['types']['routerContext']
      }
    : {
        context: TRouteTree['types']['routerContext']
      }

export interface RouterOptions<
  TRouteTree extends AnyRoute,
  TDehydrated extends Record<string, any> = Record<string, any>,
> {
  history?: RouterHistory
  stringifySearch?: SearchSerializer
  parseSearch?: SearchParser
  defaultPreload?: false | 'intent'
  defaultPreloadDelay?: number
  defaultComponent?: RouteComponent<AnySearchSchema, AnyPathParams, AnyContext>
  defaultErrorComponent?: ErrorRouteComponent<
    AnySearchSchema,
    AnyPathParams,
    AnyContext
  >
  defaultPendingComponent?: PendingRouteComponent<
    AnySearchSchema,
    AnyPathParams,
    AnyContext
  >
  defaultPendingMs?: number
  defaultPendingMinMs?: number
  caseSensitive?: boolean
  routeTree?: TRouteTree
  basepath?: string
  context?: TRouteTree['types']['routerContext']
  dehydrate?: () => TDehydrated
  hydrate?: (dehydrated: TDehydrated) => void
  routeMasks?: RouteMask<TRouteTree>[]
  unmaskOnReload?: boolean
  Wrap?: (props: { children: any }) => JSX.Element
  notFoundRoute?: AnyRoute
}

export interface RouterState<TRouteTree extends AnyRoute = AnyRoute> {
  status: 'pending' | 'idle'
  isLoading: boolean
  isTransitioning: boolean
  matches: RouteMatch<TRouteTree>[]
  pendingMatches?: RouteMatch<TRouteTree>[]
  location: ParsedLocation<FullSearchSchema<TRouteTree>>
  resolvedLocation: ParsedLocation<FullSearchSchema<TRouteTree>>
  lastUpdated: number
}

export type ListenerFn<TEvent extends RouterEvent> = (event: TEvent) => void

export interface BuildNextOptions {
  to?: string | number | null
  params?: true | Updater<unknown>
  search?: true | Updater<unknown>
  hash?: true | Updater<string>
  state?: true | NonNullableUpdater<LocationState>
  mask?: {
    to?: string | number | null
    params?: true | Updater<unknown>
    search?: true | Updater<unknown>
    hash?: true | Updater<string>
    state?: true | NonNullableUpdater<LocationState>
    unmaskOnReload?: boolean
  }
  from?: string
}

export interface DehydratedRouterState {
  dehydratedMatches: DehydratedRouteMatch[]
}

export type DehydratedRouteMatch = Pick<
  RouteMatch,
  'fetchedAt' | 'invalid' | 'id' | 'status' | 'updatedAt'
>

export interface DehydratedRouter {
  state: DehydratedRouterState
}

export type RouterConstructorOptions<
  TRouteTree extends AnyRoute,
  TDehydrated extends Record<string, any>,
> = Omit<RouterOptions<TRouteTree, TDehydrated>, 'context'> &
  RouterContextOptions<TRouteTree>

export const componentTypes = [
  'component',
  'errorComponent',
  'pendingComponent',
] as const

export type RouterEvents = {
  onBeforeLoad: {
    type: 'onBeforeLoad'
    fromLocation: ParsedLocation
    toLocation: ParsedLocation
    pathChanged: boolean
  }
  onLoad: {
    type: 'onLoad'
    fromLocation: ParsedLocation
    toLocation: ParsedLocation
    pathChanged: boolean
  }
  onResolved: {
    type: 'onResolved'
    fromLocation: ParsedLocation
    toLocation: ParsedLocation
    pathChanged: boolean
  }
}

export type RouterEvent = RouterEvents[keyof RouterEvents]

export type RouterListener<TRouterEvent extends RouterEvent> = {
  eventType: TRouterEvent['type']
  fn: ListenerFn<TRouterEvent>
}

type LinkCurrentTargetElement = {
  preloadTimeout?: null | ReturnType<typeof setTimeout>
}

const preloadWarning = 'Error preloading route! ☝️'

export class Router<
  TRouteTree extends AnyRoute = AnyRoute,
  TDehydrated extends Record<string, any> = Record<string, any>,
> {
  // Option-independent properties
  tempLocationKey: string | undefined = `${Math.round(
    Math.random() * 10000000,
  )}`
  resetNextScroll: boolean = true
  navigateTimeout: NodeJS.Timeout | null = null
  latestLoadPromise: Promise<void> = Promise.resolve()
  subscribers = new Set<RouterListener<RouterEvent>>()
  pendingMatches: AnyRouteMatch[] = []
  injectedHtml: InjectedHtmlEntry[] = []
  dehydratedData?: TDehydrated

  // Must build in constructor
  __store!: Store<RouterState<TRouteTree>>
  options!: PickAsRequired<
    RouterOptions<TRouteTree, TDehydrated>,
    'stringifySearch' | 'parseSearch' | 'context'
  >
  history!: RouterHistory
  latestLocation!: ParsedLocation
  basepath!: string
  routeTree!: TRouteTree
  routesById!: RoutesById<TRouteTree>
  routesByPath!: RoutesByPath<TRouteTree>
  flatRoutes!: AnyRoute[]

  constructor(options: RouterConstructorOptions<TRouteTree, TDehydrated>) {
    this.update({
      defaultPreloadDelay: 50,
      defaultPendingMs: 1000,
      defaultPendingMinMs: 500,
      context: undefined!,
      ...options,
      stringifySearch: options?.stringifySearch ?? defaultStringifySearch,
      parseSearch: options?.parseSearch ?? defaultParseSearch,
    })
  }

  // These are default implementations that can optionally be overridden
  // by the router provider once rendered. We provide these so that the
  // router can be used in a non-react environment if necessary
  startReactTransition: (fn: () => void) => void = (fn) => fn()

  update = (newOptions: RouterConstructorOptions<TRouteTree, TDehydrated>) => {
    this.options = {
      ...this.options,
      ...newOptions,
    }

    this.basepath = `/${trimPath(newOptions.basepath ?? '') ?? ''}`

    if (
      !this.history ||
      (this.options.history && this.options.history !== this.history)
    ) {
      this.history =
        this.options.history ??
        (typeof document !== 'undefined'
          ? createBrowserHistory()
          : createMemoryHistory())
      this.latestLocation = this.parseLocation()
    }

    if (this.options.routeTree !== this.routeTree) {
      this.routeTree = this.options.routeTree as TRouteTree
      this.buildRouteTree()
    }

    if (!this.__store) {
      this.__store = new Store(getInitialRouterState(this.latestLocation), {
        onUpdate: () => {
          this.__store.state = {
            ...this.state,
            status:
              this.state.isTransitioning || this.state.isLoading
                ? 'pending'
                : 'idle',
          }
        },
      })
    }
  }

  get state() {
    return this.__store.state
  }

  buildRouteTree = () => {
    this.routesById = {} as RoutesById<TRouteTree>
    this.routesByPath = {} as RoutesByPath<TRouteTree>

    const notFoundRoute = this.options.notFoundRoute
    if (notFoundRoute) {
      notFoundRoute.init({ originalIndex: 99999999999 })
      ;(this.routesById as any)[notFoundRoute.id] = notFoundRoute
    }

    const recurseRoutes = (childRoutes: AnyRoute[]) => {
      childRoutes.forEach((childRoute, i) => {
        childRoute.init({ originalIndex: i })

        const existingRoute = (this.routesById as any)[childRoute.id]

        invariant(
          !existingRoute,
          `Duplicate routes found with id: ${String(childRoute.id)}`,
        )
        ;(this.routesById as any)[childRoute.id] = childRoute

        if (!childRoute.isRoot && childRoute.path) {
          const trimmedFullPath = trimPathRight(childRoute.fullPath)
          if (
            !(this.routesByPath as any)[trimmedFullPath] ||
            childRoute.fullPath.endsWith('/')
          ) {
            ;(this.routesByPath as any)[trimmedFullPath] = childRoute
          }
        }

        const children = childRoute.children as Route[]

        if (children?.length) {
          recurseRoutes(children)
        }
      })
    }

    recurseRoutes([this.routeTree])

    const scoredRoutes: {
      child: AnyRoute
      trimmed: string
      parsed: ReturnType<typeof parsePathname>
      index: number
      score: number[]
    }[] = []

    ;(Object.values(this.routesById) as AnyRoute[]).forEach((d, i) => {
      if (d.isRoot || !d.path) {
        return
      }

      const trimmed = trimPathLeft(d.fullPath)
      const parsed = parsePathname(trimmed)

      while (parsed.length > 1 && parsed[0]?.value === '/') {
        parsed.shift()
      }

      const score = parsed.map((d) => {
        if (d.type === 'param') {
          return 0.5
        }

        if (d.type === 'wildcard') {
          return 0.25
        }

        return 1
      })

      scoredRoutes.push({ child: d, trimmed, parsed, index: i, score })
    })

    this.flatRoutes = scoredRoutes
      .sort((a, b) => {
        let isIndex = a.trimmed === '/' ? 1 : b.trimmed === '/' ? -1 : 0

        if (isIndex !== 0) return isIndex

        const length = Math.min(a.score.length, b.score.length)

        // Sort by length of score
        if (a.score.length !== b.score.length) {
          return b.score.length - a.score.length
        }

        // Sort by min available score
        for (let i = 0; i < length; i++) {
          if (a.score[i] !== b.score[i]) {
            return b.score[i]! - a.score[i]!
          }
        }

        // Sort by min available parsed value
        for (let i = 0; i < length; i++) {
          if (a.parsed[i]!.value !== b.parsed[i]!.value) {
            return a.parsed[i]!.value! > b.parsed[i]!.value! ? 1 : -1
          }
        }

        // Sort by length of trimmed full path
        if (a.trimmed !== b.trimmed) {
          return a.trimmed > b.trimmed ? 1 : -1
        }

        // Sort by original index
        return a.index - b.index
      })
      .map((d, i) => {
        d.child.rank = i
        return d.child
      })
  }

  subscribe = <TType extends keyof RouterEvents>(
    eventType: TType,
    fn: ListenerFn<RouterEvents[TType]>,
  ) => {
    const listener: RouterListener<any> = {
      eventType,
      fn,
    }

    this.subscribers.add(listener)

    return () => {
      this.subscribers.delete(listener)
    }
  }

  emit = (routerEvent: RouterEvent) => {
    this.subscribers.forEach((listener) => {
      if (listener.eventType === routerEvent.type) {
        listener.fn(routerEvent)
      }
    })
  }

  checkLatest = (promise: Promise<void>): undefined | Promise<void> => {
    return this.latestLoadPromise !== promise
      ? this.latestLoadPromise
      : undefined
  }

  parseLocation = (
    previousLocation?: ParsedLocation,
  ): ParsedLocation<FullSearchSchema<TRouteTree>> => {
    const parse = ({
      pathname,
      search,
      hash,
      state,
    }: HistoryLocation): ParsedLocation<FullSearchSchema<TRouteTree>> => {
      const parsedSearch = this.options.parseSearch(search)

      return {
        pathname: pathname,
        searchStr: search,
        search: replaceEqualDeep(previousLocation?.search, parsedSearch) as any,
        hash: hash.split('#').reverse()[0] ?? '',
        href: `${pathname}${search}${hash}`,
        state: replaceEqualDeep(previousLocation?.state, state) as HistoryState,
      }
    }

    const location = parse(this.history.location)

    let { __tempLocation, __tempKey } = location.state

    if (__tempLocation && (!__tempKey || __tempKey === this.tempLocationKey)) {
      // Sync up the location keys
      const parsedTempLocation = parse(__tempLocation) as any
      parsedTempLocation.state.key = location.state.key

      delete parsedTempLocation.state.__tempLocation

      return {
        ...parsedTempLocation,
        maskedLocation: location,
      }
    }

    return location
  }

  resolvePathWithBase = (from: string, path: string) => {
    return resolvePath(this.basepath!, from, cleanPath(path))
  }

  get looseRoutesById() {
    return this.routesById as Record<string, AnyRoute>
  }

  matchRoutes = <TRouteTree extends AnyRoute>(
    pathname: string,
    locationSearch: AnySearchSchema,
    opts?: { throwOnError?: boolean; debug?: boolean },
  ): RouteMatch<TRouteTree>[] => {
    let routeParams: Record<string, string> = {}

    let foundRoute = this.flatRoutes.find((route) => {
      const matchedParams = matchPathname(
        this.basepath,
        trimPathRight(pathname),
        {
          to: route.fullPath,
          caseSensitive:
            route.options.caseSensitive ?? this.options.caseSensitive,
          fuzzy: true,
        },
      )

      if (matchedParams) {
        routeParams = matchedParams
        return true
      }

      return false
    })

    let routeCursor: AnyRoute =
      foundRoute || (this.routesById as any)['__root__']

    let matchedRoutes: AnyRoute[] = [routeCursor]

    // Check to see if the route needs a 404 entry
    if (
      // If we found a route, and it's not an index route and we have left over path
      (foundRoute
        ? foundRoute.path !== '/' && routeParams['**']
        : // Or if we didn't find a route and we have left over path
          trimPathRight(pathname)) &&
      // And we have a 404 route configured
      this.options.notFoundRoute
    ) {
      matchedRoutes.push(this.options.notFoundRoute)
    }

    while (routeCursor?.parentRoute) {
      routeCursor = routeCursor.parentRoute
      if (routeCursor) matchedRoutes.unshift(routeCursor)
    }

    // Existing matches are matches that are already loaded along with
    // pending matches that are still loading

    const parseErrors = matchedRoutes.map((route) => {
      let parsedParamsError

      if (route.options.parseParams) {
        try {
          const parsedParams = route.options.parseParams(routeParams)
          // Add the parsed params to the accumulated params bag
          Object.assign(routeParams, parsedParams)
        } catch (err: any) {
          parsedParamsError = new PathParamError(err.message, {
            cause: err,
          })

          if (opts?.throwOnError) {
            throw parsedParamsError
          }

          return parsedParamsError
        }
      }

      return
    })

    const matches: AnyRouteMatch[] = []

    matchedRoutes.forEach((route, index) => {
      // Take each matched route and resolve + validate its search params
      // This has to happen serially because each route's search params
      // can depend on the parent route's search params
      // It must also happen before we create the match so that we can
      // pass the search params to the route's potential key function
      // which is used to uniquely identify the route match in state

      const parentMatch = matches[index - 1]

      const [preMatchSearch, searchError]: [Record<string, any>, any] = (() => {
        // Validate the search params and stabilize them
        const parentSearch = parentMatch?.search ?? locationSearch

        try {
          const validator =
            typeof route.options.validateSearch === 'object'
              ? route.options.validateSearch.parse
              : route.options.validateSearch

          let search = validator?.(parentSearch) ?? {}

          return [
            {
              ...parentSearch,
              ...search,
            },
            undefined,
          ]
        } catch (err: any) {
          const searchError = new SearchParamError(err.message, {
            cause: err,
          })

          if (opts?.throwOnError) {
            throw searchError
          }

          return [parentSearch, searchError]
        }
      })()

      const interpolatedPath = interpolatePath(route.fullPath, routeParams)
      const matchId =
        interpolatePath(route.id, routeParams, true) +
        (route.options.key?.({
          search: preMatchSearch,
          location: this.state.location,
        }) ?? '')

      // Waste not, want not. If we already have a match for this route,
      // reuse it. This is important for layout routes, which might stick
      // around between navigation actions that only change leaf routes.
      const existingMatch = getRouteMatch(this.state, matchId)

      const cause = this.state.matches.find((d) => d.id === matchId)
        ? 'stay'
        : 'enter'

      // Create a fresh route match
      const hasLoaders = !!(
        route.options.loader ||
        componentTypes.some((d) => (route.options[d] as any)?.preload)
      )

      const match: AnyRouteMatch = existingMatch
        ? { ...existingMatch, cause }
        : {
            id: matchId,
            routeId: route.id,
            params: routeParams,
            pathname: joinPaths([this.basepath, interpolatedPath]),
            updatedAt: Date.now(),
            search: {} as any,
            searchError: undefined,
            status: hasLoaders ? 'pending' : 'success',
            showPending: false,
            isFetching: false,
            invalid: false,
            error: undefined,
            paramsError: parseErrors[index],
            loadPromise: Promise.resolve(),
            context: undefined!,
            abortController: new AbortController(),
            shouldReloadDeps: undefined,
            fetchedAt: 0,
            cause,
          }

      // Regardless of whether we're reusing an existing match or creating
      // a new one, we need to update the match's search params
      match.search = replaceEqualDeep(match.search, preMatchSearch)
      // And also update the searchError if there is one
      match.searchError = searchError

      matches.push(match)
    })

    return matches as any
  }

  cancelMatch = (id: string) => {
    getRouteMatch(this.state, id)?.abortController?.abort()
  }

  cancelMatches = () => {
    this.state.pendingMatches?.forEach((match) => {
      this.cancelMatch(match.id)
    })
  }

  buildLocation: BuildLocationFn<TRouteTree> = (opts) => {
    const build = (
      dest: BuildNextOptions & {
        unmaskOnReload?: boolean
      } = {},
      matches?: AnyRouteMatch[],
    ): ParsedLocation => {
      const from = this.latestLocation
      const fromSearch =
        (this.state.pendingMatches || this.state.matches).at(-1)?.search ||
        from.search
      const fromPathname = dest.from ?? from.pathname

      let pathname = this.resolvePathWithBase(fromPathname, `${dest.to ?? ''}`)

      const fromMatches = this.matchRoutes(fromPathname, fromSearch)
      const stayingMatches = matches?.filter(
        (d) => fromMatches?.find((e) => e.routeId === d.routeId),
      )

      const prevParams = { ...last(fromMatches)?.params }

      let nextParams =
        (dest.params ?? true) === true
          ? prevParams
          : functionalUpdate(dest.params!, prevParams)

      if (nextParams) {
        matches
          ?.map((d) => this.looseRoutesById[d.routeId]!.options.stringifyParams)
          .filter(Boolean)
          .forEach((fn) => {
            nextParams = { ...nextParams!, ...fn!(nextParams!) }
          })
      }

      pathname = interpolatePath(pathname, nextParams ?? {})

      const preSearchFilters =
        stayingMatches
          ?.map(
            (match) =>
              this.looseRoutesById[match.routeId]!.options.preSearchFilters ??
              [],
          )
          .flat()
          .filter(Boolean) ?? []

      const postSearchFilters =
        stayingMatches
          ?.map(
            (match) =>
              this.looseRoutesById[match.routeId]!.options.postSearchFilters ??
              [],
          )
          .flat()
          .filter(Boolean) ?? []

      // Pre filters first
      const preFilteredSearch = preSearchFilters?.length
        ? preSearchFilters?.reduce(
            (prev, next) => next(prev) as any,
            fromSearch,
          )
        : fromSearch

      // Then the link/navigate function
      const destSearch =
        dest.search === true
          ? preFilteredSearch // Preserve resolvedFrom true
          : dest.search
            ? functionalUpdate(dest.search, preFilteredSearch) ?? {} // Updater
            : preSearchFilters?.length
              ? preFilteredSearch // Preserve resolvedFrom filters
              : {}

      // Then post filters
      const postFilteredSearch = postSearchFilters?.length
        ? postSearchFilters.reduce((prev, next) => next(prev), destSearch)
        : destSearch

      const search = replaceEqualDeep(fromSearch, postFilteredSearch)

      const searchStr = this.options.stringifySearch(search)

      const hash =
        dest.hash === true
          ? from.hash
          : dest.hash
            ? functionalUpdate(dest.hash!, from.hash)
            : from.hash

      const hashStr = hash ? `#${hash}` : ''

      let nextState =
        dest.state === true
          ? from.state
          : dest.state
            ? functionalUpdate(dest.state, from.state)
            : from.state

      nextState = replaceEqualDeep(from.state, nextState)

      return {
        pathname,
        search,
        searchStr,
        state: nextState as any,
        hash,
        href: `${pathname}${searchStr}${hashStr}`,
        unmaskOnReload: dest.unmaskOnReload,
      }
    }

    const buildWithMatches = (
      dest: BuildNextOptions = {},
      maskedDest?: BuildNextOptions,
    ) => {
      let next = build(dest)
      let maskedNext = maskedDest ? build(maskedDest) : undefined

      if (!maskedNext) {
        let params = {}

        let foundMask = this.options.routeMasks?.find((d) => {
          const match = matchPathname(this.basepath, next.pathname, {
            to: d.from,
            caseSensitive: false,
            fuzzy: false,
          })

          if (match) {
            params = match
            return true
          }

          return false
        })

        if (foundMask) {
          foundMask = {
            ...foundMask,
            from: interpolatePath(foundMask.from, params) as any,
          }
          maskedDest = foundMask
          maskedNext = build(maskedDest)
        }
      }

      const nextMatches = this.matchRoutes(next.pathname, next.search)
      const maskedMatches = maskedNext
        ? this.matchRoutes(maskedNext.pathname, maskedNext.search)
        : undefined
      const maskedFinal = maskedNext
        ? build(maskedDest, maskedMatches)
        : undefined

      const final = build(dest, nextMatches)

      if (maskedFinal) {
        final.maskedLocation = maskedFinal
      }

      return final
    }

    if (opts.mask) {
      return buildWithMatches(opts, {
        ...pick(opts, ['from']),
        ...opts.mask,
      })
    }

    return buildWithMatches(opts)
  }

  commitLocation = async ({
    startTransition,
    ...next
  }: ParsedLocation & CommitLocationOptions) => {
    if (this.navigateTimeout) clearTimeout(this.navigateTimeout)

    const isSameUrl = this.latestLocation.href === next.href

    // If the next urls are the same and we're not replacing,
    // do nothing
    if (!isSameUrl || !next.replace) {
      let { maskedLocation, ...nextHistory } = next

      if (maskedLocation) {
        nextHistory = {
          ...maskedLocation,
          state: {
            ...maskedLocation.state,
            __tempKey: undefined,
            __tempLocation: {
              ...nextHistory,
              search: nextHistory.searchStr,
              state: {
                ...nextHistory.state,
                __tempKey: undefined!,
                __tempLocation: undefined!,
                key: undefined!,
              },
            },
          },
        }

        if (
          nextHistory.unmaskOnReload ??
          this.options.unmaskOnReload ??
          false
        ) {
          nextHistory.state.__tempKey = this.tempLocationKey
        }
      }

      const apply = () => {
        this.history[next.replace ? 'replace' : 'push'](
          nextHistory.href,
          nextHistory.state,
        )
      }

      if (startTransition ?? true) {
        this.startReactTransition(apply)
      } else {
        apply()
      }
    }

    this.resetNextScroll = next.resetScroll ?? true

    return this.latestLoadPromise
  }

  buildAndCommitLocation = ({
    replace,
    resetScroll,
    startTransition,
    ...rest
  }: BuildNextOptions & CommitLocationOptions = {}) => {
    const location = this.buildLocation(rest)
    return this.commitLocation({
      ...location,
      startTransition,
      replace,
      resetScroll,
    })
  }

  navigate: NavigateFn<TRouteTree> = ({ from, to = '', ...rest }) => {
    // If this link simply reloads the current route,
    // make sure it has a new key so it will trigger a data refresh

    // If this `to` is a valid external URL, return
    // null for LinkUtils
    const toString = String(to)
    const fromString = typeof from === 'undefined' ? from : String(from)
    let isExternal

    try {
      new URL(`${toString}`)
      isExternal = true
    } catch (e) {}

    invariant(
      !isExternal,
      'Attempting to navigate to external url with this.navigate!',
    )

    return this.buildAndCommitLocation({
      ...rest,
      from: fromString,
      to: toString,
    })
  }

  loadMatches = async ({
    checkLatest,
    matches,
    preload,
    invalidate,
  }: {
    checkLatest: () => Promise<void> | undefined
    matches: AnyRouteMatch[]
    preload?: boolean
    invalidate?: boolean
  }): Promise<RouteMatch[]> => {
    let latestPromise
    let firstBadMatchIndex: number | undefined

    const updatePendingMatch = (match: AnyRouteMatch) => {
      this.__store.setState((s) => ({
        ...s,
        pendingMatches: s.pendingMatches?.map((d) =>
          d.id === match.id ? match : d,
        ),
      }))
    }

    

    // Check each match middleware to see if the route can be accessed
    try {
      for (let [index, match] of matches.entries()) {
        const parentMatch = matches[index - 1]
        const route = this.looseRoutesById[match.routeId]!
        const abortController = new AbortController()

        const handleErrorAndRedirect = (err: any, code: string) => {
          err.routerCode = code
          firstBadMatchIndex = firstBadMatchIndex ?? index

          if (isRedirect(err)) {
            throw err
          }

          try {
            route.options.onError?.(err)
          } catch (errorHandlerErr) {
            err = errorHandlerErr

            if (isRedirect(errorHandlerErr)) {
              throw errorHandlerErr
            }
          }

          matches[index] = match = {
            ...match,
            error: err,
            status: 'error',
            updatedAt: Date.now(),
            abortController: new AbortController(),
          }
        }

        try {
          if (match.paramsError) {
            handleErrorAndRedirect(match.paramsError, 'PARSE_PARAMS')
          }

          if (match.searchError) {
            handleErrorAndRedirect(match.searchError, 'VALIDATE_SEARCH')
          }

          const parentContext =
            parentMatch?.context ?? this.options.context ?? {}

          const beforeLoadContext =
            (await route.options.beforeLoad?.({
              search: match.search,
              abortController,
              params: match.params,
              preload: !!preload,
              context: parentContext,
              location: this.state.location,
              // TOOD: just expose state and router, etc
              navigate: (opts) =>
                this.navigate({ ...opts, from: match.pathname } as any),
              buildLocation: this.buildLocation,
              cause: match.cause,
            })) ?? ({} as any)

          if (isRedirect(beforeLoadContext)) {
            throw beforeLoadContext
          }

          const context = {
            ...parentContext,
            ...beforeLoadContext,
          }

          matches[index] = match = {
            ...match,
            context: replaceEqualDeep(match.context, context),
            abortController,
          }
        } catch (err) {
          handleErrorAndRedirect(err, 'BEFORE_LOAD')
          break
        }
      }
    } catch (err) {
      if (isRedirect(err)) {
        if (!preload) this.navigate(err as any)
        return matches
      }

      throw err
    }

    const validResolvedMatches = matches.slice(0, firstBadMatchIndex)
    const matchPromises: Promise<any>[] = []

    validResolvedMatches.forEach((match, index) => {
      matchPromises.push(
        (async () => {
          const parentMatchPromise = matchPromises[index - 1]
          const route = this.looseRoutesById[match.routeId]!

          const handleErrorAndRedirect = (err: any) => {
            if (isRedirect(err)) {
              if (!preload) {
                this.navigate(err as any)
              }
              return true
            }
            return false
          }

          let loadPromise: Promise<void> | undefined

          matches[index] = match = {
            ...match,
            fetchedAt: Date.now(),
            invalid: false,
            showPending: false,
          }

          const pendingMs =
            route.options.pendingMs ?? this.options.defaultPendingMs

          let pendingPromise: Promise<void> | undefined

          if (
            !preload &&
            pendingMs &&
            (route.options.pendingComponent ??
              this.options.defaultPendingComponent)
          ) {
            pendingPromise = new Promise((r) => setTimeout(r, pendingMs))
          }

          if (match.isFetching) {
            loadPromise = getRouteMatch(this.state, match.id)?.loadPromise
          } else {
            const loaderContext: LoaderFnContext = {
              params: match.params,
              search: match.search,
              preload: !!preload,
              parentMatchPromise,
              abortController: match.abortController,
              context: match.context,
              location: this.state.location,
              navigate: (opts) =>
                this.navigate({ ...opts, from: match.pathname } as any),
              cause: match.cause,
            }

            // Default to reloading the route all the time
            let shouldReload = true

            let shouldReloadDeps =
              typeof route.options.shouldReload === 'function'
                ? route.options.shouldReload?.(loaderContext)
                : !!(route.options.shouldReload ?? true)

            if (match.cause === 'enter' || invalidate) {
              match.shouldReloadDeps = shouldReloadDeps
            } else if (match.cause === 'stay') {
              if (typeof shouldReloadDeps === 'object') {
                // compare the deps to see if they've changed
                shouldReload = !deepEqual(
                  shouldReloadDeps,
                  match.shouldReloadDeps,
                )

                match.shouldReloadDeps = shouldReloadDeps
              } else {
                shouldReload = !!shouldReloadDeps
              }
            }

            // If the user doesn't want the route to reload, just
            // resolve with the existing loader data

            if (!shouldReload) {
              loadPromise = Promise.resolve(match.loaderData)
            } else {
              // Otherwise, load the route
              matches[index] = match = {
                ...match,
                isFetching: true,
              }

              const componentsPromise = Promise.all(
                componentTypes.map(async (type) => {
                  const component = route.options[type]

                  if ((component as any)?.preload) {
                    await (component as any).preload()
                  }
                }),
              )

              const loaderPromise = route.options.loader?.(loaderContext)

              loadPromise = Promise.all([
                componentsPromise,
                loaderPromise,
              ]).then((d) => d[1])
            }
          }

          matches[index] = match = {
            ...match,
            loadPromise,
          }

          if (!preload) {
            updatePendingMatch(match)
          }

          let didShowPending = false
          const pendingMinMs =
            route.options.pendingMinMs ?? this.options.defaultPendingMinMs

          await new Promise<void>(async (resolve) => {
            // If the route has a pending component and a pendingMs option,
            // forcefully show the pending component
            if (pendingPromise) {
              pendingPromise.then(() => {
                if ((latestPromise = checkLatest())) return

                didShowPending = true
                matches[index] = match = {
                  ...match,
                  showPending: true,
                }

                updatePendingMatch(match)
                resolve()
              })
            }

            try {
              const loaderData = await loadPromise
              if ((latestPromise = checkLatest())) return await latestPromise

              if (isRedirect(loaderData)) {
                if (handleErrorAndRedirect(loaderData)) return
              }

              if (didShowPending && pendingMinMs) {
                await new Promise((r) => setTimeout(r, pendingMinMs))
              }

              if ((latestPromise = checkLatest())) return await latestPromise

              matches[index] = match = {
                ...match,
                error: undefined,
                status: 'success',
                isFetching: false,
                updatedAt: Date.now(),
                loaderData,
                loadPromise: undefined,
              }
            } catch (error) {
              if ((latestPromise = checkLatest())) return await latestPromise
              if (handleErrorAndRedirect(error)) return

              try {
                route.options.onError?.(error)
              } catch (onErrorError) {
                error = onErrorError
                if (handleErrorAndRedirect(onErrorError)) return
              }

              matches[index] = match = {
                ...match,
                error,
                status: 'error',
                isFetching: false,
                updatedAt: Date.now(),
              }
            } finally {
              // If we showed the pending component, that means
              // we already moved the pendingMatches to the matches
              // state, so we need to update that specific match
              if (didShowPending && pendingMinMs && match.showPending) {
                this.__store.setState((s) => ({
                  ...s,
                  matches: s.matches?.map((d) =>
                    d.id === match.id ? match : d,
                  ),
                }))
              }
            }

            if (!preload) {
              updatePendingMatch(match)
            }

            resolve()
          })
        })(),
      )
    })

    await Promise.all(matchPromises)
    return matches
  }

  invalidate = () =>
    this.load({
      invalidate: true,
    })

  load = async (opts?: { invalidate?: boolean }): Promise<void> => {
    const promise = new Promise<void>(async (resolve, reject) => {
      const next = this.latestLocation
      const prevLocation = this.state.resolvedLocation
      const pathDidChange = prevLocation!.href !== next.href
      let latestPromise: Promise<void> | undefined | null

      // Cancel any pending matches
      this.cancelMatches()

      this.emit({
        type: 'onBeforeLoad',
        fromLocation: prevLocation,
        toLocation: next,
        pathChanged: pathDidChange,
      })

      // Match the routes
      let pendingMatches: RouteMatch<any, any>[] = this.matchRoutes(
        next.pathname,
        next.search,
        {
          debug: true,
        },
      )

      const previousMatches = this.state.matches

      // Ingest the new matches
      this.__store.setState((s) => ({
        ...s,
        isLoading: true,
        location: next,
        pendingMatches,
      }))

      try {
        try {
          // Load the matches
          await this.loadMatches({
            matches: pendingMatches,
            checkLatest: () => this.checkLatest(promise),
            invalidate: opts?.invalidate,
          })
        } catch (err) {
          // swallow this error, since we'll display the
          // errors on the route components
        }

        // Only apply the latest transition
        if ((latestPromise = this.checkLatest(promise))) {
          return latestPromise
        }

        const exitingMatchIds = previousMatches.filter(
          (id) => !this.pendingMatches.includes(id),
        )
        const enteringMatchIds = this.pendingMatches.filter(
          (id) => !previousMatches.includes(id),
        )
        const stayingMatchIds = previousMatches.filter((id) =>
          this.pendingMatches.includes(id),
        )

        this.__store.setState((s) => ({
          ...s,
          isLoading: false,
          matches: pendingMatches,
          pendingMatches: undefined,
        }))

        //
        ;(
          [
            [exitingMatchIds, 'onLeave'],
            [enteringMatchIds, 'onEnter'],
            [stayingMatchIds, 'onTransition'],
          ] as const
        ).forEach(([matches, hook]) => {
          matches.forEach((match) => {
            this.looseRoutesById[match.routeId]!.options[hook]?.(match)
          })
        })

        this.emit({
          type: 'onLoad',
          fromLocation: prevLocation,
          toLocation: next,
          pathChanged: pathDidChange,
        })

        resolve()
      } catch (err) {
        // Only apply the latest transition
        if ((latestPromise = this.checkLatest(promise))) {
          return latestPromise
        }

        reject(err)
      }
    })

    this.latestLoadPromise = promise

    return this.latestLoadPromise
  }

  preloadRoute = async (
    navigateOpts: BuildNextOptions = this.state.location,
  ) => {
    let next = this.buildLocation(navigateOpts)

    let matches = this.matchRoutes(next.pathname, next.search, {
      throwOnError: true,
    })

    matches = await this.loadMatches({
      matches,
      preload: true,
      checkLatest: () => undefined,
    })

    return matches
  }

  buildLink: BuildLinkFn<TRouteTree> = (dest) => {
    // If this link simply reloads the current route,
    // make sure it has a new key so it will trigger a data refresh

    // If this `to` is a valid external URL, return
    // null for LinkUtils

    const {
      to,
      preload: userPreload,
      preloadDelay: userPreloadDelay,
      activeOptions,
      disabled,
      target,
      replace,
      resetScroll,
      startTransition,
    } = dest

    try {
      new URL(`${to}`)
      return {
        type: 'external',
        href: to as any,
      }
    } catch (e) {}

    const nextOpts = dest
    const next = this.buildLocation(nextOpts as any)

    const preload = userPreload ?? this.options.defaultPreload
    const preloadDelay =
      userPreloadDelay ?? this.options.defaultPreloadDelay ?? 0

    // Compare path/hash for matches
    const currentPathSplit = this.latestLocation.pathname.split('/')
    const nextPathSplit = next.pathname.split('/')
    const pathIsFuzzyEqual = nextPathSplit.every(
      (d, i) => d === currentPathSplit[i],
    )
    // Combine the matches based on user this.options
    const pathTest = activeOptions?.exact
      ? this.latestLocation.pathname === next.pathname
      : pathIsFuzzyEqual
    const hashTest = activeOptions?.includeHash
      ? this.latestLocation.hash === next.hash
      : true
    const searchTest =
      activeOptions?.includeSearch ?? true
        ? deepEqual(this.latestLocation.search, next.search, true)
        : true

    // The final "active" test
    const isActive = pathTest && hashTest && searchTest

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

        // All is well? Navigate!
        this.commitLocation({ ...next, replace, resetScroll, startTransition })
      }
    }

    // The click handler
    const handleFocus = (e: MouseEvent) => {
      if (preload) {
        this.preloadRoute(nextOpts as any).catch((err) => {
          console.warn(err)
          console.warn(preloadWarning)
        })
      }
    }

    const handleTouchStart = (e: TouchEvent) => {
      if (preload) {
        this.preloadRoute(nextOpts as any).catch((err) => {
          console.warn(err)
          console.warn(preloadWarning)
        })
      }
    }

    const handleEnter = (e: MouseEvent) => {
      const target = (e.target || {}) as LinkCurrentTargetElement

      if (preload) {
        if (target.preloadTimeout) {
          return
        }

        target.preloadTimeout = setTimeout(() => {
          target.preloadTimeout = null
          this.preloadRoute(nextOpts as any).catch((err) => {
            console.warn(err)
            console.warn(preloadWarning)
          })
        }, preloadDelay)
      }
    }

    const handleLeave = (e: MouseEvent) => {
      const target = (e.target || {}) as LinkCurrentTargetElement

      if (target.preloadTimeout) {
        clearTimeout(target.preloadTimeout)
        target.preloadTimeout = null
      }
    }

    return {
      type: 'internal',
      next,
      handleFocus,
      handleClick,
      handleEnter,
      handleLeave,
      handleTouchStart,
      isActive,
      disabled,
    }
  }

  matchRoute: MatchRouteFn<TRouteTree> = (location, opts) => {
    location = {
      ...location,
      to: location.to
        ? this.resolvePathWithBase((location.from || '') as string, location.to)
        : undefined,
    } as any

    const next = this.buildLocation(location as any)

    if (opts?.pending && this.state.status !== 'pending') {
      return false
    }

    const baseLocation = opts?.pending
      ? this.latestLocation
      : this.state.resolvedLocation

    if (!baseLocation) {
      return false
    }

    const match = matchPathname(this.basepath, baseLocation.pathname, {
      ...opts,
      to: next.pathname,
    }) as any

    if (!match) {
      return false
    }

    if (match && (opts?.includeSearch ?? true)) {
      return deepEqual(baseLocation.search, next.search, true) ? match : false
    }

    return match
  }

  injectHtml = async (html: string | (() => Promise<string> | string)) => {
    this.injectedHtml.push(html)
  }

  dehydrateData = <T>(key: any, getData: T | (() => Promise<T> | T)) => {
    if (typeof document === 'undefined') {
      const strKey = typeof key === 'string' ? key : JSON.stringify(key)

      this.injectHtml(async () => {
        const id = `__TSR_DEHYDRATED__${strKey}`
        const data =
          typeof getData === 'function' ? await (getData as any)() : getData
        return `<script id='${id}' suppressHydrationWarning>window["__TSR_DEHYDRATED__${escapeJSON(
          strKey,
        )}"] = ${JSON.stringify(data)}
          ;(() => {
            var el = document.getElementById('${id}')
            el.parentElement.removeChild(el)
          })()
          </script>`
      })

      return () => this.hydrateData<T>(key)
    }

    return () => undefined
  }

  hydrateData = <T extends any = unknown>(key: any) => {
    if (typeof document !== 'undefined') {
      const strKey = typeof key === 'string' ? key : JSON.stringify(key)

      return window[`__TSR_DEHYDRATED__${strKey}` as any] as T
    }

    return undefined
  }

  dehydrate = (): DehydratedRouter => {
    return {
      state: {
        dehydratedMatches: this.state.matches.map((d) =>
          pick(d, [
            'fetchedAt',
            'invalid',
            'id',
            'status',
            'updatedAt',
            'loaderData',
          ]),
        ),
      },
    }
  }

  hydrate = async (__do_not_use_server_ctx?: HydrationCtx) => {
    let _ctx = __do_not_use_server_ctx
    // Client hydrates from window
    if (typeof document !== 'undefined') {
      _ctx = window.__TSR_DEHYDRATED__
    }

    invariant(
      _ctx,
      'Expected to find a __TSR_DEHYDRATED__ property on window... but we did not. Did you forget to render <DehydrateRouter /> in your app?',
    )

    const ctx = _ctx
    this.dehydratedData = ctx.payload as any
    this.options.hydrate?.(ctx.payload as any)
    const dehydratedState = ctx.router.state

    let matches = this.matchRoutes(
      this.state.location.pathname,
      this.state.location.search,
    ).map((match) => {
      const dehydratedMatch = dehydratedState.dehydratedMatches.find(
        (d) => d.id === match.id,
      )

      invariant(
        dehydratedMatch,
        `Could not find a client-side match for dehydrated match with id: ${match.id}!`,
      )

      if (dehydratedMatch) {
        return {
          ...match,
          ...dehydratedMatch,
        }
      }
      return match
    })

    this.__store.setState((s) => {
      return {
        ...s,
        matches: matches as any,
      }
    })
  }

  // resolveMatchPromise = (matchId: string, key: string, value: any) => {
  //   state.matches
  //     .find((d) => d.id === matchId)
  //     ?.__promisesByKey[key]?.resolve(value)
  // }
}

// A function that takes an import() argument which is a function and returns a new function that will
// proxy arguments from the caller to the imported function, retaining all type
// information along the way
export function lazyFn<
  T extends Record<string, (...args: any[]) => any>,
  TKey extends keyof T = 'default',
>(fn: () => Promise<T>, key?: TKey) {
  return async (...args: Parameters<T[TKey]>): Promise<ReturnType<T[TKey]>> => {
    const imported = await fn()
    return imported[key || 'default'](...args)
  }
}

function isCtrlEvent(e: MouseEvent) {
  return !!(e.metaKey || e.altKey || e.ctrlKey || e.shiftKey)
}
export class SearchParamError extends Error {}

export class PathParamError extends Error {}

export function getInitialRouterState(
  location: ParsedLocation,
): RouterState<any> {
  return {
    isLoading: false,
    isTransitioning: false,
    status: 'idle',
    resolvedLocation: { ...location },
    location,
    matches: [],
    pendingMatches: [],
    lastUpdated: Date.now(),
  }
}
