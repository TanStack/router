import {
  createBrowserHistory,
  createMemoryHistory,
  parseHref,
} from '@tanstack/history'
import { Store, batch } from '@tanstack/solid-store'
import invariant from 'tiny-invariant'
import {
  cleanPath,
  createControlledPromise,
  deepEqual,
  defaultParseSearch,
  defaultStringifySearch,
  functionalUpdate,
  getLocationChangeInfo,
  interpolatePath,
  isNotFound,
  isRedirect,
  isResolvedRedirect,
  joinPaths,
  last,
  matchPathname,
  parsePathname,
  pick,
  replaceEqualDeep,
  resolvePath,
  rootRouteId,
  setupScrollRestoration,
  trimPath,
  trimPathLeft,
  trimPathRight,
} from '@tanstack/router-core'
import type * as Solid from 'solid-js'
import type { HistoryLocation, RouterHistory } from '@tanstack/history'

import type {
  AnyRedirect,
  AnyRoute,
  AnyRouteMatch,
  AnyRouter,
  AnySchema,
  AnyValidator,
  BeforeLoadContextOptions,
  BuildLocationFn,
  BuildNextOptions,
  ClearCacheFn,
  CommitLocationFn,
  CommitLocationOptions,
  ControlledPromise,
  Router as CoreRouter,
  EmitFn,
  FullSearchSchema,
  GetMatchFn,
  GetMatchRoutesFn,
  InjectedHtmlEntry,
  InvalidateFn,
  LoadFn,
  LoaderFnContext,
  MakeRouteMatch,
  MakeRouteMatchUnion,
  Manifest,
  MatchRouteFn,
  MatchRoutesFn,
  MatchRoutesOpts,
  MatchedRoutesResult,
  NavigateFn,
  NotFoundError,
  ParseLocationFn,
  ParsedLocation,
  PickAsRequired,
  PreloadRouteFn,
  ResolvedRedirect,
  RouteContextOptions,
  RouterConstructorOptions,
  RouterEvent,
  RouterListener,
  RouterOptions,
  RouterState,
  RoutesById,
  RoutesByPath,
  SearchMiddleware,
  StartSerializer,
  StartTransitionFn,
  SubscribeFn,
  TrailingSlashOption,
  UpdateFn,
  UpdateMatchFn,
  ViewTransitionOptions,
} from '@tanstack/router-core'
import type {
  ErrorRouteComponent,
  NotFoundRouteComponent,
  RouteComponent,
} from './route'

declare module '@tanstack/router-core' {
  export interface RouterOptionsExtensions {
    /**
     * A component that will be used to wrap the entire router.
     *
     * This is useful for providing a context to the entire router.
     *
     * Only non-DOM-rendering components like providers should be used, anything else will cause a hydration error.
     *
     * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#wrap-property)
     */
    Wrap?: (props: { children: any }) => Solid.JSX.Element
    /**
     * A component that will be used to wrap the inner contents of the router.
     *
     * This is useful for providing a context to the inner contents of the router where you also need access to the router context and hooks.
     *
     * Only non-DOM-rendering components like providers should be used, anything else will cause a hydration error.
     *
     * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#innerwrap-property)
     */
    InnerWrap?: (props: { children: any }) => Solid.JSX.Element

    /**
     * The default `component` a route should use if no component is provided.
     *
     * @default Outlet
     * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#defaultcomponent-property)
     */
    defaultComponent?: RouteComponent
    /**
     * The default `errorComponent` a route should use if no error component is provided.
     *
     * @default ErrorComponent
     * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#defaulterrorcomponent-property)
     * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/data-loading#handling-errors-with-routeoptionserrorcomponent)
     */
    defaultErrorComponent?: ErrorRouteComponent
    /**
     * The default `pendingComponent` a route should use if no pending component is provided.
     *
     * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#defaultpendingcomponent-property)
     * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/data-loading#showing-a-pending-component)
     */
    defaultPendingComponent?: RouteComponent
    /**
     * The default `notFoundComponent` a route should use if no notFound component is provided.
     *
     * @default NotFound
     * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#defaultnotfoundcomponent-property)
     * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/not-found-errors#default-router-wide-not-found-handling)
     */
    defaultNotFoundComponent?: NotFoundRouteComponent

    /**
     * The default `onCatch` handler for errors caught by the Router ErrorBoundary
     *
     * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#defaultoncatch-property)
     * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/data-loading#handling-errors-with-routeoptionsoncatch)
     */
    defaultOnCatch?: (error: Error) => void
  }
}

export const componentTypes = [
  'component',
  'errorComponent',
  'pendingComponent',
  'notFoundComponent',
] as const

function routeNeedsPreload(route: AnyRoute) {
  for (const componentType of componentTypes) {
    if ((route.options[componentType] as any)?.preload) {
      return true
    }
  }
  return false
}

function validateSearch(validateSearch: AnyValidator, input: unknown): unknown {
  if (validateSearch == null) return {}

  if ('~standard' in validateSearch) {
    const result = validateSearch['~standard'].validate(input)

    if (result instanceof Promise)
      throw new SearchParamError('Async validation not supported')

    if (result.issues)
      throw new SearchParamError(JSON.stringify(result.issues, undefined, 2), {
        cause: result,
      })

    return result.value
  }

  if ('parse' in validateSearch) {
    return validateSearch.parse(input)
  }

  if (typeof validateSearch === 'function') {
    return validateSearch(input)
  }

  return {}
}

function validateState(validateState: AnyValidator, input: unknown): unknown {
  if (validateState == null) return {}

  if ('~standard' in validateState) {
    const result = validateState['~standard'].validate(input)

    if (result instanceof Promise)
      throw new Error('Async validation not supported')

    if (result.issues)
      throw new Error(JSON.stringify(result.issues, undefined, 2), {
        cause: result,
      })

    return result.value
  }

  if ('parse' in validateState) {
    return validateState.parse(input)
  }

  if (typeof validateState === 'function') {
    return validateState(input)
  }

  return {}
}

export function createRouter<
  TRouteTree extends AnyRoute,
  TTrailingSlashOption extends TrailingSlashOption,
  TRouterHistory extends RouterHistory = RouterHistory,
  TDehydrated extends Record<string, any> = Record<string, any>,
>(
  options: undefined extends number
    ? 'strictNullChecks must be enabled in tsconfig.json'
    : RouterConstructorOptions<
        TRouteTree,
        TTrailingSlashOption,
        false,
        TRouterHistory,
        TDehydrated
      >,
): CoreRouter<
  TRouteTree,
  TTrailingSlashOption,
  false,
  TRouterHistory,
  TDehydrated
> {
  return new Router<
    TRouteTree,
    TTrailingSlashOption,
    TRouterHistory,
    TDehydrated
  >(options)
}

export class Router<
  in out TRouteTree extends AnyRoute,
  in out TTrailingSlashOption extends TrailingSlashOption,
  in out TRouterHistory extends RouterHistory = RouterHistory,
  in out TDehydrated extends Record<string, any> = Record<string, any>,
> implements
    CoreRouter<
      TRouteTree,
      TTrailingSlashOption,
      false,
      TRouterHistory,
      TDehydrated
    >
{
  // Option-independent properties
  tempLocationKey: string | undefined = `${Math.round(
    Math.random() * 10000000,
  )}`
  resetNextScroll = true
  shouldViewTransition?: boolean | ViewTransitionOptions = undefined
  isViewTransitionTypesSupported?: boolean = undefined
  subscribers = new Set<RouterListener<RouterEvent>>()
  viewTransitionPromise?: ControlledPromise<true>
  isScrollRestoring = false
  isScrollRestorationSetup = false

  // Must build in constructor
  __store!: Store<RouterState<TRouteTree>>
  options!: PickAsRequired<
    RouterOptions<
      TRouteTree,
      TTrailingSlashOption,
      false,
      TRouterHistory,
      TDehydrated
    >,
    'stringifySearch' | 'parseSearch' | 'context'
  >
  history!: TRouterHistory
  latestLocation!: ParsedLocation<FullSearchSchema<TRouteTree>>
  basepath!: string
  routeTree!: TRouteTree
  routesById!: RoutesById<TRouteTree>
  routesByPath!: RoutesByPath<TRouteTree>
  flatRoutes!: Array<AnyRoute>
  isServer!: boolean
  pathParamsDecodeCharMap?: Map<string, string>

  /**
   * @deprecated Use the `createRouter` function instead
   */
  constructor(
    options: RouterConstructorOptions<
      TRouteTree,
      TTrailingSlashOption,
      false,
      TRouterHistory,
      TDehydrated
    >,
  ) {
    this.update({
      defaultPreloadDelay: 50,
      defaultPendingMs: 1000,
      defaultPendingMinMs: 500,
      context: undefined!,
      ...options,
      caseSensitive: options.caseSensitive ?? false,
      notFoundMode: options.notFoundMode ?? 'fuzzy',
      stringifySearch: options.stringifySearch ?? defaultStringifySearch,
      parseSearch: options.parseSearch ?? defaultParseSearch,
    })

    if (typeof document !== 'undefined') {
      ;(window as any).__TSR_ROUTER__ = this
    }
  }

  // These are default implementations that can optionally be overridden
  // by the router provider once rendered. We provide these so that the
  // router can be used in a non-react environment if necessary
  startTransition: StartTransitionFn = (fn) => fn()

  update: UpdateFn<
    TRouteTree,
    TTrailingSlashOption,
    false,
    TRouterHistory,
    TDehydrated
  > = (newOptions) => {
    if (newOptions.notFoundRoute) {
      console.warn(
        'The notFoundRoute API is deprecated and will be removed in the next major version. See https://tanstack.com/router/v1/docs/guide/not-found-errors#migrating-from-notfoundroute for more info.',
      )
    }

    const previousOptions = this.options
    this.options = {
      ...this.options,
      ...newOptions,
    }

    this.isServer = this.options.isServer ?? typeof document === 'undefined'

    this.pathParamsDecodeCharMap = this.options.pathParamsAllowedCharacters
      ? new Map(
          this.options.pathParamsAllowedCharacters.map((char) => [
            encodeURIComponent(char),
            char,
          ]),
        )
      : undefined

    if (
      !this.basepath ||
      (newOptions.basepath && newOptions.basepath !== previousOptions.basepath)
    ) {
      if (
        newOptions.basepath === undefined ||
        newOptions.basepath === '' ||
        newOptions.basepath === '/'
      ) {
        this.basepath = '/'
      } else {
        this.basepath = `/${trimPath(newOptions.basepath)}`
      }
    }

    if (
      !this.history ||
      (this.options.history && this.options.history !== this.history)
    ) {
      this.history =
        this.options.history ??
        ((this.isServer
          ? createMemoryHistory({
              initialEntries: [this.basepath || '/'],
            })
          : createBrowserHistory()) as TRouterHistory)
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
            cachedMatches: this.state.cachedMatches.filter(
              (d) => !['redirected'].includes(d.status),
            ),
          }
        },
      })

      setupScrollRestoration(this)
    }

    if (
      typeof window !== 'undefined' &&
      'CSS' in window &&
      typeof window.CSS?.supports === 'function'
    ) {
      this.isViewTransitionTypesSupported = window.CSS.supports(
        'selector(:active-view-transition-type(a)',
      )
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
      notFoundRoute.init({
        originalIndex: 99999999999,
        defaultSsr: this.options.defaultSsr,
      })
      ;(this.routesById as any)[notFoundRoute.id] = notFoundRoute
    }

    const recurseRoutes = (childRoutes: Array<AnyRoute>) => {
      childRoutes.forEach((childRoute, i) => {
        childRoute.init({
          originalIndex: i,
          defaultSsr: this.options.defaultSsr,
        })

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

        const children = childRoute.children

        if (children?.length) {
          recurseRoutes(children)
        }
      })
    }

    recurseRoutes([this.routeTree])

    const scoredRoutes: Array<{
      child: AnyRoute
      trimmed: string
      parsed: ReturnType<typeof parsePathname>
      index: number
      scores: Array<number>
    }> = []

    const routes: Array<AnyRoute> = Object.values(this.routesById)

    routes.forEach((d, i) => {
      if (d.isRoot || !d.path) {
        return
      }

      const trimmed = trimPathLeft(d.fullPath)
      const parsed = parsePathname(trimmed)

      while (parsed.length > 1 && parsed[0]?.value === '/') {
        parsed.shift()
      }

      const scores = parsed.map((segment) => {
        if (segment.value === '/') {
          return 0.75
        }

        if (segment.type === 'param') {
          return 0.5
        }

        if (segment.type === 'wildcard') {
          return 0.25
        }

        return 1
      })

      scoredRoutes.push({ child: d, trimmed, parsed, index: i, scores })
    })

    this.flatRoutes = scoredRoutes
      .sort((a, b) => {
        const minLength = Math.min(a.scores.length, b.scores.length)

        // Sort by min available score
        for (let i = 0; i < minLength; i++) {
          if (a.scores[i] !== b.scores[i]) {
            return b.scores[i]! - a.scores[i]!
          }
        }

        // Sort by length of score
        if (a.scores.length !== b.scores.length) {
          return b.scores.length - a.scores.length
        }

        // Sort by min available parsed value
        for (let i = 0; i < minLength; i++) {
          if (a.parsed[i]!.value !== b.parsed[i]!.value) {
            return a.parsed[i]!.value > b.parsed[i]!.value ? 1 : -1
          }
        }

        // Sort by original index
        return a.index - b.index
      })
      .map((d, i) => {
        d.child.rank = i
        return d.child
      })
  }

  subscribe: SubscribeFn = (eventType, fn) => {
    const listener: RouterListener<any> = {
      eventType,
      fn,
    }

    this.subscribers.add(listener)

    return () => {
      this.subscribers.delete(listener)
    }
  }

  emit: EmitFn = (routerEvent) => {
    this.subscribers.forEach((listener) => {
      if (listener.eventType === routerEvent.type) {
        listener.fn(routerEvent)
      }
    })
  }

  parseLocation: ParseLocationFn<TRouteTree> = (
    previousLocation,
    locationToParse,
  ) => {
    const parse = ({
      pathname,
      search,
      hash,
      state,
    }: HistoryLocation): ParsedLocation<FullSearchSchema<TRouteTree>> => {
      const parsedSearch = this.options.parseSearch(search)
      const searchStr = this.options.stringifySearch(parsedSearch)

      return {
        pathname,
        searchStr,
        search: replaceEqualDeep(previousLocation?.search, parsedSearch) as any,
        hash: hash.split('#').reverse()[0] ?? '',
        href: `${pathname}${searchStr}${hash}`,
        state: replaceEqualDeep(previousLocation?.state, state),
      }
    }

    const location = parse(locationToParse ?? this.history.location)

    const { __tempLocation, __tempKey } = location.state

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
    const resolvedPath = resolvePath({
      basepath: this.basepath,
      base: from,
      to: cleanPath(path),
      trailingSlash: this.options.trailingSlash,
      caseSensitive: this.options.caseSensitive,
    })
    return resolvedPath
  }

  get looseRoutesById() {
    return this.routesById as Record<string, AnyRoute>
  }

  /**
  @deprecated use the following signature instead
  ```ts
  matchRoutes (
    next: ParsedLocation,
    opts?: { preload?: boolean; throwOnError?: boolean },
  ): Array<AnyRouteMatch>;
  ```
*/

  public matchRoutes: MatchRoutesFn = (
    pathnameOrNext: string | ParsedLocation,
    locationSearchOrOpts?: AnySchema | MatchRoutesOpts,
    opts?: MatchRoutesOpts,
  ) => {
    if (typeof pathnameOrNext === 'string') {
      return this.matchRoutesInternal(
        {
          pathname: pathnameOrNext,
          search: locationSearchOrOpts,
        } as ParsedLocation,
        opts,
      )
    } else {
      return this.matchRoutesInternal(pathnameOrNext, locationSearchOrOpts)
    }
  }

  private matchRoutesInternal(
    next: ParsedLocation,
    opts?: MatchRoutesOpts,
  ): Array<AnyRouteMatch> {
    const { foundRoute, matchedRoutes, routeParams } = this.getMatchedRoutes(
      next,
      opts?.dest,
    )
    let isGlobalNotFound = false

    // Check to see if the route needs a 404 entry
    if (
      // If we found a route, and it's not an index route and we have left over path
      foundRoute
        ? foundRoute.path !== '/' && routeParams['**']
        : // Or if we didn't find a route and we have left over path
          trimPathRight(next.pathname)
    ) {
      // If the user has defined an (old) 404 route, use it
      if (this.options.notFoundRoute) {
        matchedRoutes.push(this.options.notFoundRoute)
      } else {
        // If there is no routes found during path matching
        isGlobalNotFound = true
      }
    }

    const globalNotFoundRouteId = (() => {
      if (!isGlobalNotFound) {
        return undefined
      }

      if (this.options.notFoundMode !== 'root') {
        for (let i = matchedRoutes.length - 1; i >= 0; i--) {
          const route = matchedRoutes[i]!
          if (route.children) {
            return route.id
          }
        }
      }

      return rootRouteId
    })()

    const parseErrors = matchedRoutes.map((route) => {
      let parsedParamsError

      const parseParams =
        route.options.params?.parse ?? route.options.parseParams

      if (parseParams) {
        try {
          const parsedParams = parseParams(routeParams)
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

    const matches: Array<AnyRouteMatch> = []

    const getParentContext = (parentMatch?: AnyRouteMatch) => {
      const parentMatchId = parentMatch?.id

      const parentContext = !parentMatchId
        ? ((this.options.context as any) ?? {})
        : (parentMatch.context ?? this.options.context ?? {})

      return parentContext
    }

    matchedRoutes.forEach((route, index) => {
      // Take each matched route and resolve + validate its search params
      // This has to happen serially because each route's search params
      // can depend on the parent route's search params
      // It must also happen before we create the match so that we can
      // pass the search params to the route's potential key function
      // which is used to uniquely identify the route match in state

      const parentMatch = matches[index - 1]

      const [preMatchSearch, strictMatchSearch, searchError]: [
        Record<string, any>,
        Record<string, any>,
        any,
      ] = (() => {
        // Validate the search params and stabilize them
        const parentSearch = parentMatch?.search ?? next.search
        const parentStrictSearch = parentMatch?._strictSearch ?? {}

        try {
          const strictSearch =
            validateSearch(route.options.validateSearch, { ...parentSearch }) ??
            {}

          return [
            {
              ...parentSearch,
              ...strictSearch,
            },
            { ...parentStrictSearch, ...strictSearch },
            undefined,
          ]
        } catch (err: any) {
          let searchParamError = err
          if (!(err instanceof SearchParamError)) {
            searchParamError = new SearchParamError(err.message, {
              cause: err,
            })
          }

          if (opts?.throwOnError) {
            throw searchParamError
          }

          return [parentSearch, {}, searchParamError]
        }
      })()

      const [preMatchState, strictMatchState, stateError]: [
        Record<string, any>,
        Record<string, any>,
        Error | undefined,
      ] = (() => {
        const rawState = next.state
        const filteredState = Object.fromEntries(
          Object.entries(rawState).filter(
            ([key]) => !(key.startsWith('__') || key === 'key'),
          ),
        )

        try {
          if (route.options.validateState) {
            const strictState =
              validateState(route.options.validateState, filteredState) || {}
            return [
              {
                ...filteredState,
                ...strictState,
              },
              strictState,
              undefined,
            ]
          }
          return [filteredState, {}, undefined]
        } catch (err: any) {
          const stateValidationError = err

          if (opts?.throwOnError) {
            throw stateValidationError
          }

          return [filteredState, {}, stateValidationError]
        }
      })()

      // This is where we need to call route.options.loaderDeps() to get any additional
      // deps that the route's loader function might need to run. We need to do this
      // before we create the match so that we can pass the deps to the route's
      // potential key function which is used to uniquely identify the route match in state

      const loaderDeps =
        route.options.loaderDeps?.({
          search: preMatchSearch,
        }) ?? ''

      const loaderDepsHash = loaderDeps ? JSON.stringify(loaderDeps) : ''

      const { usedParams, interpolatedPath } = interpolatePath({
        path: route.fullPath,
        params: routeParams,
        decodeCharMap: this.pathParamsDecodeCharMap,
      })

      const matchId =
        interpolatePath({
          path: route.id,
          params: routeParams,
          leaveWildcards: true,
          decodeCharMap: this.pathParamsDecodeCharMap,
        }).interpolatedPath + loaderDepsHash

      // Waste not, want not. If we already have a match for this route,
      // reuse it. This is important for layout routes, which might stick
      // around between navigation actions that only change leaf routes.

      // Existing matches are matches that are already loaded along with
      // pending matches that are still loading
      const existingMatch = this.getMatch(matchId)

      const previousMatch = this.state.matches.find(
        (d) => d.routeId === route.id,
      )

      const cause = previousMatch ? 'stay' : 'enter'

      let match: AnyRouteMatch

      if (existingMatch) {
        match = {
          ...existingMatch,
          cause,
          params: previousMatch
            ? replaceEqualDeep(previousMatch.params, routeParams)
            : routeParams,
          _strictParams: usedParams,
          search: previousMatch
            ? replaceEqualDeep(previousMatch.search, preMatchSearch)
            : replaceEqualDeep(existingMatch.search, preMatchSearch),
          _strictSearch: strictMatchSearch,
        }
      } else {
        const status =
          route.options.loader ||
          route.options.beforeLoad ||
          route.lazyFn ||
          routeNeedsPreload(route)
            ? 'pending'
            : 'success'

        match = {
          id: matchId,
          index,
          routeId: route.id,
          params: previousMatch
            ? replaceEqualDeep(previousMatch.params, routeParams)
            : routeParams,
          _strictParams: usedParams,
          pathname: joinPaths([this.basepath, interpolatedPath]),
          updatedAt: Date.now(),
          search: previousMatch
            ? replaceEqualDeep(previousMatch.search, preMatchSearch)
            : preMatchSearch,
          _strictSearch: strictMatchSearch,
          searchError: undefined,
          state: previousMatch
            ? replaceEqualDeep(previousMatch.state, preMatchState)
            : preMatchState,
          _strictState: strictMatchState,
          stateError: undefined,
          status,
          isFetching: false,
          error: undefined,
          paramsError: parseErrors[index],
          __routeContext: {},
          __beforeLoadContext: {},
          context: {},
          abortController: new AbortController(),
          fetchCount: 0,
          cause,
          loaderDeps: previousMatch
            ? replaceEqualDeep(previousMatch.loaderDeps, loaderDeps)
            : loaderDeps,
          invalid: false,
          preload: false,
          links: undefined,
          scripts: undefined,
          headScripts: undefined,
          meta: undefined,
          staticData: route.options.staticData || {},
          loadPromise: createControlledPromise(),
          fullPath: route.fullPath,
        }
      }

      if (!opts?.preload) {
        // If we have a global not found, mark the right match as global not found
        match.globalNotFound = globalNotFoundRouteId === route.id
      }

      // update the searchError if there is one
      match.searchError = searchError

      // update the stateError if there is one
      match.stateError = stateError

      const parentContext = getParentContext(parentMatch)

      match.context = {
        ...parentContext,
        ...match.__routeContext,
        ...match.__beforeLoadContext,
      }

      matches.push(match)
    })

    matches.forEach((match, index) => {
      const route = this.looseRoutesById[match.routeId]!
      const existingMatch = this.getMatch(match.id)

      // only execute `context` if we are not just building a location
      if (!existingMatch && opts?._buildLocation !== true) {
        const parentMatch = matches[index - 1]
        const parentContext = getParentContext(parentMatch)

        // Update the match's context
        const contextFnContext: RouteContextOptions<any, any, any, any> = {
          deps: match.loaderDeps,
          params: match.params,
          context: parentContext,
          location: next,
          navigate: (opts: any) =>
            this.navigate({ ...opts, _fromLocation: next }),
          buildLocation: this.buildLocation,
          cause: match.cause,
          abortController: match.abortController,
          preload: !!match.preload,
          matches,
        }

        // Get the route context
        match.__routeContext = route.options.context?.(contextFnContext) ?? {}

        match.context = {
          ...parentContext,
          ...match.__routeContext,
          ...match.__beforeLoadContext,
        }
      }

      // If it's already a success, update headers and head content
      // These may get updated again if the match is refreshed
      // due to being stale
      if (match.status === 'success') {
        match.headers = route.options.headers?.({
          loaderData: match.loaderData,
        })
        const assetContext = {
          matches,
          match,
          params: match.params,
          loaderData: match.loaderData,
        }
        const headFnContent = route.options.head?.(assetContext)
        match.links = headFnContent?.links
        match.headScripts = headFnContent?.scripts
        match.meta = headFnContent?.meta
        match.scripts = route.options.scripts?.(assetContext)
      }
    })

    return matches
  }

  getMatchedRoutes: GetMatchRoutesFn = (next, dest) => {
    let routeParams: Record<string, string> = {}
    const trimmedPath = trimPathRight(next.pathname)
    const getMatchedParams = (route: AnyRoute) => {
      const result = matchPathname(this.basepath, trimmedPath, {
        to: route.fullPath,
        caseSensitive:
          route.options.caseSensitive ?? this.options.caseSensitive,
        fuzzy: true,
      })
      return result
    }

    let foundRoute: AnyRoute | undefined =
      dest?.to !== undefined ? this.routesByPath[dest.to!] : undefined
    if (foundRoute) {
      routeParams = getMatchedParams(foundRoute)!
    } else {
      foundRoute = this.flatRoutes.find((route) => {
        const matchedParams = getMatchedParams(route)

        if (matchedParams) {
          routeParams = matchedParams
          return true
        }

        return false
      })
    }

    let routeCursor: AnyRoute =
      foundRoute || (this.routesById as any)[rootRouteId]

    const matchedRoutes: Array<AnyRoute> = [routeCursor]

    while (routeCursor.parentRoute) {
      routeCursor = routeCursor.parentRoute
      matchedRoutes.unshift(routeCursor)
    }

    return { matchedRoutes, routeParams, foundRoute }
  }

  cancelMatch = (id: string) => {
    const match = this.getMatch(id)

    if (!match) return

    match.abortController.abort()
    clearTimeout(match.pendingTimeout)
  }

  cancelMatches = () => {
    this.state.pendingMatches?.forEach((match) => {
      this.cancelMatch(match.id)
    })
  }

  buildLocation: BuildLocationFn = (opts) => {
    const build = (
      dest: BuildNextOptions & {
        unmaskOnReload?: boolean
      } = {},
      matchedRoutesResult?: MatchedRoutesResult,
    ): ParsedLocation => {
      const fromMatches = dest._fromLocation
        ? this.matchRoutes(dest._fromLocation, { _buildLocation: true })
        : this.state.matches

      const fromMatch =
        dest.from != null
          ? fromMatches.find((d) =>
              matchPathname(this.basepath, trimPathRight(d.pathname), {
                to: dest.from,
                caseSensitive: false,
                fuzzy: false,
              }),
            )
          : undefined

      const fromPath = fromMatch?.pathname || this.latestLocation.pathname

      invariant(
        dest.from == null || fromMatch != null,
        'Could not find match for from: ' + dest.from,
      )

      const fromSearch = this.state.pendingMatches?.length
        ? last(this.state.pendingMatches)?.search
        : last(fromMatches)?.search || this.latestLocation.search

      const stayingMatches = matchedRoutesResult?.matchedRoutes.filter((d) =>
        fromMatches.find((e) => e.routeId === d.id),
      )
      let pathname: string
      if (dest.to) {
        const resolvePathTo =
          fromMatch?.fullPath ||
          last(fromMatches)?.fullPath ||
          this.latestLocation.pathname
        pathname = this.resolvePathWithBase(resolvePathTo, `${dest.to}`)
      } else {
        const fromRouteByFromPathRouteId =
          this.routesById[
            stayingMatches?.find((route) => {
              const interpolatedPath = interpolatePath({
                path: route.fullPath,
                params: matchedRoutesResult?.routeParams ?? {},
                decodeCharMap: this.pathParamsDecodeCharMap,
              }).interpolatedPath
              const pathname = joinPaths([this.basepath, interpolatedPath])
              return pathname === fromPath
            })?.id as keyof this['routesById']
          ]
        pathname = this.resolvePathWithBase(
          fromPath,
          fromRouteByFromPathRouteId?.to ?? fromPath,
        )
      }

      const prevParams = { ...last(fromMatches)?.params }

      let nextParams =
        (dest.params ?? true) === true
          ? prevParams
          : {
              ...prevParams,
              ...functionalUpdate(dest.params as any, prevParams),
            }

      if (Object.keys(nextParams).length > 0) {
        matchedRoutesResult?.matchedRoutes
          .map((route) => {
            return (
              route.options.params?.stringify ?? route.options.stringifyParams
            )
          })
          .filter(Boolean)
          .forEach((fn) => {
            nextParams = { ...nextParams!, ...fn!(nextParams) }
          })
      }

      pathname = interpolatePath({
        path: pathname,
        params: nextParams ?? {},
        leaveWildcards: false,
        leaveParams: opts.leaveParams,
        decodeCharMap: this.pathParamsDecodeCharMap,
      }).interpolatedPath

      let search = fromSearch
      if (opts._includeValidateSearch && this.options.search?.strict) {
        let validatedSearch = {}
        matchedRoutesResult?.matchedRoutes.forEach((route) => {
          try {
            if (route.options.validateSearch) {
              validatedSearch = {
                ...validatedSearch,
                ...(validateSearch(route.options.validateSearch, {
                  ...validatedSearch,
                  ...search,
                }) ?? {}),
              }
            }
          } catch {
            // ignore errors here because they are already handled in matchRoutes
          }
        })
        search = validatedSearch
      }

      const applyMiddlewares = (search: any) => {
        const allMiddlewares =
          matchedRoutesResult?.matchedRoutes.reduce(
            (acc, route) => {
              const middlewares: Array<SearchMiddleware<any>> = []
              if ('search' in route.options) {
                if (route.options.search?.middlewares) {
                  middlewares.push(...route.options.search.middlewares)
                }
              }
              // TODO remove preSearchFilters and postSearchFilters in v2
              else if (
                route.options.preSearchFilters ||
                route.options.postSearchFilters
              ) {
                const legacyMiddleware: SearchMiddleware<any> = ({
                  search,
                  next,
                }) => {
                  let nextSearch = search
                  if (
                    'preSearchFilters' in route.options &&
                    route.options.preSearchFilters
                  ) {
                    nextSearch = route.options.preSearchFilters.reduce(
                      (prev, next) => next(prev),
                      search,
                    )
                  }
                  const result = next(nextSearch)
                  if (
                    'postSearchFilters' in route.options &&
                    route.options.postSearchFilters
                  ) {
                    return route.options.postSearchFilters.reduce(
                      (prev, next) => next(prev),
                      result,
                    )
                  }
                  return result
                }
                middlewares.push(legacyMiddleware)
              }
              if (opts._includeValidateSearch && route.options.validateSearch) {
                const validate: SearchMiddleware<any> = ({ search, next }) => {
                  const result = next(search)
                  try {
                    const validatedSearch = {
                      ...result,
                      ...(validateSearch(
                        route.options.validateSearch,
                        result,
                      ) ?? {}),
                    }
                    return validatedSearch
                  } catch {
                    // ignore errors here because they are already handled in matchRoutes
                    return result
                  }
                }
                middlewares.push(validate)
              }
              return acc.concat(middlewares)
            },
            [] as Array<SearchMiddleware<any>>,
          ) ?? []

        // the chain ends here since `next` is not called
        const final: SearchMiddleware<any> = ({ search }) => {
          if (!dest.search) {
            return {}
          }
          if (dest.search === true) {
            return search
          }
          return functionalUpdate(dest.search, search)
        }
        allMiddlewares.push(final)

        const applyNext = (index: number, currentSearch: any): any => {
          // no more middlewares left, return the current search
          if (index >= allMiddlewares.length) {
            return currentSearch
          }

          const middleware = allMiddlewares[index]!

          const next = (newSearch: any): any => {
            return applyNext(index + 1, newSearch)
          }

          return middleware({ search: currentSearch, next })
        }

        // Start applying middlewares
        return applyNext(0, search)
      }

      search = applyMiddlewares(search)

      search = replaceEqualDeep(fromSearch, search)
      const searchStr = this.options.stringifySearch(search)

      const hash =
        dest.hash === true
          ? this.latestLocation.hash
          : dest.hash
            ? functionalUpdate(dest.hash, this.latestLocation.hash)
            : undefined

      const hashStr = hash ? `#${hash}` : ''

      let nextState =
        dest.state === true
          ? this.latestLocation.state
          : dest.state
            ? functionalUpdate(dest.state, this.latestLocation.state)
            : {}

      nextState = replaceEqualDeep(this.latestLocation.state, nextState)

      return {
        pathname,
        search,
        searchStr,
        state: nextState as any,
        hash: hash ?? '',
        href: `${pathname}${searchStr}${hashStr}`,
        unmaskOnReload: dest.unmaskOnReload,
      }
    }

    const buildWithMatches = (
      dest: BuildNextOptions = {},
      maskedDest?: BuildNextOptions,
    ) => {
      const next = build(dest)
      let maskedNext = maskedDest ? build(maskedDest) : undefined

      if (!maskedNext) {
        let params = {}

        const foundMask = this.options.routeMasks?.find((d) => {
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
          const { from: _from, ...maskProps } = foundMask
          maskedDest = {
            ...pick(opts, ['from']),
            ...maskProps,
            params,
          }
          maskedNext = build(maskedDest)
        }
      }

      const nextMatches = this.getMatchedRoutes(next, dest)
      const final = build(dest, nextMatches)

      if (maskedNext) {
        const maskedMatches = this.getMatchedRoutes(maskedNext, maskedDest)
        const maskedFinal = build(maskedDest, maskedMatches)
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

  commitLocationPromise: undefined | ControlledPromise<void>

  commitLocation: CommitLocationFn = ({
    viewTransition,
    ignoreBlocker,
    ...next
  }) => {
    const isSameState = () => {
      // the following props are ignored but may still be provided when navigating,
      // temporarily add the previous values to the next state so they don't affect
      // the comparison
      const ignoredProps = [
        'key',
        '__TSR_index',
        '__hashScrollIntoViewOptions',
      ] as const
      ignoredProps.forEach((prop) => {
        ;(next.state as any)[prop] = this.latestLocation.state[prop]
      })
      const isEqual = deepEqual(next.state, this.latestLocation.state)
      ignoredProps.forEach((prop) => {
        delete next.state[prop]
      })
      return isEqual
    }

    const isSameUrl = this.latestLocation.href === next.href

    const previousCommitPromise = this.commitLocationPromise
    this.commitLocationPromise = createControlledPromise<void>(() => {
      previousCommitPromise?.resolve()
    })

    // Don't commit to history if nothing changed
    if (isSameUrl && isSameState()) {
      this.load()
    } else {
      // eslint-disable-next-line prefer-const
      let { maskedLocation, hashScrollIntoView, ...nextHistory } = next

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

      nextHistory.state.__hashScrollIntoViewOptions =
        hashScrollIntoView ?? this.options.defaultHashScrollIntoView ?? true

      this.shouldViewTransition = viewTransition

      this.history[next.replace ? 'replace' : 'push'](
        nextHistory.href,
        nextHistory.state,
        { ignoreBlocker },
      )
    }

    this.resetNextScroll = next.resetScroll ?? true

    if (!this.history.subscribers.size) {
      this.load()
    }

    return this.commitLocationPromise
  }

  buildAndCommitLocation = ({
    replace,
    resetScroll,
    hashScrollIntoView,
    viewTransition,
    ignoreBlocker,
    href,
    ...rest
  }: BuildNextOptions & CommitLocationOptions = {}) => {
    if (href) {
      const currentIndex = this.history.location.state.__TSR_index
      const parsed = parseHref(href, {
        __TSR_index: replace ? currentIndex : currentIndex + 1,
      })
      rest.to = parsed.pathname
      rest.search = this.options.parseSearch(parsed.search)
      // remove the leading `#` from the hash
      rest.hash = parsed.hash.slice(1)
    }

    const location = this.buildLocation({
      ...(rest as any),
      _includeValidateSearch: true,
    })
    return this.commitLocation({
      ...location,
      viewTransition,
      replace,
      resetScroll,
      hashScrollIntoView,
      ignoreBlocker,
    })
  }

  navigate: NavigateFn = ({ to, reloadDocument, href, ...rest }) => {
    if (reloadDocument) {
      if (!href) {
        const location = this.buildLocation({ to, ...rest } as any)
        href = this.history.createHref(location.href)
      }
      if (rest.replace) {
        window.location.replace(href)
      } else {
        window.location.href = href
      }
      return
    }

    return this.buildAndCommitLocation({
      ...rest,
      href,
      to: to as string,
    })
  }

  latestLoadPromise: undefined | Promise<void>

  load: LoadFn = async (opts) => {
    this.latestLocation = this.parseLocation(this.latestLocation)

    let redirect: ResolvedRedirect | undefined
    let notFound: NotFoundError | undefined

    let loadPromise: Promise<void>

    // eslint-disable-next-line prefer-const
    loadPromise = new Promise<void>((resolve) => {
      this.startTransition(async () => {
        try {
          const next = this.latestLocation
          const prevLocation = this.state.resolvedLocation

          // Cancel any pending matches
          this.cancelMatches()

          let pendingMatches!: Array<AnyRouteMatch>

          batch(() => {
            // this call breaks a route context of destination route after a redirect
            // we should be fine not eagerly calling this since we call it later
            // this.clearExpiredCache()

            // Match the routes
            pendingMatches = this.matchRoutes(next)

            // Ingest the new matches
            this.__store.setState((s) => ({
              ...s,
              status: 'pending',
              isLoading: true,
              location: next,
              pendingMatches,
              // If a cached moved to pendingMatches, remove it from cachedMatches
              cachedMatches: s.cachedMatches.filter((d) => {
                return !pendingMatches.find((e) => e.id === d.id)
              }),
            }))
          })

          if (!this.state.redirect) {
            this.emit({
              type: 'onBeforeNavigate',
              ...getLocationChangeInfo({
                resolvedLocation: prevLocation,
                location: next,
              }),
            })
          }

          this.emit({
            type: 'onBeforeLoad',
            ...getLocationChangeInfo({
              resolvedLocation: prevLocation,
              location: next,
            }),
          })

          await this.loadMatches({
            sync: opts?.sync,
            matches: pendingMatches,
            location: next,
            // eslint-disable-next-line @typescript-eslint/require-await
            onReady: async () => {
              // eslint-disable-next-line @typescript-eslint/require-await
              this.startViewTransition(async () => {
                // this.viewTransitionPromise = createControlledPromise<true>()

                // Commit the pending matches. If a previous match was
                // removed, place it in the cachedMatches
                let exitingMatches!: Array<AnyRouteMatch>
                let enteringMatches!: Array<AnyRouteMatch>
                let stayingMatches!: Array<AnyRouteMatch>

                batch(() => {
                  this.__store.setState((s) => {
                    const previousMatches = s.matches
                    const newMatches = s.pendingMatches || s.matches

                    exitingMatches = previousMatches.filter(
                      (match) => !newMatches.find((d) => d.id === match.id),
                    )
                    enteringMatches = newMatches.filter(
                      (match) =>
                        !previousMatches.find((d) => d.id === match.id),
                    )
                    stayingMatches = previousMatches.filter((match) =>
                      newMatches.find((d) => d.id === match.id),
                    )

                    return {
                      ...s,
                      isLoading: false,
                      loadedAt: Date.now(),
                      matches: newMatches,
                      pendingMatches: undefined,
                      cachedMatches: [
                        ...s.cachedMatches,
                        ...exitingMatches.filter((d) => d.status !== 'error'),
                      ],
                    }
                  })
                  this.clearExpiredCache()
                })

                //
                ;(
                  [
                    [exitingMatches, 'onLeave'],
                    [enteringMatches, 'onEnter'],
                    [stayingMatches, 'onStay'],
                  ] as const
                ).forEach(([matches, hook]) => {
                  matches.forEach((match) => {
                    this.looseRoutesById[match.routeId]!.options[hook]?.(match)
                  })
                })
              })
            },
          })
        } catch (err) {
          if (isResolvedRedirect(err)) {
            redirect = err
            if (!this.isServer) {
              this.navigate({
                ...redirect,
                replace: true,
                ignoreBlocker: true,
              })
            }
          } else if (isNotFound(err)) {
            notFound = err
          }

          this.__store.setState((s) => ({
            ...s,
            statusCode: redirect
              ? redirect.statusCode
              : notFound
                ? 404
                : s.matches.some((d) => d.status === 'error')
                  ? 500
                  : 200,
            redirect,
          }))
        }

        if (this.latestLoadPromise === loadPromise) {
          this.commitLocationPromise?.resolve()
          this.latestLoadPromise = undefined
          this.commitLocationPromise = undefined
        }
        resolve()
      })
    })

    this.latestLoadPromise = loadPromise

    await loadPromise

    while (
      (this.latestLoadPromise as any) &&
      loadPromise !== this.latestLoadPromise
    ) {
      await this.latestLoadPromise
    }

    if (this.hasNotFoundMatch()) {
      this.__store.setState((s) => ({
        ...s,
        statusCode: 404,
      }))
    }
  }

  startViewTransition = (fn: () => Promise<void>) => {
    // Determine if we should start a view transition from the navigation
    // or from the router default
    const shouldViewTransition =
      this.shouldViewTransition ?? this.options.defaultViewTransition

    // Reset the view transition flag
    delete this.shouldViewTransition
    // Attempt to start a view transition (or just apply the changes if we can't)
    if (
      shouldViewTransition &&
      typeof document !== 'undefined' &&
      'startViewTransition' in document &&
      typeof document.startViewTransition === 'function'
    ) {
      // lib.dom.ts doesn't support viewTransition types variant yet.
      // TODO: Fix this when dom types are updated
      let startViewTransitionParams: any

      if (
        typeof shouldViewTransition === 'object' &&
        this.isViewTransitionTypesSupported
      ) {
        startViewTransitionParams = {
          update: fn,
          types: shouldViewTransition.types,
        }
      } else {
        startViewTransitionParams = fn
      }

      document.startViewTransition(startViewTransitionParams)
    } else {
      fn()
    }
  }

  updateMatch: UpdateMatchFn = (id, updater) => {
    let updated!: AnyRouteMatch
    const isPending = this.state.pendingMatches?.find((d) => d.id === id)
    const isMatched = this.state.matches.find((d) => d.id === id)
    const isCached = this.state.cachedMatches.find((d) => d.id === id)

    const matchesKey = isPending
      ? 'pendingMatches'
      : isMatched
        ? 'matches'
        : isCached
          ? 'cachedMatches'
          : ''

    if (matchesKey) {
      this.__store.setState((s) => ({
        ...s,
        [matchesKey]: s[matchesKey]?.map((d) =>
          d.id === id ? (updated = updater(d)) : d,
        ),
      }))
    }

    return updated
  }

  getMatch: GetMatchFn = (matchId) => {
    return [
      ...this.state.cachedMatches,
      ...(this.state.pendingMatches ?? []),
      ...this.state.matches,
    ].find((d) => d.id === matchId)
  }

  loadMatches = async ({
    location,
    matches,
    preload: allPreload,
    onReady,
    updateMatch = this.updateMatch,
    sync,
  }: {
    location: ParsedLocation
    matches: Array<AnyRouteMatch>
    preload?: boolean
    onReady?: () => Promise<void>
    updateMatch?: (
      id: string,
      updater: (match: AnyRouteMatch) => AnyRouteMatch,
    ) => void
    getMatch?: (matchId: string) => AnyRouteMatch | undefined
    sync?: boolean
  }): Promise<Array<MakeRouteMatch>> => {
    let firstBadMatchIndex: number | undefined
    let rendered = false

    const triggerOnReady = async () => {
      if (!rendered) {
        rendered = true
        await onReady?.()
      }
    }

    const resolvePreload = (matchId: string) => {
      return !!(allPreload && !this.state.matches.find((d) => d.id === matchId))
    }

    if (!this.isServer && !this.state.matches.length) {
      triggerOnReady()
    }

    const handleRedirectAndNotFound = (match: AnyRouteMatch, err: any) => {
      if (isResolvedRedirect(err)) {
        if (!err.reloadDocument) {
          throw err
        }
      }

      if (isRedirect(err) || isNotFound(err)) {
        updateMatch(match.id, (prev) => ({
          ...prev,
          status: isRedirect(err)
            ? 'redirected'
            : isNotFound(err)
              ? 'notFound'
              : 'error',
          isFetching: false,
          error: err,
          beforeLoadPromise: undefined,
          loaderPromise: undefined,
        }))

        if (!(err as any).routeId) {
          ;(err as any).routeId = match.routeId
        }

        match.beforeLoadPromise?.resolve()
        match.loaderPromise?.resolve()
        match.loadPromise?.resolve()

        if (isRedirect(err)) {
          rendered = true
          err = this.resolveRedirect({ ...err, _fromLocation: location })
          throw err
        } else if (isNotFound(err)) {
          this._handleNotFound(matches, err, {
            updateMatch,
          })
          this.serverSsr?.onMatchSettled({
            router: this,
            match: this.getMatch(match.id)!,
          })
          throw err
        }
      }
    }

    try {
      await new Promise<void>((resolveAll, rejectAll) => {
        ;(async () => {
          try {
            const handleSerialError = (
              index: number,
              err: any,
              routerCode: string,
            ) => {
              const { id: matchId, routeId } = matches[index]!
              const route = this.looseRoutesById[routeId]!

              // Much like suspense, we use a promise here to know if
              // we've been outdated by a new loadMatches call and
              // should abort the current async operation
              if (err instanceof Promise) {
                throw err
              }

              err.routerCode = routerCode
              firstBadMatchIndex = firstBadMatchIndex ?? index
              handleRedirectAndNotFound(this.getMatch(matchId)!, err)

              try {
                route.options.onError?.(err)
              } catch (errorHandlerErr) {
                err = errorHandlerErr
                handleRedirectAndNotFound(this.getMatch(matchId)!, err)
              }

              updateMatch(matchId, (prev) => {
                prev.beforeLoadPromise?.resolve()
                prev.loadPromise?.resolve()

                return {
                  ...prev,
                  error: err,
                  status: 'error',
                  isFetching: false,
                  updatedAt: Date.now(),
                  abortController: new AbortController(),
                  beforeLoadPromise: undefined,
                }
              })
            }

            for (const [index, { id: matchId, routeId }] of matches.entries()) {
              const existingMatch = this.getMatch(matchId)!
              const parentMatchId = matches[index - 1]?.id

              const route = this.looseRoutesById[routeId]!

              const pendingMs =
                route.options.pendingMs ?? this.options.defaultPendingMs

              const shouldPending = !!(
                onReady &&
                !this.isServer &&
                !resolvePreload(matchId) &&
                (route.options.loader || route.options.beforeLoad) &&
                typeof pendingMs === 'number' &&
                pendingMs !== Infinity &&
                (route.options.pendingComponent ??
                  this.options.defaultPendingComponent)
              )

              let executeBeforeLoad = true
              if (
                // If we are in the middle of a load, either of these will be present
                // (not to be confused with `loadPromise`, which is always defined)
                existingMatch.beforeLoadPromise ||
                existingMatch.loaderPromise
              ) {
                if (shouldPending) {
                  setTimeout(() => {
                    try {
                      // Update the match and prematurely resolve the loadMatches promise so that
                      // the pending component can start rendering
                      triggerOnReady()
                    } catch {}
                  }, pendingMs)
                }

                // Wait for the beforeLoad to resolve before we continue
                await existingMatch.beforeLoadPromise
                executeBeforeLoad = this.getMatch(matchId)!.status !== 'success'
              }
              if (executeBeforeLoad) {
                // If we are not in the middle of a load OR the previous load failed, start it
                try {
                  updateMatch(matchId, (prev) => {
                    // explicitly capture the previous loadPromise
                    const prevLoadPromise = prev.loadPromise
                    return {
                      ...prev,
                      loadPromise: createControlledPromise<void>(() => {
                        prevLoadPromise?.resolve()
                      }),
                      beforeLoadPromise: createControlledPromise<void>(),
                    }
                  })
                  const abortController = new AbortController()

                  let pendingTimeout: ReturnType<typeof setTimeout>

                  if (shouldPending) {
                    // If we might show a pending component, we need to wait for the
                    // pending promise to resolve before we start showing that state
                    pendingTimeout = setTimeout(() => {
                      try {
                        // Update the match and prematurely resolve the loadMatches promise so that
                        // the pending component can start rendering
                        triggerOnReady()
                      } catch {}
                    }, pendingMs)
                  }

                  const { paramsError, searchError } = this.getMatch(matchId)!

                  if (paramsError) {
                    handleSerialError(index, paramsError, 'PARSE_PARAMS')
                  }

                  if (searchError) {
                    handleSerialError(index, searchError, 'VALIDATE_SEARCH')
                  }

                  const getParentMatchContext = () =>
                    parentMatchId
                      ? this.getMatch(parentMatchId)!.context
                      : (this.options.context ?? {})

                  updateMatch(matchId, (prev) => ({
                    ...prev,
                    isFetching: 'beforeLoad',
                    fetchCount: prev.fetchCount + 1,
                    abortController,
                    pendingTimeout,
                    context: {
                      ...getParentMatchContext(),
                      ...prev.__routeContext,
                    },
                  }))

                  const { search, params, context, cause } =
                    this.getMatch(matchId)!

                  const preload = resolvePreload(matchId)

                  const beforeLoadFnContext: BeforeLoadContextOptions<
                    any,
                    any,
                    any,
                    any,
                    any
                  > = {
                    search,
                    abortController,
                    params,
                    preload,
                    context,
                    location,
                    navigate: (opts: any) =>
                      this.navigate({ ...opts, _fromLocation: location }),
                    buildLocation: this.buildLocation,
                    cause: preload ? 'preload' : cause,
                    matches,
                  }

                  const beforeLoadContext =
                    (await route.options.beforeLoad?.(beforeLoadFnContext)) ??
                    {}

                  if (
                    isRedirect(beforeLoadContext) ||
                    isNotFound(beforeLoadContext)
                  ) {
                    handleSerialError(index, beforeLoadContext, 'BEFORE_LOAD')
                  }

                  updateMatch(matchId, (prev) => {
                    return {
                      ...prev,
                      __beforeLoadContext: beforeLoadContext,
                      context: {
                        ...getParentMatchContext(),
                        ...prev.__routeContext,
                        ...beforeLoadContext,
                      },
                      abortController,
                    }
                  })
                } catch (err) {
                  handleSerialError(index, err, 'BEFORE_LOAD')
                }

                updateMatch(matchId, (prev) => {
                  prev.beforeLoadPromise?.resolve()

                  return {
                    ...prev,
                    beforeLoadPromise: undefined,
                    isFetching: false,
                  }
                })
              }
            }

            const validResolvedMatches = matches.slice(0, firstBadMatchIndex)
            const matchPromises: Array<Promise<AnyRouteMatch>> = []

            validResolvedMatches.forEach(({ id: matchId, routeId }, index) => {
              matchPromises.push(
                (async () => {
                  const { loaderPromise: prevLoaderPromise } =
                    this.getMatch(matchId)!

                  let loaderShouldRunAsync = false
                  let loaderIsRunningAsync = false

                  if (prevLoaderPromise) {
                    await prevLoaderPromise
                    const match = this.getMatch(matchId)!
                    if (match.error) {
                      handleRedirectAndNotFound(match, match.error)
                    }
                  } else {
                    const parentMatchPromise = matchPromises[index - 1] as any
                    const route = this.looseRoutesById[routeId]!

                    const getLoaderContext = (): LoaderFnContext => {
                      const {
                        params,
                        loaderDeps,
                        abortController,
                        context,
                        cause,
                      } = this.getMatch(matchId)!

                      const preload = resolvePreload(matchId)

                      return {
                        params,
                        deps: loaderDeps,
                        preload: !!preload,
                        parentMatchPromise,
                        abortController: abortController,
                        context,
                        location,
                        navigate: (opts) =>
                          this.navigate({ ...opts, _fromLocation: location }),
                        cause: preload ? 'preload' : cause,
                        route,
                      }
                    }

                    // This is where all of the stale-while-revalidate magic happens
                    const age = Date.now() - this.getMatch(matchId)!.updatedAt

                    const preload = resolvePreload(matchId)

                    const staleAge = preload
                      ? (route.options.preloadStaleTime ??
                        this.options.defaultPreloadStaleTime ??
                        30_000) // 30 seconds for preloads by default
                      : (route.options.staleTime ??
                        this.options.defaultStaleTime ??
                        0)

                    const shouldReloadOption = route.options.shouldReload

                    // Default to reloading the route all the time
                    // Allow shouldReload to get the last say,
                    // if provided.
                    const shouldReload =
                      typeof shouldReloadOption === 'function'
                        ? shouldReloadOption(getLoaderContext())
                        : shouldReloadOption

                    updateMatch(matchId, (prev) => ({
                      ...prev,
                      loaderPromise: createControlledPromise<void>(),
                      preload:
                        !!preload &&
                        !this.state.matches.find((d) => d.id === matchId),
                    }))

                    const runLoader = async () => {
                      try {
                        // If the Matches component rendered
                        // the pending component and needs to show it for
                        // a minimum duration, we''ll wait for it to resolve
                        // before committing to the match and resolving
                        // the loadPromise
                        const potentialPendingMinPromise = async () => {
                          const latestMatch = this.getMatch(matchId)!

                          if (latestMatch.minPendingPromise) {
                            await latestMatch.minPendingPromise
                          }
                        }

                        // Actually run the loader and handle the result
                        try {
                          this.loadRouteChunk(route)

                          updateMatch(matchId, (prev) => ({
                            ...prev,
                            isFetching: 'loader',
                          }))

                          // Kick off the loader!
                          const loaderData =
                            await route.options.loader?.(getLoaderContext())

                          handleRedirectAndNotFound(
                            this.getMatch(matchId)!,
                            loaderData,
                          )

                          // Lazy option can modify the route options,
                          // so we need to wait for it to resolve before
                          // we can use the options
                          await route._lazyPromise

                          await potentialPendingMinPromise()

                          const assetContext = {
                            matches,
                            match: this.getMatch(matchId)!,
                            params: this.getMatch(matchId)!.params,
                            loaderData,
                          }
                          const headFnContent =
                            route.options.head?.(assetContext)
                          const meta = headFnContent?.meta
                          const links = headFnContent?.links
                          const headScripts = headFnContent?.scripts

                          const scripts = route.options.scripts?.(assetContext)
                          const headers = route.options.headers?.({
                            loaderData,
                          })

                          updateMatch(matchId, (prev) => ({
                            ...prev,
                            error: undefined,
                            status: 'success',
                            isFetching: false,
                            updatedAt: Date.now(),
                            loaderData,
                            meta,
                            links,
                            headScripts,
                            headers,
                            scripts,
                          }))
                        } catch (e) {
                          let error = e

                          await potentialPendingMinPromise()

                          handleRedirectAndNotFound(this.getMatch(matchId)!, e)

                          try {
                            route.options.onError?.(e)
                          } catch (onErrorError) {
                            error = onErrorError
                            handleRedirectAndNotFound(
                              this.getMatch(matchId)!,
                              onErrorError,
                            )
                          }

                          updateMatch(matchId, (prev) => ({
                            ...prev,
                            error,
                            status: 'error',
                            isFetching: false,
                          }))
                        }

                        this.serverSsr?.onMatchSettled({
                          router: this,
                          match: this.getMatch(matchId)!,
                        })

                        // Last but not least, wait for the the components
                        // to be preloaded before we resolve the match
                        await route._componentsPromise
                      } catch (err) {
                        updateMatch(matchId, (prev) => ({
                          ...prev,
                          loaderPromise: undefined,
                        }))
                        handleRedirectAndNotFound(this.getMatch(matchId)!, err)
                      }
                    }

                    // If the route is successful and still fresh, just resolve
                    const { status, invalid } = this.getMatch(matchId)!
                    loaderShouldRunAsync =
                      status === 'success' &&
                      (invalid || (shouldReload ?? age > staleAge))
                    if (preload && route.options.preload === false) {
                      // Do nothing
                    } else if (loaderShouldRunAsync && !sync) {
                      loaderIsRunningAsync = true
                      ;(async () => {
                        try {
                          await runLoader()
                          const { loaderPromise, loadPromise } =
                            this.getMatch(matchId)!
                          loaderPromise?.resolve()
                          loadPromise?.resolve()
                          updateMatch(matchId, (prev) => ({
                            ...prev,
                            loaderPromise: undefined,
                          }))
                        } catch (err) {
                          if (isResolvedRedirect(err)) {
                            await this.navigate(err)
                          }
                        }
                      })()
                    } else if (
                      status !== 'success' ||
                      (loaderShouldRunAsync && sync)
                    ) {
                      await runLoader()
                    }
                  }
                  if (!loaderIsRunningAsync) {
                    const { loaderPromise, loadPromise } =
                      this.getMatch(matchId)!
                    loaderPromise?.resolve()
                    loadPromise?.resolve()
                  }

                  updateMatch(matchId, (prev) => ({
                    ...prev,
                    isFetching: loaderIsRunningAsync ? prev.isFetching : false,
                    loaderPromise: loaderIsRunningAsync
                      ? prev.loaderPromise
                      : undefined,
                    invalid: false,
                  }))
                  return this.getMatch(matchId)!
                })(),
              )
            })

            await Promise.all(matchPromises)

            resolveAll()
          } catch (err) {
            rejectAll(err)
          }
        })()
      })
      await triggerOnReady()
    } catch (err) {
      if (isRedirect(err) || isNotFound(err)) {
        if (isNotFound(err) && !allPreload) {
          await triggerOnReady()
        }
        throw err
      }
    }

    return matches
  }

  invalidate: InvalidateFn<this> = (opts) => {
    const invalidate = (d: MakeRouteMatch<TRouteTree>) => {
      if (opts?.filter?.(d as MakeRouteMatchUnion<this>) ?? true) {
        return {
          ...d,
          invalid: true,
          ...(d.status === 'error'
            ? ({ status: 'pending', error: undefined } as const)
            : {}),
        }
      }
      return d
    }

    this.__store.setState((s) => ({
      ...s,
      matches: s.matches.map(invalidate),
      cachedMatches: s.cachedMatches.map(invalidate),
      pendingMatches: s.pendingMatches?.map(invalidate),
    }))

    return this.load({ sync: opts?.sync })
  }

  resolveRedirect = (err: AnyRedirect): ResolvedRedirect => {
    const redirect = err as ResolvedRedirect

    if (!redirect.href) {
      redirect.href = this.buildLocation(redirect as any).href
    }

    return redirect
  }

  clearCache: ClearCacheFn<this> = (opts) => {
    const filter = opts?.filter
    if (filter !== undefined) {
      this.__store.setState((s) => {
        return {
          ...s,
          cachedMatches: s.cachedMatches.filter(
            (m) => !filter(m as MakeRouteMatchUnion<this>),
          ),
        }
      })
    } else {
      this.__store.setState((s) => {
        return {
          ...s,
          cachedMatches: [],
        }
      })
    }
  }

  clearExpiredCache = () => {
    // This is where all of the garbage collection magic happens
    const filter = (d: MakeRouteMatch<TRouteTree>) => {
      const route = this.looseRoutesById[d.routeId]!

      if (!route.options.loader) {
        return true
      }

      // If the route was preloaded, use the preloadGcTime
      // otherwise, use the gcTime
      const gcTime =
        (d.preload
          ? (route.options.preloadGcTime ?? this.options.defaultPreloadGcTime)
          : (route.options.gcTime ?? this.options.defaultGcTime)) ??
        5 * 60 * 1000

      return !(d.status !== 'error' && Date.now() - d.updatedAt < gcTime)
    }
    this.clearCache({ filter })
  }

  loadRouteChunk = (route: AnyRoute) => {
    if (route._lazyPromise === undefined) {
      if (route.lazyFn) {
        route._lazyPromise = route.lazyFn().then((lazyRoute) => {
          // explicitly don't copy over the lazy route's id
          const { id: _id, ...options } = lazyRoute.options
          Object.assign(route.options, options)
        })
      } else {
        route._lazyPromise = Promise.resolve()
      }
    }

    // If for some reason lazy resolves more lazy components...
    // We'll wait for that before pre attempt to preload any
    // components themselves.
    if (route._componentsPromise === undefined) {
      route._componentsPromise = route._lazyPromise.then(() =>
        Promise.all(
          componentTypes.map(async (type) => {
            const component = route.options[type]
            if ((component as any)?.preload) {
              await (component as any).preload()
            }
          }),
        ),
      )
    }
    return route._componentsPromise
  }

  preloadRoute: PreloadRouteFn<
    TRouteTree,
    TTrailingSlashOption,
    false,
    TRouterHistory
  > = async (opts) => {
    const next = this.buildLocation(opts as any)

    let matches = this.matchRoutes(next, {
      throwOnError: true,
      preload: true,
      dest: opts,
    })

    const activeMatchIds = new Set(
      [...this.state.matches, ...(this.state.pendingMatches ?? [])].map(
        (d) => d.id,
      ),
    )

    const loadedMatchIds = new Set([
      ...activeMatchIds,
      ...this.state.cachedMatches.map((d) => d.id),
    ])

    // If the matches are already loaded, we need to add them to the cachedMatches
    batch(() => {
      matches.forEach((match) => {
        if (!loadedMatchIds.has(match.id)) {
          this.__store.setState((s) => ({
            ...s,
            cachedMatches: [...(s.cachedMatches as any), match],
          }))
        }
      })
    })

    try {
      matches = await this.loadMatches({
        matches,
        location: next,
        preload: true,
        updateMatch: (id, updater) => {
          // Don't update the match if it's currently loaded
          if (activeMatchIds.has(id)) {
            matches = matches.map((d) => (d.id === id ? updater(d) : d))
          } else {
            this.updateMatch(id, updater)
          }
        },
      })

      return matches
    } catch (err) {
      if (isRedirect(err)) {
        if (err.reloadDocument) {
          return undefined
        }
        return await this.preloadRoute({
          ...(err as any),
          _fromLocation: next,
        })
      }
      if (!isNotFound(err)) {
        // Preload errors are not fatal, but we should still log them
        console.error(err)
      }
      return undefined
    }
  }

  matchRoute: MatchRouteFn<
    TRouteTree,
    TTrailingSlashOption,
    false,
    TRouterHistory
  > = (location, opts) => {
    const matchLocation = {
      ...location,
      to: location.to
        ? this.resolvePathWithBase(
            (location.from || '') as string,
            location.to as string,
          )
        : undefined,
      params: location.params || {},
      leaveParams: true,
    }
    const next = this.buildLocation(matchLocation as any)

    if (opts?.pending && this.state.status !== 'pending') {
      return false
    }

    const pending =
      opts?.pending === undefined ? !this.state.isLoading : opts.pending

    const baseLocation = pending
      ? this.latestLocation
      : this.state.resolvedLocation || this.state.location

    const match = matchPathname(this.basepath, baseLocation.pathname, {
      ...opts,
      to: next.pathname,
    }) as any

    if (!match) {
      return false
    }
    if (location.params) {
      if (!deepEqual(match, location.params, { partial: true })) {
        return false
      }
    }

    if (match && (opts?.includeSearch ?? true)) {
      return deepEqual(baseLocation.search, next.search, { partial: true })
        ? match
        : false
    }

    return match
  }

  ssr?: {
    manifest: Manifest | undefined
    serializer: StartSerializer
  }

  serverSsr?: {
    injectedHtml: Array<InjectedHtmlEntry>
    injectHtml: (getHtml: () => string | Promise<string>) => Promise<void>
    injectScript: (
      getScript: () => string | Promise<string>,
      opts?: { logScript?: boolean },
    ) => Promise<void>
    streamValue: (key: string, value: any) => void
    streamedKeys: Set<string>
    onMatchSettled: (opts: { router: AnyRouter; match: AnyRouteMatch }) => any
  }

  clientSsr?: {
    getStreamedValue: <T>(key: string) => T | undefined
  }

  _handleNotFound = (
    matches: Array<AnyRouteMatch>,
    err: NotFoundError,
    {
      updateMatch = this.updateMatch,
    }: {
      updateMatch?: (
        id: string,
        updater: (match: AnyRouteMatch) => AnyRouteMatch,
      ) => void
    } = {},
  ) => {
    const matchesByRouteId = Object.fromEntries(
      matches.map((match) => [match.routeId, match]),
    ) as Record<string, AnyRouteMatch>

    // Start at the route that errored or default to the root route
    let routeCursor =
      (err.global
        ? this.looseRoutesById[rootRouteId]
        : this.looseRoutesById[err.routeId]) ||
      this.looseRoutesById[rootRouteId]!

    // Go up the tree until we find a route with a notFoundComponent or we hit the root
    while (
      !routeCursor.options.notFoundComponent &&
      !this.options.defaultNotFoundComponent &&
      routeCursor.id !== rootRouteId
    ) {
      routeCursor = routeCursor.parentRoute

      invariant(
        routeCursor,
        'Found invalid route tree while trying to find not-found handler.',
      )
    }

    const match = matchesByRouteId[routeCursor.id]

    invariant(match, 'Could not find match for route: ' + routeCursor.id)

    // Assign the error to the match

    updateMatch(match.id, (prev) => ({
      ...prev,
      status: 'notFound',
      error: err,
      isFetching: false,
    }))

    if ((err as any).routerCode === 'BEFORE_LOAD' && routeCursor.parentRoute) {
      err.routeId = routeCursor.parentRoute.id
      this._handleNotFound(matches, err, {
        updateMatch,
      })
    }
  }

  hasNotFoundMatch = () => {
    return this.__store.state.matches.some(
      (d) => d.status === 'notFound' || d.globalNotFound,
    )
  }
}

// A function that takes an import() argument which is a function and returns a new function that will
// proxy arguments from the caller to the imported function, retaining all type
// information along the way
export function lazyFn<
  T extends Record<string, (...args: Array<any>) => any>,
  TKey extends keyof T = 'default',
>(fn: () => Promise<T>, key?: TKey) {
  return async (
    ...args: Parameters<T[TKey]>
  ): Promise<Awaited<ReturnType<T[TKey]>>> => {
    const imported = await fn()
    return imported[key || 'default'](...args)
  }
}

export class SearchParamError extends Error {}

export class PathParamError extends Error {}

export function getInitialRouterState(
  location: ParsedLocation,
): RouterState<any> {
  return {
    loadedAt: 0,
    isLoading: false,
    isTransitioning: false,
    status: 'idle',
    resolvedLocation: undefined,
    location,
    matches: [],
    pendingMatches: [],
    cachedMatches: [],
    statusCode: 200,
  }
}
