import { Store } from '@tanstack/store'
//
import { GetFrameworkGeneric } from './frameworks'
import { AnyRoute, Route } from './route'
import { AnyRoutesInfo, DefaultRoutesInfo } from './routeInfo'
import { AnyRouter, Router } from './router'
import { Expand } from './utils'

export interface RouteMatchStore<
  TRoutesInfo extends AnyRoutesInfo = DefaultRoutesInfo,
  TRoute extends AnyRoute = Route,
> {
  routeSearch: TRoute['__types']['searchSchema']
  search: Expand<
    TRoutesInfo['fullSearchSchema'] & TRoute['__types']['fullSearchSchema']
  >
  status: 'idle' | 'pending' | 'success' | 'error'
  error?: unknown
  updatedAt: number
}

const componentTypes = [
  'component',
  'errorComponent',
  'pendingComponent',
] as const

export class RouteMatch<
  TRoutesInfo extends AnyRoutesInfo = DefaultRoutesInfo,
  TRoute extends AnyRoute = AnyRoute,
> {
  route!: TRoute
  router!: Router<TRoutesInfo['routeTree'], TRoutesInfo>
  store!: Store<RouteMatchStore<TRoutesInfo, TRoute>>
  id!: string
  pathname!: string
  params!: TRoute['__types']['allParams']

  component: GetFrameworkGeneric<'Component'>
  errorComponent: GetFrameworkGeneric<'ErrorComponent'>
  pendingComponent: GetFrameworkGeneric<'Component'>
  abortController = new AbortController()
  onLoaderDataListeners = new Set<() => void>()
  parentMatch?: RouteMatch

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
      store: new Store<RouteMatchStore<TRoutesInfo, TRoute>>({
        updatedAt: 0,
        routeSearch: {},
        search: {} as any,
        status: 'idle',
      }),
    })

    if (!this.#hasLoaders()) {
      this.store.setState((s) => ({
        ...s,
        status: 'success',
      }))
    }
  }

  cancel = () => {
    this.abortController?.abort()
  }

  load = async (opts?: { preload?: boolean }): Promise<void> => {
    // If the match is invalid, errored or idle, trigger it to load
    if (this.store.state.status !== 'pending') {
      await this.fetch(opts)
    }
  }

  #latestId = ''

  fetch = async (opts?: { preload?: boolean }): Promise<void> => {
    this.__loadPromise = Promise.resolve().then(async () => {
      const loadId = '' + Date.now() + Math.random()
      this.#latestId = loadId

      const checkLatest = () => {
        return loadId !== this.#latestId ? this.__loadPromise : undefined
      }

      let latestPromise

      this.store.batch(() => {
        // If the match was in an error state, set it
        // to a loading state again. Otherwise, keep it
        // as loading or resolved
        if (this.store.state.status === 'idle') {
          this.store.setState((s) => ({
            ...s,
            status: 'pending',
          }))
        }
      })

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
            search: this.store.state.search,
            signal: this.abortController.signal,
            preload: !!opts?.preload,
            context: this.route.context,
          })
        }
        return
      })

      try {
        await componentsPromise
        await dataPromise
        if ((latestPromise = checkLatest())) return await latestPromise
        this.store.setState((s) => ({
          ...s,
          error: undefined,
          status: 'success',
          updatedAt: Date.now(),
        }))
      } catch (err) {
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

  #hasLoaders = () => {
    return !!(
      this.route.options.onLoad ||
      componentTypes.some((d) => this.route.options[d]?.preload)
    )
  }

  __setParentMatch = (parentMatch?: RouteMatch) => {
    if (!this.parentMatch && parentMatch) {
      this.parentMatch = parentMatch
    }
  }

  __validate = () => {
    // Validate the search params and stabilize them
    const parentSearch =
      this.parentMatch?.store.state.search ??
      this.router.store.state.latestLocation.search

    try {
      const validator =
        typeof this.route.options.validateSearch === 'object'
          ? this.route.options.validateSearch.parse
          : this.route.options.validateSearch

      let nextSearch = validator?.(parentSearch) ?? {}

      this.store.setState((s) => ({
        ...s,
        routeSearch: nextSearch,
        search: {
          ...parentSearch,
          ...nextSearch,
        } as any,
      }))

      componentTypes.map(async (type) => {
        const component = this.route.options[type]

        if (typeof this[type] !== 'function') {
          this[type] = component
        }
      })
    } catch (err: any) {
      console.error(err)
      const error = new (Error as any)('Invalid search params found', {
        cause: err,
      })
      error.code = 'INVALID_SEARCH_PARAMS'

      this.store.setState((s) => ({
        ...s,
        status: 'error',
        error: error,
      }))

      // Do not proceed with loading the route
      return
    }
  }
}
