import { Store } from '@tanstack/store'
//
import { GetFrameworkGeneric } from './frameworks'
import { AnyRoute, AnySearchSchema, Route } from './route'
import { AnyRoutesInfo, DefaultRoutesInfo } from './routeInfo'
import { AnyRouter, ParsedLocation, Router } from './router'
import { Expand, pick, replaceEqualDeep } from './utils'

export interface RouteMatchStore<
  TRoutesInfo extends AnyRoutesInfo = DefaultRoutesInfo,
  TRoute extends AnyRoute = Route,
> {
  routeSearch: TRoute['__types']['searchSchema']
  search: TRoutesInfo['fullSearchSchema'] &
    TRoute['__types']['fullSearchSchema']
  status: 'idle' | 'pending' | 'success' | 'error'
  error?: unknown
  updatedAt: number
}

const componentTypes = [
  'component',
  'errorComponent',
  'pendingComponent',
] as const

export interface PendingRouteMatchInfo {
  state: RouteMatchStore<any, any>
  routeContext: {}
  context: {}
}

export interface AnyRouteMatch extends RouteMatch<any, any> {}

export class RouteMatch<
  TRoutesInfo extends AnyRoutesInfo = DefaultRoutesInfo,
  TRoute extends AnyRoute = AnyRoute,
> {
  route!: TRoute
  router!: Router<TRoutesInfo['routeTree'], TRoutesInfo>
  store!: Store<RouteMatchStore<TRoutesInfo, TRoute>>
  state!: RouteMatchStore<TRoutesInfo, TRoute>
  id!: string
  pathname!: string
  params!: TRoute['__types']['allParams']
  routeContext!: TRoute['__types']['routeContext']
  context!: TRoute['__types']['context']

  component: GetFrameworkGeneric<'Component'>
  errorComponent: GetFrameworkGeneric<'ErrorComponent'>
  pendingComponent: GetFrameworkGeneric<'Component'>
  abortController = new AbortController()
  onLoaderDataListeners = new Set<() => void>()
  parentMatch?: RouteMatch
  pendingInfo?: PendingRouteMatchInfo

  __loadPromise?: Promise<void>
  __onExit?:
    | void
    | ((matchContext: {
        params: TRoute['__types']['allParams']
        search: TRoute['__types']['fullSearchSchema']
      }) => void)

  constructor(
    router: AnyRouter,
    route: TRoute,
    opts: {
      id: string
      params: TRoute['__types']['allParams']
      pathname: string
    },
  ) {
    Object.assign(this, {
      route,
      router,
      id: opts.id,
      pathname: opts.pathname,
      params: opts.params,
      store: new Store<RouteMatchStore<TRoutesInfo, TRoute>>(
        {
          updatedAt: 0,
          routeSearch: {},
          search: {} as any,
          status: 'idle',
        },
        {
          onUpdate: (next) => {
            this.state = next
          },
        },
      ),
    })

    this.state = this.store.state

    componentTypes.map(async (type) => {
      const component = this.route.options[type]

      if (typeof this[type] !== 'function') {
        this[type] = component
      }
    })

    if (this.state.status === 'idle' && !this.#hasLoaders()) {
      this.store.setState((s) => ({
        ...s,
        status: 'success',
      }))
    }
  }

  #hasLoaders = () => {
    return !!(
      this.route.options.onLoad ||
      componentTypes.some((d) => this.route.options[d]?.preload)
    )
  }

  __commit = () => {
    const { routeSearch, search, context, routeContext } = this.#resolveInfo({
      location: this.router.state.currentLocation,
    })
    this.context = context
    this.routeContext = routeContext
    this.store.setState((s) => ({
      ...s,
      routeSearch: replaceEqualDeep(s.routeSearch, routeSearch),
      search: replaceEqualDeep(s.search, search),
    }))
  }

  cancel = () => {
    this.abortController?.abort()
  }

  #resolveSearchInfo = (opts: {
    location: ParsedLocation
  }): { routeSearch: {}; search: {} } => {
    // Validate the search params and stabilize them
    const parentSearchInfo = this.parentMatch
      ? this.parentMatch.#resolveSearchInfo(opts)
      : { search: opts.location.search, routeSearch: opts.location.search }

    try {
      const validator =
        typeof this.route.options.validateSearch === 'object'
          ? this.route.options.validateSearch.parse
          : this.route.options.validateSearch

      const routeSearch = validator?.(parentSearchInfo.search) ?? {}

      const search = {
        ...parentSearchInfo.search,
        ...routeSearch,
      }

      return {
        routeSearch,
        search,
      }
    } catch (err: any) {
      this.route.options.onValidateSearchError?.(err)
      const error = new (Error as any)('Invalid search params found', {
        cause: err,
      })
      error.code = 'INVALID_SEARCH_PARAMS'

      throw error
    }
  }

  #resolveInfo = (opts: { location: ParsedLocation }) => {
    const { search, routeSearch } = this.#resolveSearchInfo(opts)

    const routeContext =
      this.route.options.getContext?.({
        parentContext: this.parentMatch?.routeContext ?? {},
        context:
          this.parentMatch?.context ?? this.router?.options.context ?? {},
        params: this.params,
        search,
      }) || ({} as any)

    const context = {
      ...(this.parentMatch?.context ?? this.router?.options.context),
      ...routeContext,
    } as any

    return {
      routeSearch,
      search,
      context,
      routeContext,
    }
  }

  __load = async (opts: {
    parentMatch: RouteMatch | undefined
    preload?: boolean
    location: ParsedLocation
  }): Promise<void> => {
    this.parentMatch = opts.parentMatch

    let info

    try {
      info = this.#resolveInfo(opts)
    } catch (err) {
      this.route.options.onError?.(err)

      this.store.setState((s) => ({
        ...s,
        status: 'error',
        error: err,
      }))

      // Do not proceed with loading the route
      return
    }

    const { routeSearch, search, context, routeContext } = info

    // If the match is invalid, errored or idle, trigger it to load
    if (this.state.status === 'pending') {
      return
    }

    // TODO: Should load promises be tracked based on location?
    this.__loadPromise = Promise.resolve().then(async () => {
      const loadId = '' + Date.now() + Math.random()
      this.#latestId = loadId

      const checkLatest = () => {
        return loadId !== this.#latestId ? this.__loadPromise : undefined
      }

      let latestPromise

      // If the match was in an error state, set it
      // to a loading state again. Otherwise, keep it
      // as loading or resolved
      if (this.state.status === 'idle') {
        this.store.setState((s) => ({
          ...s,
          status: 'pending',
        }))
      }

      const componentsPromise = (async () => {
        // then run all component and data loaders in parallel
        // For each component type, potentially load it asynchronously

        await Promise.all(
          componentTypes.map(async (type) => {
            const component = this.route.options[type]

            if (this[type]?.preload) {
              this[type] = await this.router.options.loadComponent!(component)
            }
          }),
        )
      })()

      const dataPromise = Promise.resolve().then(() => {
        if (this.route.options.onLoad) {
          return this.route.options.onLoad({
            params: this.params,
            routeSearch,
            search,
            signal: this.abortController.signal,
            preload: !!opts?.preload,
            routeContext: routeContext,
            context: context,
          })
        }
        return
      })

      try {
        await Promise.all([componentsPromise, dataPromise])
        if ((latestPromise = checkLatest())) return await latestPromise
        this.store.setState((s) => ({
          ...s,
          error: undefined,
          status: 'success',
          updatedAt: Date.now(),
        }))
      } catch (err) {
        this.route.options.onLoadError?.(err)
        this.route.options.onError?.(err)
        this.store.setState((s) => ({
          ...s,
          error: err,
          status: 'error',
          updatedAt: Date.now(),
        }))
      } finally {
        delete this.__loadPromise
      }
    })

    return this.__loadPromise
  }

  #latestId = ''
}
