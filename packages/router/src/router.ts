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
  RootRoute,
  AnyContext,
  AnyPathParams,
  RouteProps,
} from './route'
import {
  RoutesInfo,
  AnyRoutesInfo,
  RoutesById,
  RoutesByPath,
  DefaultRoutesInfo,
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
import { RouteComponent, RouteErrorComponent } from './react'

//

declare global {
  interface Window {
    __TSR_DEHYDRATED__?: HydrationCtx
  }

  interface Error {
    cause: unknown
  }

  interface ErrorConstructor {
    new (reason: string, options?: { cause?: unknown }): Error
  }
}

export interface Register {
  // router: Router
}

export type AnyRouter = Router<any, any, any>

export type RegisteredRouterPair = Register extends {
  router: infer TRouter extends AnyRouter
}
  ? [TRouter, TRouter['types']['RoutesInfo']]
  : [Router, AnyRoutesInfo]

export type RegisteredRouter = RegisteredRouterPair[0]
export type RegisteredRoutesInfo = RegisteredRouterPair[1]

export interface LocationState {}

export interface ParsedLocation<
  TSearchObj extends AnySearchSchema = {},
  TState extends LocationState = LocationState,
> {
  href: string
  pathname: string
  search: TSearchObj
  searchStr: string
  state: TState
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
  TRoutesInfo extends AnyRoutesInfo = DefaultRoutesInfo,
  TRoute extends AnyRoute = Route,
> {
  id: string
  routeId: string
  pathname: string
  params: TRoute['__types']['allParams']
  status: 'pending' | 'success' | 'error'
  error: unknown
  paramsError: unknown
  searchError: unknown
  updatedAt: number
  loader: TRoute['__types']['loader']
  loadPromise?: Promise<void>
  __resolveLoadPromise?: () => void
  routeContext: TRoute['__types']['routeContext']
  context: TRoute['__types']['context']
  routeSearch: TRoute['__types']['searchSchema']
  search: TRoutesInfo['fullSearchSchema'] &
    TRoute['__types']['fullSearchSchema']
  fetchedAt: number
  abortController: AbortController
}

export type AnyRouteMatch = RouteMatch<AnyRoutesInfo, AnyRoute>

export type RouterContextOptions<TRouteTree extends AnyRoute> =
  AnyContext extends TRouteTree['__types']['routerContext']
    ? {
        context?: TRouteTree['__types']['routerContext']
      }
    : {
        context: TRouteTree['__types']['routerContext']
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
  defaultComponent?: RouteComponent<
    RouteProps<unknown, AnySearchSchema, AnyPathParams, AnyContext>
  >
  defaultErrorComponent?: RouteErrorComponent
  defaultPendingComponent?: RouteComponent<
    RouteProps<unknown, AnySearchSchema, AnyPathParams, AnyContext>
  >
  defaultLoaderMaxAge?: number
  defaultLoaderGcMaxAge?: number
  caseSensitive?: boolean
  routeTree?: TRouteTree
  basepath?: string
  createRoute?: (opts: { route: AnyRoute; router: AnyRouter }) => void
  onRouteChange?: () => void
  context?: TRouteTree['__types']['routerContext']
  Wrap?: React.ComponentType<{
    children: React.ReactNode
    dehydratedState?: TDehydrated
  }>
  dehydrate?: () => TDehydrated
  hydrate?: (dehydrated: TDehydrated) => void
}

export interface RouterState<
  TRoutesInfo extends AnyRoutesInfo = AnyRoutesInfo,
  TState extends LocationState = LocationState,
> {
  status: 'idle' | 'pending'
  matches: RouteMatch<TRoutesInfo, TRoutesInfo['routeIntersection']>[]
  pendingMatches: RouteMatch<TRoutesInfo, TRoutesInfo['routeIntersection']>[]
  preloadMatches: Record<
    string,
    RouteMatch<TRoutesInfo, TRoutesInfo['routeIntersection']>
  >
  location: ParsedLocation<TRoutesInfo['fullSearchSchema'], TState>
  resolvedLocation: ParsedLocation<TRoutesInfo['fullSearchSchema'], TState>
  lastUpdated: number
}

export type ListenerFn = () => void

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

export class Router<
  TRouteTree extends AnyRoute = AnyRoute,
  TRoutesInfo extends AnyRoutesInfo = RoutesInfo<TRouteTree>,
  TDehydrated extends Record<string, any> = Record<string, any>,
> {
  types!: {
    RootRoute: TRouteTree
    RoutesInfo: TRoutesInfo
  }

  options: PickAsRequired<
    RouterOptions<TRouteTree, TDehydrated>,
    'stringifySearch' | 'parseSearch' | 'context'
  >
  history!: RouterHistory
  #unsubHistory?: () => void
  basepath!: string
  routeTree!: RootRoute
  routesById!: RoutesById<TRoutesInfo>
  routesByPath!: RoutesByPath<TRoutesInfo>
  flatRoutes!: TRoutesInfo['routesByFullPath'][keyof TRoutesInfo['routesByFullPath']][]
  navigateTimeout: undefined | Timeout
  nextAction: undefined | 'push' | 'replace'
  navigationPromise: undefined | Promise<void>

  __store: Store<RouterState<TRoutesInfo>>
  state: RouterState<TRoutesInfo>
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

    this.__store = new Store<RouterState<TRoutesInfo>>(
      getInitialRouterState(),
      {
        onUpdate: () => {
          this.state = this.__store.state
        },
        defaultPriority: 'low',
      },
    )
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
        resolvedLocation: parsedLocation,
        location: parsedLocation,
      }))

      this.#unsubHistory = this.history.listen(() => {
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

  safeLoad = (opts?: { next?: ParsedLocation }) => {
    this.load(opts).catch((err) => {
      // console.warn(err)
      // invariant(false, 'Encountered an error during router.load()! ☝️.')
    })
  }

  latestLoadPromise: Promise<void> | null = null

  load = async (opts?: { next?: ParsedLocation }) => {
    const promise = new Promise<void>(async (resolve, reject) => {
      let latestPromise: Promise<void> | undefined | null

      const checkLatest = (): undefined | Promise<void> | null => {
        return this.latestLoadPromise !== promise
          ? this.latestLoadPromise
          : undefined
      }

      let now = Date.now()

      // Cancel any pending matches
      this.cancelMatches()

      let pendingMatches!: RouteMatch<any, any>[]

      this.__store.batch(() => {
        if (opts?.next) {
          // Ingest the new location
          this.__store.setState((s) => ({
            ...s,
            location: opts.next!,
          }))
        }

        // Match the routes
        pendingMatches = this.matchRoutes(
          this.state.location.pathname,
          this.state.location.search,
          {
            throwOnError: true,
          },
        )

        this.__store.setState((s) => ({
          ...s,
          status: 'pending',
          pendingMatches,
        }))
      })

      try {
        // Load the matches
        await this.loadMatches(pendingMatches)

        // Only apply the latest transition
        if ((latestPromise = checkLatest())) {
          return await latestPromise
        }

        const prevLocation = this.state.resolvedLocation

        this.__store.setState((s) => ({
          ...s,
          status: 'idle',
          resolvedLocation: s.location,
          matches: s.pendingMatches,
          pendingMatches: [],
        }))

        if (prevLocation!.href !== this.state.location.href) {
          this.options.onRouteChange?.()
        }

        resolve()
      } catch (err) {
        // Only apply the latest transition
        if ((latestPromise = checkLatest())) {
          return await latestPromise
        }

        reject(err)
      }
    })

    this.latestLoadPromise = promise

    return this.latestLoadPromise
  }

  getRoute = <TId extends keyof TRoutesInfo['routesById']>(
    id: TId,
  ): TRoutesInfo['routesById'][TId] => {
    const route = this.routesById[id]

    invariant(route, `Route with id "${id as string}" not found`)

    return route
  }

  preloadRoute = async (
    navigateOpts: BuildNextOptions = this.state.location,
  ) => {
    const next = this.buildNext(navigateOpts)
    const matches = this.matchRoutes(next.pathname, next.search, {
      throwOnError: true,
    })

    const matchesById: any = {}

    matches.forEach((m) => {
      if (!this.state.matches.find((d) => d.id === m.id)) {
        matchesById[m.id] = m
      }
    })

    this.__store.setState((s) => {
      return {
        ...s,
        preloadMatches: {
          ...s.preloadMatches,
          ...matchesById,
        },
      }
    })

    await this.loadMatches(matches, {
      preload: true,
    })
    return matches
  }

  matchRoutes = (
    pathname: string,
    locationSearch: AnySearchSchema,
    opts?: { throwOnError?: boolean },
  ): RouteMatch<TRoutesInfo, TRoutesInfo['routeIntersection']>[] => {
    let routeParams: AnyPathParams = {}

    let foundRoute = this.flatRoutes.find((route) => {
      const matchedParams = matchPathname(this.basepath, pathname, {
        to: route.fullPath,
        caseSensitive:
          route.options.caseSensitive ?? this.options.caseSensitive,
      })

      if (matchedParams) {
        routeParams = matchedParams
        return true
      }

      return false
    })

    let routeCursor = foundRoute || (this.routesById['__root__'] as any)

    let matchedRoutes: AnyRoute[] = [routeCursor]

    while (routeCursor?.parentRoute) {
      routeCursor = routeCursor.parentRoute
      if (routeCursor) matchedRoutes.unshift(routeCursor)
    }

    // Alright, by now we should have all of our
    // matching routes and their param pairs, let's
    // Turn them into actual `Match` objects and
    // accumulate the params into a single params bag
    let allParams = {}

    // Existing matches are matches that are already loaded along with
    // pending matches that are still loading

    const matches = matchedRoutes.map((route) => {
      let parsedParams
      let parsedParamsError

      try {
        parsedParams = route.options.parseParams?.(routeParams!) ?? routeParams
      } catch (err: any) {
        parsedParamsError = new PathParamError(err.message, {
          cause: err,
        })

        if (opts?.throwOnError) {
          throw parsedParamsError
        }
      }

      // Add the parsed params to the accumulated params bag
      Object.assign(allParams, parsedParams)

      const interpolatedPath = interpolatePath(route.path, allParams)
      const matchId =
        interpolatePath(route.id, allParams, true) +
        (route.options.getKey?.({
          params: allParams,
          search: locationSearch,
        }) ?? '')

      // Waste not, want not. If we already have a match for this route,
      // reuse it. This is important for layout routes, which might stick
      // around between navigation actions that only change leaf routes.
      const existingMatch = this.getRouteMatch(matchId)

      if (existingMatch) {
        // Return a copy, we don't want to mutate the existing match
        return { ...existingMatch }
      }

      // Create a fresh route match
      const hasLoaders = !!(
        route.options.loader ||
        componentTypes.some((d) => route.options[d]?.preload)
      )

      const routeMatch: RouteMatch = {
        id: matchId,
        routeId: route.id,
        params: allParams,
        pathname: joinPaths([this.basepath, interpolatedPath]),
        updatedAt: 0,
        routeSearch: {},
        search: {} as any,
        status: hasLoaders ? 'pending' : 'success',
        error: undefined,
        paramsError: parsedParamsError,
        searchError: undefined,
        loader: undefined,
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
        ...searchInfo,
        ...contextInfo,
      })
    })

    return matches
  }

  loadMatches = async (
    resolvedMatches: AnyRouteMatch[],
    opts?: {
      preload?: boolean
    },
  ) => {
    let firstBadMatchIndex: number | undefined

    // Check each match middleware to see if the route can be accessed
    try {
      await Promise.all(
        resolvedMatches.map(async (match, index) => {
          const route = this.getRoute(match.routeId)

          const handleError = (
            err: any,
            handler: undefined | ((err: any) => void),
          ) => {
            firstBadMatchIndex = firstBadMatchIndex ?? index
            handler = handler || route.options.onError

            if (isRedirect(err)) {
              throw err
            }

            try {
              handler?.(err)
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
            handleError(match.paramsError, route.options.onParseParamsError)
          }

          if (match.searchError) {
            handleError(match.searchError, route.options.onValidateSearchError)
          }

          try {
            await route.options.beforeLoad?.({
              ...match,
              preload: !!opts?.preload,
            })
          } catch (err) {
            handleError(err, route.options.onBeforeLoadError)
          }
        }),
      )
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
        Promise.resolve().then(async () => {
          const parentMatchPromise = matchPromises[index - 1]
          const route = this.getRoute(match.routeId)
          const fetchedAt = Date.now()
          const loadPromise = Promise.resolve().then(async () => {
            const checkLatest = () => {
              const latest = this.getRouteMatch(match.id)
              return latest && latest.fetchedAt !== fetchedAt
                ? latest.loadPromise
                : undefined
            }

            let latestPromise

            const componentsPromise = Promise.all(
              componentTypes.map(async (type) => {
                const component = route.options[type]

                if (component?.preload) {
                  await component.preload()
                }
              }),
            )

            const loaderPromise = Promise.resolve().then(() => {
              if (route.options.loader) {
                return route.options.loader({
                  ...match,
                  preload: !!opts?.preload,
                  parentMatchPromise,
                })
              }
              return
            })

            try {
              const [_, loader] = await Promise.all([
                componentsPromise,
                loaderPromise,
              ])
              if ((latestPromise = checkLatest())) return await latestPromise

              if (
                !opts?.preload ||
                !this.state.matches.find((d) => d.id === match.id)
              ) {
                this.setRouteMatch(match.id, (s) => ({
                  ...s,
                  error: undefined,
                  status: 'success',
                  updatedAt: Date.now(),
                  loader,
                }))
              }
            } catch (err) {
              if ((latestPromise = checkLatest())) return await latestPromise

              if (isRedirect(err)) {
                if (!opts?.preload) {
                  this.navigate(err as any)
                }
                return
              }

              const errorHandler =
                route.options.onLoadError ?? route.options.onError

              let caughtError = err

              try {
                errorHandler?.(err)
              } catch (errorHandlerErr) {
                caughtError = errorHandlerErr
                if (isRedirect(errorHandlerErr)) {
                  if (!opts?.preload) {
                    this.navigate(errorHandlerErr as any)
                  }
                  return
                }
              }

              this.setRouteMatch(match.id, (s) => ({
                ...s,
                error: caughtError,
                status: 'error',
                updatedAt: Date.now(),
              }))
            } finally {
              if ((latestPromise = checkLatest())) return await latestPromise
              if (opts?.preload) {
                this.__store.setState((s) => {
                  const preloadMatches = { ...s.preloadMatches }
                  delete preloadMatches[match.id]
                  return {
                    ...s,
                    preloadMatches,
                  }
                })
              }
            }
          })

          this.setRouteMatch(match.id, (s) => ({
            ...s,
            loadPromise,
            fetchedAt,
          }))

          await loadPromise
        }),
      )
    })

    await Promise.all(matchPromises)
  }

  reload = () => {
    this.navigate({
      fromCurrent: true,
      replace: true,
      search: true,
    } as any)
  }

  resolvePath = (from: string, path: string) => {
    return resolvePath(this.basepath!, from, cleanPath(path))
  }

  navigate = async <TFrom extends string = '/', TTo extends string = ''>({
    from,
    to = '' as any,
    search,
    hash,
    replace,
    params,
  }: NavigateOptions<TRoutesInfo, TFrom, TTo>) => {
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
    TFrom extends string = '/',
    TTo extends string = '',
    TResolved extends string = ResolveRelativePath<TFrom, NoInfer<TTo>>,
  >(
    location: ToOptions<TRoutesInfo, TFrom, TTo>,
    opts?: MatchRouteOptions,
  ): false | TRoutesInfo['routesById'][TResolved]['__types']['allParams'] => {
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

  buildLink = <TFrom extends string = '/', TTo extends string = ''>({
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
  }: LinkOptions<TRoutesInfo, TFrom, TTo>): LinkInfo => {
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

    this.__store.setState((s) => {
      return {
        ...s,
        ...ctx.router.state,
        matches: s.matches,
        resolvedLocation: ctx.router.state.location,
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
            !this.routesByPath[trimmedFullPath] ||
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

  #parseLocation = (previousLocation?: ParsedLocation): ParsedLocation => {
    let { pathname, search, hash, state } = this.history.location

    const parsedSearch = this.options.parseSearch(search)

    return {
      pathname: pathname,
      searchStr: search,
      search: replaceEqualDeep(previousLocation?.search, parsedSearch),
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

    return this.#createNavigationPromise()
  }

  #createNavigationPromise = () => {
    const previousNavigationResolve = this.resolveNavigation

    this.navigationPromise = new Promise((resolve) => {
      this.resolveNavigation = () => {
        resolve()
        previousNavigationResolve()
      }
    })

    return this.navigationPromise
  }

  getRouteMatch = (
    id: string,
  ): undefined | RouteMatch<TRoutesInfo, AnyRoute> => {
    return (
      this.state.matches.find((d) => d.id === id) ||
      this.state.pendingMatches.find((d) => d.id === id) ||
      this.state.preloadMatches[id]
    )
  }

  #setResolvedRouteMatch = (
    id: string,
    updater: (
      prev: RouteMatch<TRoutesInfo, AnyRoute>,
    ) => RouteMatch<TRoutesInfo, AnyRoute>,
  ) => {
    this.__store.setState((prev) => ({
      ...prev,
      matches: prev.matches.map((d) => {
        if (d.id === id) {
          return updater(d as any)
        }
        return d
      }),
    }))
  }

  #setPendingRouteMatch = (
    id: string,
    updater: (
      prev: RouteMatch<TRoutesInfo, AnyRoute>,
    ) => RouteMatch<TRoutesInfo, AnyRoute>,
  ) => {
    this.__store.setState((prev) => ({
      ...prev,
      pendingMatches: prev.pendingMatches.map((d) => {
        if (d.id === id) {
          return updater(d as any)
        }
        return d
      }),
    }))
  }

  #setPreloadRouteMatch = (
    id: string,
    updater: (
      prev: RouteMatch<TRoutesInfo, AnyRoute>,
    ) => RouteMatch<TRoutesInfo, AnyRoute>,
  ) => {
    invariant(this.state.preloadMatches[id], 'Match not found')

    this.__store.setState((prev) => ({
      ...prev,
      preloadMatches: {
        ...prev.preloadMatches,
        [id]: updater(prev.preloadMatches[id] as any),
      },
    }))
  }

  setRouteMatch = (
    id: string,
    updater: (
      prev: RouteMatch<TRoutesInfo, AnyRoute>,
    ) => RouteMatch<TRoutesInfo, AnyRoute>,
  ) => {
    if (this.state.matches.find((d) => d.id === id)) {
      return this.#setResolvedRouteMatch(id, updater)
    }

    if (this.state.pendingMatches.find((d) => d.id === id)) {
      return this.#setPendingRouteMatch(id, updater)
    }

    if (this.state.preloadMatches[id]) {
      return this.#setPreloadRouteMatch(id, updater)
    }
  }
}

// Detect if we're in the DOM
const isServer = typeof window === 'undefined' || !window.document.createElement

function getInitialRouterState(): RouterState<any, any> {
  return {
    status: 'idle',
    resolvedLocation: null!,
    location: null!,
    matches: [],
    pendingMatches: [],
    preloadMatches: {},
    lastUpdated: Date.now(),
  }
}

function isCtrlEvent(e: MouseEvent) {
  return !!(e.metaKey || e.altKey || e.ctrlKey || e.shiftKey)
}

export type AnyRedirect = Redirect<any, any, any>

export type Redirect<
  TRoutesInfo extends AnyRoutesInfo = RegisteredRoutesInfo,
  TFrom extends TRoutesInfo['routePaths'] = '/',
  TTo extends string = '',
> = NavigateOptions<TRoutesInfo, TFrom, TTo> & {
  code?: number
}

export function redirect<
  TRoutesInfo extends AnyRoutesInfo = RegisteredRoutesInfo,
  TFrom extends TRoutesInfo['routePaths'] = '/',
  TTo extends string = '',
>(opts: Redirect<TRoutesInfo, TFrom, TTo>): Redirect<TRoutesInfo, TFrom, TTo> {
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
