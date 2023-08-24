import { Store } from '@tanstack/react-store'
import invariant from 'tiny-invariant'

//

import {
  LinkInfo,
  LinkOptions,
  NavigateOptions,
  ToOptions,
  ResolveRelativePath,
} from './link'
import {
  cleanPath,
  interpolatePath,
  joinPaths,
  matchPathname,
  parsePathname,
  resolvePath,
  trimPath,
  trimPathRight,
} from './path'
import {
  Route,
  AnySearchSchema,
  AnyRoute,
  AnyContext,
  AnyPathParams,
  RouteProps,
  RegisteredRouteComponent,
  RegisteredRouteErrorComponent,
} from './route'
import {
  RoutesById,
  RoutesByPath,
  ParseRoute,
  FullSearchSchema,
  RouteById,
  RoutePaths,
} from './routeInfo'
import { defaultParseSearch, defaultStringifySearch } from './searchParams'
import {
  functionalUpdate,
  last,
  NoInfer,
  pick,
  PickAsRequired,
  Timeout,
  Updater,
  replaceEqualDeep,
  partialDeepEqual,
} from './utils'
import {
  createBrowserHistory,
  createMemoryHistory,
  RouterHistory,
} from './history'

//

declare global {
  interface Window {
    __TSR_DEHYDRATED__?: HydrationCtx
  }
}

export interface Register {
  // router: Router
}

export type AnyRouter = Router<any, any>

export type RegisteredRouter = Register extends {
  router: infer TRouter extends AnyRouter
}
  ? TRouter
  : AnyRouter

export interface LocationState {}

export interface ParsedLocation<
  TSearchObj extends AnySearchSchema = {},
  // TState extends LocationState = LocationState,
> {
  href: string
  pathname: string
  search: TSearchObj
  searchStr: string
  state: LocationState
  hash: string
  key?: string
}

export interface FromLocation {
  pathname: string
  search?: unknown
  key?: string
  hash?: string
}

export type SearchSerializer = (searchObj: Record<string, any>) => string
export type SearchParser = (searchStr: string) => Record<string, any>

export type HydrationCtx = {
  router: DehydratedRouter
  payload: Record<string, any>
}

export interface RouteMatch<
  TRouteTree extends AnyRoute = AnyRoute,
  TRoute extends AnyRoute = AnyRoute,
> {
  id: string
  key?: string
  routeId: string
  pathname: string
  params: TRoute['types']['allParams']
  status: 'pending' | 'success' | 'error'
  isFetching: boolean
  invalid: boolean
  error: unknown
  paramsError: unknown
  searchError: unknown
  updatedAt: number
  invalidAt: number
  preloadInvalidAt: number
  loaderData: TRoute['types']['loader']
  loadPromise?: Promise<void>
  __resolveLoadPromise?: () => void
  routeContext: TRoute['types']['routeContext']
  context: TRoute['types']['context']
  routeSearch: TRoute['types']['searchSchema']
  search: FullSearchSchema<TRouteTree> & TRoute['types']['fullSearchSchema']
  fetchedAt: number
  abortController: AbortController
}

export type AnyRouteMatch = RouteMatch<AnyRoute, AnyRoute>

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
  TDehydrated extends Record<string, any>,
> {
  history?: RouterHistory
  stringifySearch?: SearchSerializer
  parseSearch?: SearchParser
  defaultPreload?: false | 'intent'
  defaultPreloadDelay?: number
  defaultComponent?: RegisteredRouteComponent<
    RouteProps<unknown, AnySearchSchema, AnyPathParams, AnyContext, AnyContext>
  >
  defaultErrorComponent?: RegisteredRouteErrorComponent<
    RouteProps<unknown, AnySearchSchema, AnyPathParams, AnyContext, AnyContext>
  >
  defaultPendingComponent?: RegisteredRouteComponent<
    RouteProps<unknown, AnySearchSchema, AnyPathParams, AnyContext, AnyContext>
  >
  defaultMaxAge?: number
  defaultGcMaxAge?: number
  defaultPreloadMaxAge?: number
  caseSensitive?: boolean
  routeTree?: TRouteTree
  basepath?: string
  createRoute?: (opts: { route: AnyRoute; router: AnyRouter }) => void
  context?: TRouteTree['types']['routerContext']
  Wrap?: React.ComponentType<{
    children: React.ReactNode
    dehydratedState?: TDehydrated
  }>
  dehydrate?: () => TDehydrated
  hydrate?: (dehydrated: TDehydrated) => void
}

export interface RouterState<
  TRouteTree extends AnyRoute = AnyRoute,
  // TState extends LocationState = LocationState,
> {
  status: 'idle' | 'pending'
  isFetching: boolean
  matchesById: Record<string, RouteMatch<TRouteTree, ParseRoute<TRouteTree>>>
  matchIds: string[]
  pendingMatchIds: string[]
  matches: RouteMatch<TRouteTree, ParseRoute<TRouteTree>>[]
  pendingMatches: RouteMatch<TRouteTree, ParseRoute<TRouteTree>>[]
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
  state?: LocationState
  key?: string
  from?: string
  fromCurrent?: boolean
  __matches?: AnyRouteMatch[]
}

export interface MatchLocation {
  to?: string | number | null
  fuzzy?: boolean
  caseSensitive?: boolean
  from?: string
  fromCurrent?: boolean
}

export interface MatchRouteOptions {
  pending?: boolean
  caseSensitive?: boolean
  includeSearch?: boolean
  fuzzy?: boolean
}

type LinkCurrentTargetElement = {
  preloadTimeout?: null | ReturnType<typeof setTimeout>
}

export interface DehydratedRouterState
  extends Pick<RouterState, 'status' | 'location' | 'lastUpdated'> {}

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
    from: ParsedLocation
    to: ParsedLocation
    pathChanged: boolean
  }
  onLoad: {
    type: 'onLoad'
    from: ParsedLocation
    to: ParsedLocation
    pathChanged: boolean
  }
}

export type RouterEvent = RouterEvents[keyof RouterEvents]

export type RouterListener<TRouterEvent extends RouterEvent> = {
  eventType: TRouterEvent['type']
  fn: ListenerFn<TRouterEvent>
}

export class Router<
  TRouteTree extends AnyRoute = AnyRoute,
  TDehydrated extends Record<string, any> = Record<string, any>,
> {
  types!: {
    RootRoute: TRouteTree
  }

  options: PickAsRequired<
    RouterOptions<TRouteTree, TDehydrated>,
    'stringifySearch' | 'parseSearch' | 'context'
  >
  history!: RouterHistory
  #unsubHistory?: () => void
  basepath!: string
  routeTree!: TRouteTree
  routesById!: RoutesById<TRouteTree>
  routesByPath!: RoutesByPath<TRouteTree>
  flatRoutes!: ParseRoute<TRouteTree>[]
  navigateTimeout: undefined | Timeout
  nextAction: undefined | 'push' | 'replace'
  navigationPromise: undefined | Promise<void>

  __store: Store<RouterState<TRouteTree>>
  state: RouterState<TRouteTree>
  dehydratedData?: TDehydrated

  constructor(options: RouterConstructorOptions<TRouteTree, TDehydrated>) {
    this.options = {
      defaultPreloadDelay: 50,
      context: undefined!,
      ...options,
      stringifySearch: options?.stringifySearch ?? defaultStringifySearch,
      parseSearch: options?.parseSearch ?? defaultParseSearch,
      // fetchServerDataFn: options?.fetchServerDataFn ?? defaultFetchServerDataFn,
    }

    this.__store = new Store<RouterState<TRouteTree>>(getInitialRouterState(), {
      onUpdate: () => {
        const prev = this.state

        const next = this.__store.state

        const matchesByIdChanged = prev.matchesById !== next.matchesById
        let matchesChanged
        let pendingMatchesChanged

        if (!matchesByIdChanged) {
          matchesChanged =
            prev.matchIds.length !== next.matchIds.length ||
            prev.matchIds.some((d, i) => d !== next.matchIds[i])

          pendingMatchesChanged =
            prev.pendingMatchIds.length !== next.pendingMatchIds.length ||
            prev.pendingMatchIds.some((d, i) => d !== next.pendingMatchIds[i])
        }

        if (matchesByIdChanged || matchesChanged) {
          next.matches = next.matchIds.map((id) => {
            return next.matchesById[id] as any
          })
        }

        if (matchesByIdChanged || pendingMatchesChanged) {
          next.pendingMatches = next.pendingMatchIds.map((id) => {
            return next.matchesById[id] as any
          })
        }

        next.isFetching = [...next.matches, ...next.pendingMatches].some(
          (d) => d.isFetching,
        )

        this.state = next
      },
      defaultPriority: 'low',
    })

    this.state = this.__store.state

    this.update(options)

    const next = this.buildNext({
      hash: true,
      fromCurrent: true,
      search: true,
      state: true,
    })

    if (this.state.location.href !== next.href) {
      this.#commitLocation({ ...next, replace: true })
    }
  }

  subscribers = new Set<RouterListener<RouterEvent>>()

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

  #emit = (routerEvent: RouterEvent) => {
    this.subscribers.forEach((listener) => {
      if (listener.eventType === routerEvent.type) {
        listener.fn(routerEvent)
      }
    })
  }

  reset = () => {
    this.__store.setState((s) => Object.assign(s, getInitialRouterState()))
  }

  mount = () => {
    // If the router matches are empty, start loading the matches
    // if (!this.state.matches.length) {
    this.safeLoad()
    // }
  }

  update = (opts?: RouterOptions<any, any>): this => {
    this.options = {
      ...this.options,
      ...opts,
      context: {
        ...this.options.context,
        ...opts?.context,
      },
    }

    if (
      !this.history ||
      (this.options.history && this.options.history !== this.history)
    ) {
      if (this.#unsubHistory) {
        this.#unsubHistory()
      }

      this.history =
        this.options.history ??
        (isServer ? createMemoryHistory() : createBrowserHistory()!)

      const parsedLocation = this.#parseLocation()

      this.__store.setState((s) => ({
        ...s,
        resolvedLocation: parsedLocation as any,
        location: parsedLocation as any,
      }))

      this.#unsubHistory = this.history.subscribe(() => {
        this.safeLoad({
          next: this.#parseLocation(this.state.location),
        })
      })
    }

    const { basepath, routeTree } = this.options

    this.basepath = `/${trimPath(basepath ?? '') ?? ''}`

    if (routeTree && routeTree !== this.routeTree) {
      this.#buildRouteTree(routeTree)
    }

    return this
  }

  buildNext = (opts: BuildNextOptions): ParsedLocation => {
    const next = this.#buildLocation(opts)

    const __matches = this.matchRoutes(next.pathname, next.search)

    return this.#buildLocation({
      ...opts,
      __matches,
    })
  }

  cancelMatches = () => {
    this.state.matches.forEach((match) => {
      this.cancelMatch(match.id)
    })
  }

  cancelMatch = (id: string) => {
    this.getRouteMatch(id)?.abortController?.abort()
  }

  safeLoad = async (opts?: { next?: ParsedLocation }) => {
    try {
      return this.load(opts)
    } catch (err) {
      // Don't do anything
    }
  }

  latestLoadPromise: Promise<void> = Promise.resolve()

  load = async (opts?: { next?: ParsedLocation; throwOnError?: boolean }) => {
    const promise = new Promise<void>(async (resolve, reject) => {
      const prevLocation = this.state.resolvedLocation
      const pathDidChange = !!(
        opts?.next && prevLocation!.href !== opts.next.href
      )

      let latestPromise: Promise<void> | undefined | null

      const checkLatest = (): undefined | Promise<void> | null => {
        return this.latestLoadPromise !== promise
          ? this.latestLoadPromise
          : undefined
      }

      // Cancel any pending matches
      // this.cancelMatches()

      let pendingMatches!: RouteMatch<any, any>[]

      this.#emit({
        type: 'onBeforeLoad',
        from: prevLocation,
        to: opts?.next ?? this.state.location,
        pathChanged: pathDidChange,
      })

      this.__store.batch(() => {
        if (opts?.next) {
          // Ingest the new location
          this.__store.setState((s) => ({
            ...s,
            location: opts.next! as any,
          }))
        }

        // Match the routes
        pendingMatches = this.matchRoutes(
          this.state.location.pathname,
          this.state.location.search,
          {
            throwOnError: opts?.throwOnError,
            debug: true,
          },
        )

        this.__store.setState((s) => ({
          ...s,
          status: 'pending',
          pendingMatchIds: pendingMatches.map((d) => d.id),
          matchesById: this.#mergeMatches(s.matchesById, pendingMatches),
        }))
      })

      try {
        // Load the matches
        try {
          await this.loadMatches(pendingMatches)
        } catch (err) {
          // swallow this error, since we'll display the
          // errors on the route components
        }

        // Only apply the latest transition
        if ((latestPromise = checkLatest())) {
          return latestPromise
        }

        this.__store.setState((s) => ({
          ...s,
          status: 'idle',
          resolvedLocation: s.location,
          matchIds: s.pendingMatchIds,
          pendingMatchIds: [],
        }))

        this.#emit({
          type: 'onLoad',
          from: prevLocation,
          to: this.state.location,
          pathChanged: pathDidChange,
        })

        resolve()
      } catch (err) {
        // Only apply the latest transition
        if ((latestPromise = checkLatest())) {
          return latestPromise
        }

        reject(err)
      }
    })

    this.latestLoadPromise = promise

    return this.latestLoadPromise
  }

  #mergeMatches = (
    prevMatchesById: Record<
      string,
      RouteMatch<TRouteTree, ParseRoute<TRouteTree>>
    >,
    nextMatches: AnyRouteMatch[],
  ): Record<string, RouteMatch<TRouteTree, ParseRoute<TRouteTree>>> => {
    const nextMatchesById: any = {
      ...prevMatchesById,
    }

    let hadNew = false

    nextMatches.forEach((match) => {
      if (!nextMatchesById[match.id]) {
        hadNew = true
        nextMatchesById[match.id] = match
      }
    })

    if (!hadNew) {
      return prevMatchesById
    }

    return nextMatchesById
  }

  getRoute = (id: string): Route => {
    const route = (this.routesById as any)[id]

    invariant(route, `Route with id "${id as string}" not found`)

    return route as any
  }

  preloadRoute = async (
    navigateOpts: BuildNextOptions & {
      maxAge?: number
    } = this.state.location,
  ) => {
    const next = this.buildNext(navigateOpts)
    const matches = this.matchRoutes(next.pathname, next.search, {
      throwOnError: true,
    })

    this.__store.setState((s) => {
      return {
        ...s,
        matchesById: this.#mergeMatches(s.matchesById, matches),
      }
    })

    await this.loadMatches(matches, {
      preload: true,
      maxAge: navigateOpts.maxAge,
    })

    return matches
  }

  cleanMatches = () => {
    const now = Date.now()

    const outdatedMatchIds = Object.values(this.state.matchesById)
      .filter((match) => {
        const route = this.getRoute(match.routeId)
        return (
          !this.state.matchIds.includes(match.id) &&
          !this.state.pendingMatchIds.includes(match.id) &&
          match.preloadInvalidAt < now &&
          (route.options.gcMaxAge
            ? match.updatedAt + route.options.gcMaxAge < now
            : true)
        )
      })
      .map((d) => d.id)

    if (outdatedMatchIds.length) {
      this.__store.setState((s) => {
        const matchesById = { ...s.matchesById }
        outdatedMatchIds.forEach((id) => {
          delete matchesById[id]
        })
        return {
          ...s,
          matchesById,
        }
      })
    }
  }

  matchRoutes = (
    pathname: string,
    locationSearch: AnySearchSchema,
    opts?: { throwOnError?: boolean; debug?: boolean },
  ): RouteMatch<TRouteTree, ParseRoute<TRouteTree>>[] => {
    let routeParams: AnyPathParams = {}

    let foundRoute = this.flatRoutes.find((route) => {
      const matchedParams = matchPathname(
        this.basepath,
        trimPathRight(pathname),
        {
          to: route.fullPath,
          caseSensitive:
            route.options.caseSensitive ?? this.options.caseSensitive,
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
    // let includingLayouts = true
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

    const matches = matchedRoutes.map((route, index) => {
      const interpolatedPath = interpolatePath(route.path, routeParams)
      const key = route.options.key
        ? route.options.key({
            params: routeParams,
            search: locationSearch,
          }) ?? ''
        : ''

      const stringifiedKey = key ? JSON.stringify(key) : ''

      const matchId =
        interpolatePath(route.id, routeParams, true) + stringifiedKey

      // Waste not, want not. If we already have a match for this route,
      // reuse it. This is important for layout routes, which might stick
      // around between navigation actions that only change leaf routes.
      const existingMatch = this.getRouteMatch(matchId)

      if (existingMatch) {
        return { ...existingMatch }
      }

      // Create a fresh route match
      const hasLoaders = !!(
        route.options.loader ||
        componentTypes.some((d) => (route.options[d] as any)?.preload)
      )

      const routeMatch: AnyRouteMatch = {
        id: matchId,
        key: stringifiedKey,
        routeId: route.id,
        params: routeParams,
        pathname: joinPaths([this.basepath, interpolatedPath]),
        updatedAt: Date.now(),
        invalidAt: Infinity,
        preloadInvalidAt: Infinity,
        routeSearch: {},
        search: {} as any,
        status: hasLoaders ? 'pending' : 'success',
        isFetching: false,
        invalid: false,
        error: undefined,
        paramsError: parseErrors[index],
        searchError: undefined,
        loaderData: undefined,
        loadPromise: Promise.resolve(),
        routeContext: undefined!,
        context: undefined!,
        abortController: new AbortController(),
        fetchedAt: 0,
      }

      return routeMatch
    })

    // Take each match and resolve its search params and context
    // This has to happen after the matches are created or found
    // so that we can use the parent match's search params and context
    matches.forEach((match, i): any => {
      const parentMatch = matches[i - 1]
      const route = this.getRoute(match.routeId)

      const searchInfo = (() => {
        // Validate the search params and stabilize them
        const parentSearchInfo = {
          search: parentMatch?.search ?? locationSearch,
          routeSearch: parentMatch?.routeSearch ?? locationSearch,
        }

        try {
          const validator =
            typeof route.options.validateSearch === 'object'
              ? route.options.validateSearch.parse
              : route.options.validateSearch

          const routeSearch = validator?.(parentSearchInfo.search) ?? {}

          const search = {
            ...parentSearchInfo.search,
            ...routeSearch,
          }

          return {
            routeSearch: replaceEqualDeep(match.routeSearch, routeSearch),
            search: replaceEqualDeep(match.search, search),
          }
        } catch (err: any) {
          match.searchError = new SearchParamError(err.message, {
            cause: err,
          })

          if (opts?.throwOnError) {
            throw match.searchError
          }

          return parentSearchInfo
        }
      })()

      Object.assign(match, {
        ...searchInfo,
      })

      const contextInfo = (() => {
        try {
          const routeContext =
            route.options.getContext?.({
              parentContext: parentMatch?.routeContext ?? {},
              context: parentMatch?.context ?? this?.options.context ?? {},
              params: match.params,
              search: match.search,
            }) || ({} as any)

          const context = {
            ...(parentMatch?.context ?? this?.options.context),
            ...routeContext,
          } as any

          return {
            context,
            routeContext,
          }
        } catch (err) {
          route.options.onError?.(err)
          throw err
        }
      })()

      Object.assign(match, {
        ...contextInfo,
      })
    })

    return matches as any
  }

  loadMatches = async (
    resolvedMatches: AnyRouteMatch[],
    opts?: {
      preload?: boolean
      maxAge?: number
    },
  ) => {
    this.cleanMatches()

    if (!opts?.preload) {
      resolvedMatches.forEach((match) => {
        // Update each match with its latest route data
        this.setRouteMatch(match.id, (s) => ({
          ...s,
          routeSearch: match.routeSearch,
          search: match.search,
          routeContext: match.routeContext,
          context: match.context,
          error: match.error,
          paramsError: match.paramsError,
          searchError: match.searchError,
          params: match.params,
        }))
      })
    }

    let firstBadMatchIndex: number | undefined

    // Check each match middleware to see if the route can be accessed
    try {
      for (const [index, match] of resolvedMatches.entries()) {
        const route = this.getRoute(match.routeId)

        const handleError = (err: any, code: string) => {
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

          this.setRouteMatch(match.id, (s) => ({
            ...s,
            error: err,
            status: 'error',
            updatedAt: Date.now(),
          }))
        }

        if (match.paramsError) {
          handleError(match.paramsError, 'PARSE_PARAMS')
        }

        if (match.searchError) {
          handleError(match.searchError, 'VALIDATE_SEARCH')
        }

        let didError = false

        try {
          await route.options.beforeLoad?.({
            ...match,
            preload: !!opts?.preload,
          })
        } catch (err) {
          handleError(err, 'BEFORE_LOAD')
          didError = true
        }

        // If we errored, do not run the next matches' middleware
        if (didError) {
          break
        }
      }
    } catch (err) {
      if (!opts?.preload) {
        this.navigate(err as any)
      }

      throw err
    }

    const validResolvedMatches = resolvedMatches.slice(0, firstBadMatchIndex)
    const matchPromises: Promise<any>[] = []

    validResolvedMatches.forEach((match, index) => {
      matchPromises.push(
        (async () => {
          const parentMatchPromise = matchPromises[index - 1]
          const route = this.getRoute(match.routeId)

          if (
            match.isFetching ||
            (match.status === 'success' &&
              !this.getIsInvalid({ matchId: match.id, preload: opts?.preload }))
          ) {
            return this.getRouteMatch(match.id)?.loadPromise
          }

          const fetchedAt = Date.now()
          const checkLatest = () => {
            const latest = this.getRouteMatch(match.id)
            return latest && latest.fetchedAt !== fetchedAt
              ? latest.loadPromise
              : undefined
          }

          const handleIfRedirect = (err: any) => {
            if (isRedirect(err)) {
              if (!opts?.preload) {
                this.navigate(err as any)
              }
              return true
            }
            return false
          }

          const load = async () => {
            let latestPromise

            try {
              const componentsPromise = Promise.all(
                componentTypes.map(async (type) => {
                  const component = route.options[type]

                  if ((component as any)?.preload) {
                    await (component as any).preload()
                  }
                }),
              )

              const loaderPromise = route.options.loader?.({
                ...match,
                preload: !!opts?.preload,
                parentMatchPromise,
              })

              const [_, loader] = await Promise.all([
                componentsPromise,
                loaderPromise,
              ])
              if ((latestPromise = checkLatest())) return await latestPromise

              this.setRouteMatchData(match.id, () => loader, opts)
            } catch (error) {
              if ((latestPromise = checkLatest())) return await latestPromise
              if (handleIfRedirect(error)) return

              try {
                route.options.onError?.(error)
              } catch (onErrorError) {
                error = onErrorError
                if (handleIfRedirect(onErrorError)) return
              }

              this.setRouteMatch(match.id, (s) => ({
                ...s,
                error,
                status: 'error',
                isFetching: false,
                updatedAt: Date.now(),
              }))
            }
          }

          let loadPromise: Promise<void> | undefined

          this.__store.batch(() => {
            this.setRouteMatch(match.id, (s) => ({
              ...s,
              // status: s.status !== 'success' ? 'pending' : s.status,
              isFetching: true,
              fetchedAt,
              invalid: false,
            }))

            loadPromise = load()

            this.setRouteMatch(match.id, (s) => ({
              ...s,
              loadPromise,
            }))
          })

          await loadPromise
        })(),
      )
    })

    await Promise.all(matchPromises)
  }

  reload = () => {
    return this.navigate({
      fromCurrent: true,
      replace: true,
      search: true,
    } as any)
  }

  resolvePath = (from: string, path: string) => {
    return resolvePath(this.basepath!, from, cleanPath(path))
  }

  navigate = async <
    TFrom extends RoutePaths<TRouteTree> = '/',
    TTo extends string = '',
  >({
    from,
    to = '' as any,
    search,
    hash,
    replace,
    params,
  }: NavigateOptions<TRouteTree, TFrom, TTo>) => {
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

    return this.#commitLocation({
      from: fromString,
      to: toString,
      search,
      hash,
      replace,
      params,
    })
  }

  matchRoute = <
    TFrom extends RoutePaths<TRouteTree> = '/',
    TTo extends string = '',
    TResolved extends string = ResolveRelativePath<TFrom, NoInfer<TTo>>,
  >(
    location: ToOptions<TRouteTree, TFrom, TTo>,
    opts?: MatchRouteOptions,
  ): false | RouteById<TRouteTree, TResolved>['types']['allParams'] => {
    location = {
      ...location,
      to: location.to
        ? this.resolvePath(location.from ?? '', location.to)
        : undefined,
    } as any

    const next = this.buildNext(location)
    if (opts?.pending && this.state.status !== 'pending') {
      return false
    }

    const baseLocation = opts?.pending
      ? this.state.location
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

    if (opts?.includeSearch ?? true) {
      return partialDeepEqual(baseLocation.search, next.search) ? match : false
    }

    return match
  }

  buildLink = <
    TFrom extends RoutePaths<TRouteTree> = '/',
    TTo extends string = '',
  >({
    from,
    to = '.' as any,
    search,
    params,
    hash,
    target,
    replace,
    activeOptions,
    preload,
    preloadDelay: userPreloadDelay,
    disabled,
    state,
  }: LinkOptions<TRouteTree, TFrom, TTo>): LinkInfo => {
    // If this link simply reloads the current route,
    // make sure it has a new key so it will trigger a data refresh

    // If this `to` is a valid external URL, return
    // null for LinkUtils

    try {
      new URL(`${to}`)
      return {
        type: 'external',
        href: to,
      }
    } catch (e) {}

    const nextOpts = {
      from,
      to,
      search,
      params,
      hash,
      replace,
      state,
    }

    const next = this.buildNext(nextOpts)

    preload = preload ?? this.options.defaultPreload
    const preloadDelay =
      userPreloadDelay ?? this.options.defaultPreloadDelay ?? 0

    // Compare path/hash for matches
    const currentPathSplit = this.state.location.pathname.split('/')
    const nextPathSplit = next.pathname.split('/')
    const pathIsFuzzyEqual = nextPathSplit.every(
      (d, i) => d === currentPathSplit[i],
    )
    // Combine the matches based on user options
    const pathTest = activeOptions?.exact
      ? this.state.location.pathname === next.pathname
      : pathIsFuzzyEqual
    const hashTest = activeOptions?.includeHash
      ? this.state.location.hash === next.hash
      : true
    const searchTest =
      activeOptions?.includeSearch ?? true
        ? partialDeepEqual(this.state.location.search, next.search)
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
        this.#commitLocation(nextOpts as any)
      }
    }

    // The click handler
    const handleFocus = (e: MouseEvent) => {
      if (preload) {
        this.preloadRoute(nextOpts).catch((err) => {
          console.warn(err)
          console.warn('Error preloading route! ☝️')
        })
      }
    }

    const handleTouchStart = (e: TouchEvent) => {
      this.preloadRoute(nextOpts).catch((err) => {
        console.warn(err)
        console.warn('Error preloading route! ☝️')
      })
    }

    const handleEnter = (e: MouseEvent) => {
      const target = (e.target || {}) as LinkCurrentTargetElement

      if (preload) {
        if (target.preloadTimeout) {
          return
        }

        target.preloadTimeout = setTimeout(() => {
          target.preloadTimeout = null
          this.preloadRoute(nextOpts).catch((err) => {
            console.warn(err)
            console.warn('Error preloading route! ☝️')
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

  dehydrate = (): DehydratedRouter => {
    return {
      state: pick(this.state, ['location', 'status', 'lastUpdated']),
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
    const routerState = ctx.router.state as RouterState<TRouteTree>

    this.__store.setState((s) => {
      return {
        ...s,
        ...routerState,
        resolvedLocation: routerState.location,
      }
    })

    await this.load()

    return
  }

  injectedHtml: (string | (() => Promise<string> | string))[] = []

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

  hydrateData = <T = unknown>(key: any) => {
    if (typeof document !== 'undefined') {
      const strKey = typeof key === 'string' ? key : JSON.stringify(key)

      return window[`__TSR_DEHYDRATED__${strKey}` as any] as T
    }

    return undefined
  }

  // resolveMatchPromise = (matchId: string, key: string, value: any) => {
  //   this.state.matches
  //     .find((d) => d.id === matchId)
  //     ?.__promisesByKey[key]?.resolve(value)
  // }

  #buildRouteTree = (routeTree: TRouteTree) => {
    this.routeTree = routeTree as any
    this.routesById = {} as any
    this.routesByPath = {} as any
    this.flatRoutes = [] as any

    const recurseRoutes = (routes: AnyRoute[]) => {
      routes.forEach((route, i) => {
        route.init({ originalIndex: i, router: this })

        const existingRoute = (this.routesById as any)[route.id]

        invariant(
          !existingRoute,
          `Duplicate routes found with id: ${String(route.id)}`,
        )
        ;(this.routesById as any)[route.id] = route

        if (!route.isRoot && route.path) {
          const trimmedFullPath = trimPathRight(route.fullPath)
          if (
            !(this.routesByPath as any)[trimmedFullPath] ||
            route.fullPath.endsWith('/')
          ) {
            ;(this.routesByPath as any)[trimmedFullPath] = route
          }
        }

        const children = route.children as Route[]

        if (children?.length) {
          recurseRoutes(children)
        }
      })
    }

    recurseRoutes([routeTree])

    this.flatRoutes = (Object.values(this.routesByPath) as AnyRoute[])
      .map((d, i) => {
        const trimmed = trimPath(d.fullPath)
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

        return { child: d, trimmed, parsed, index: i, score }
      })
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
      }) as any
  }

  #parseLocation = (
    previousLocation?: ParsedLocation,
  ): ParsedLocation<FullSearchSchema<TRouteTree>> => {
    let { pathname, search, hash, state } = this.history.location

    const parsedSearch = this.options.parseSearch(search)

    return {
      pathname: pathname,
      searchStr: search,
      search: replaceEqualDeep(previousLocation?.search, parsedSearch) as any,
      hash: hash.split('#').reverse()[0] ?? '',
      href: `${pathname}${search}${hash}`,
      state: state as LocationState,
      key: state?.key || '__init__',
    }
  }

  #buildLocation = (dest: BuildNextOptions = {}): ParsedLocation => {
    dest.fromCurrent = dest.fromCurrent ?? dest.to === ''

    const fromPathname = dest.fromCurrent
      ? this.state.location.pathname
      : dest.from ?? this.state.location.pathname

    let pathname = resolvePath(
      this.basepath ?? '/',
      fromPathname,
      `${dest.to ?? ''}`,
    )

    const fromMatches = this.matchRoutes(
      this.state.location.pathname,
      this.state.location.search,
    )

    const prevParams = { ...last(fromMatches)?.params }

    let nextParams =
      (dest.params ?? true) === true
        ? prevParams
        : functionalUpdate(dest.params!, prevParams)

    if (nextParams) {
      dest.__matches
        ?.map((d) => this.getRoute(d.routeId).options.stringifyParams)
        .filter(Boolean)
        .forEach((fn) => {
          nextParams = { ...nextParams!, ...fn!(nextParams!) }
        })
    }

    pathname = interpolatePath(pathname, nextParams ?? {})

    const preSearchFilters =
      dest.__matches
        ?.map(
          (match) =>
            this.getRoute(match.routeId).options.preSearchFilters ?? [],
        )
        .flat()
        .filter(Boolean) ?? []

    const postSearchFilters =
      dest.__matches
        ?.map(
          (match) =>
            this.getRoute(match.routeId).options.postSearchFilters ?? [],
        )
        .flat()
        .filter(Boolean) ?? []

    // Pre filters first
    const preFilteredSearch = preSearchFilters?.length
      ? preSearchFilters?.reduce(
          (prev, next) => next(prev),
          this.state.location.search,
        )
      : this.state.location.search

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

    const search = replaceEqualDeep(
      this.state.location.search,
      postFilteredSearch,
    )

    const searchStr = this.options.stringifySearch(search)

    const hash =
      dest.hash === true
        ? this.state.location.hash
        : functionalUpdate(dest.hash!, this.state.location.hash)

    const hashStr = hash ? `#${hash}` : ''

    const nextState =
      dest.state === true
        ? this.state.location.state
        : functionalUpdate(dest.state, this.state.location.state)!

    return {
      pathname,
      search,
      searchStr,
      state: nextState,
      hash,
      href: this.history.createHref(`${pathname}${searchStr}${hashStr}`),
      key: dest.key,
    }
  }

  #commitLocation = async (
    location: BuildNextOptions & { replace?: boolean },
  ) => {
    const next = this.buildNext(location)
    const id = '' + Date.now() + Math.random()

    if (this.navigateTimeout) clearTimeout(this.navigateTimeout)

    let nextAction: 'push' | 'replace' = 'replace'

    if (!location.replace) {
      nextAction = 'push'
    }

    const isSameUrl = this.state.location.href === next.href

    if (isSameUrl && !next.key) {
      nextAction = 'replace'
    }

    const href = `${next.pathname}${next.searchStr}${
      next.hash ? `#${next.hash}` : ''
    }`

    this.history[nextAction === 'push' ? 'push' : 'replace'](href, {
      id,
      ...next.state,
    })

    return this.latestLoadPromise
  }

  getRouteMatch = (
    id: string,
  ): undefined | RouteMatch<TRouteTree, AnyRoute> => {
    return this.state.matchesById[id]
  }

  setRouteMatch = (
    id: string,
    updater: (
      prev: RouteMatch<TRouteTree, AnyRoute>,
    ) => RouteMatch<TRouteTree, AnyRoute>,
  ) => {
    this.__store.setState((prev) => {
      if (!prev.matchesById[id]) {
        console.warn(`No match found with id: ${id}`)
      }

      return {
        ...prev,
        matchesById: {
          ...prev.matchesById,
          [id]: updater(prev.matchesById[id] as any),
        },
      }
    })
  }

  setRouteMatchData = (
    id: string,
    updater: (prev: any) => any,
    opts?: {
      updatedAt?: number
      maxAge?: number
    },
  ) => {
    const match = this.getRouteMatch(id)

    if (!match) return

    const route = this.getRoute(match.routeId)
    const updatedAt = opts?.updatedAt ?? Date.now()

    const preloadInvalidAt =
      updatedAt +
      (opts?.maxAge ??
        route.options.preloadMaxAge ??
        this.options.defaultPreloadMaxAge ??
        5000)

    const invalidAt =
      updatedAt +
      (opts?.maxAge ??
        route.options.maxAge ??
        this.options.defaultMaxAge ??
        Infinity)

    this.setRouteMatch(id, (s) => ({
      ...s,
      error: undefined,
      status: 'success',
      isFetching: false,
      updatedAt: Date.now(),
      loaderData: functionalUpdate(updater, s.loaderData),
      preloadInvalidAt,
      invalidAt,
    }))

    if (this.state.matches.find((d) => d.id === id)) {
    }
  }

  invalidate = async (opts?: {
    matchId?: string
    reload?: boolean
  }): Promise<void> => {
    if (opts?.matchId) {
      this.setRouteMatch(opts.matchId, (s) => ({
        ...s,
        invalid: true,
      }))
      const matchIndex = this.state.matches.findIndex(
        (d) => d.id === opts.matchId,
      )
      const childMatch = this.state.matches[matchIndex + 1]

      if (childMatch) {
        return this.invalidate({ matchId: childMatch.id, reload: false })
      }
    } else {
      this.__store.batch(() => {
        Object.values(this.state.matchesById).forEach((match) => {
          this.setRouteMatch(match.id, (s) => ({
            ...s,
            invalid: true,
          }))
        })
      })
    }

    if (opts?.reload ?? true) {
      return this.reload()
    }
  }

  getIsInvalid = (opts?: { matchId: string; preload?: boolean }): boolean => {
    if (!opts?.matchId) {
      return !!this.state.matches.find((d) =>
        this.getIsInvalid({ matchId: d.id, preload: opts?.preload }),
      )
    }

    const match = this.getRouteMatch(opts?.matchId)

    if (!match) {
      return false
    }

    const now = Date.now()

    return (
      match.invalid ||
      (opts?.preload ? match.preloadInvalidAt : match.invalidAt) < now
    )
  }
}

// Detect if we're in the DOM
const isServer = typeof window === 'undefined' || !window.document.createElement

function getInitialRouterState(): RouterState<any> {
  return {
    status: 'idle',
    isFetching: false,
    resolvedLocation: null!,
    location: null!,
    matchesById: {},
    matchIds: [],
    pendingMatchIds: [],
    matches: [],
    pendingMatches: [],
    lastUpdated: Date.now(),
  }
}

function isCtrlEvent(e: MouseEvent) {
  return !!(e.metaKey || e.altKey || e.ctrlKey || e.shiftKey)
}

export type AnyRedirect = Redirect<any, any, any>

export type Redirect<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RoutePaths<TRouteTree> = '/',
  TTo extends string = '',
> = NavigateOptions<TRouteTree, TFrom, TTo> & {
  code?: number
}

export function redirect<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RoutePaths<TRouteTree> = '/',
  TTo extends string = '',
>(opts: Redirect<TRouteTree, TFrom, TTo>): Redirect<TRouteTree, TFrom, TTo> {
  ;(opts as any).isRedirect = true
  return opts
}

export function isRedirect(obj: any): obj is AnyRedirect {
  return !!obj?.isRedirect
}

export class SearchParamError extends Error {}
export class PathParamError extends Error {}

function escapeJSON(jsonString: string) {
  return jsonString
    .replace(/\\/g, '\\\\') // Escape backslashes
    .replace(/'/g, "\\'") // Escape single quotes
    .replace(/"/g, '\\"') // Escape double quotes
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
