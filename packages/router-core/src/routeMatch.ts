import { GetFrameworkGeneric } from './frameworks'
import { Route } from './route'
import {
  AnyAllRouteInfo,
  AnyRouteInfo,
  DefaultAllRouteInfo,
  RouteInfo,
} from './routeInfo'
import { AnyRouter } from './router'
import { batch, createStore, Store } from './store'
import { Expand } from './utils'
import { replaceEqualDeep } from './interop'

export interface RouteMatchStore<
  TAllRouteInfo extends AnyAllRouteInfo = DefaultAllRouteInfo,
  TRouteInfo extends AnyRouteInfo = RouteInfo,
> {
  parentMatch?: RouteMatch
  routeSearch: TRouteInfo['searchSchema']
  search: Expand<
    TAllRouteInfo['fullSearchSchema'] & TRouteInfo['fullSearchSchema']
  >
  status: 'idle' | 'loading' | 'success' | 'error'
  updatedAt?: number
  error?: unknown
  invalid: boolean
  loaderData: TRouteInfo['loaderData']
  routeLoaderData: TRouteInfo['routeLoaderData']
  isFetching: boolean
  invalidAt: number
}

export interface RouteMatch<
  TAllRouteInfo extends AnyAllRouteInfo = DefaultAllRouteInfo,
  TRouteInfo extends AnyRouteInfo = RouteInfo,
> extends Route<TAllRouteInfo, TRouteInfo> {
  store: Store<RouteMatchStore<TAllRouteInfo, TRouteInfo>>
  matchId: string
  pathname: string
  params: TRouteInfo['allParams']
  childMatches: RouteMatch[]
  cancel: () => void
  load: (
    loaderOpts?:
      | { preload: true; maxAge: number; gcMaxAge: number }
      | { preload?: false; maxAge?: never; gcMaxAge?: never },
  ) => Promise<TRouteInfo['routeLoaderData']>
  fetch: (opts?: { maxAge?: number }) => Promise<TRouteInfo['routeLoaderData']>
  invalidate: () => Promise<void>
  hasLoaders: () => boolean
  getIsInvalid: () => boolean
  __: {
    updateLoaderData: () => void
    setParentMatch: (parentMatch?: RouteMatch) => void
    onLoad: (listener: () => void) => () => void
    component?: GetFrameworkGeneric<'Component'>
    errorComponent?: GetFrameworkGeneric<'ErrorComponent'>
    pendingComponent?: GetFrameworkGeneric<'Component'>
    loadPromise?: Promise<void>
    onExit?:
      | void
      | ((matchContext: {
          params: TRouteInfo['allParams']
          search: TRouteInfo['fullSearchSchema']
        }) => void)
    abortController: AbortController
    validate: () => void
  }
}

const componentTypes = [
  'component',
  'errorComponent',
  'pendingComponent',
] as const

export function createRouteMatch<
  TAllRouteInfo extends AnyAllRouteInfo = DefaultAllRouteInfo,
  TRouteInfo extends AnyRouteInfo = RouteInfo,
>(
  router: AnyRouter,
  route: Route<TAllRouteInfo, TRouteInfo>,
  opts: {
    parentMatch?: RouteMatch<any, any>
    matchId: string
    params: TRouteInfo['allParams']
    pathname: string
  },
): RouteMatch<TAllRouteInfo, TRouteInfo> {
  let componentsPromise: Promise<void>
  let dataPromise: Promise<TRouteInfo['routeLoaderData']>
  let latestId = ''
  let resolve = () => {}

  function setLoaderData(loaderData: TRouteInfo['routeLoaderData']) {
    batch(() => {
      store.setState((s) => {
        s.routeLoaderData = loaderData
      })
      routeMatch.__.updateLoaderData()
    })
  }

  const store = createStore<RouteMatchStore<TAllRouteInfo, TRouteInfo>>({
    routeSearch: {},
    search: {} as any,
    status: 'idle',
    routeLoaderData: {} as TRouteInfo['routeLoaderData'],
    loaderData: {} as TRouteInfo['loaderData'],
    isFetching: false,
    invalid: false,
    invalidAt: Infinity,
  })

  const loadListeners = new Set<() => void>()

  const routeMatch: RouteMatch<TAllRouteInfo, TRouteInfo> = {
    ...route,
    ...opts,
    store,
    childMatches: [],
    __: {
      updateLoaderData: () => {
        store.setState((s) => {
          s.loaderData = replaceEqualDeep(s.loaderData, {
            ...store.state.parentMatch?.store.state.loaderData,
            ...s.routeLoaderData,
          }) as TRouteInfo['loaderData']
        })
        loadListeners.forEach((listener) => listener())
      },
      setParentMatch: (parentMatch?: RouteMatch) => {
        if (!store.state.parentMatch) {
          store.setState((s) => {
            parentMatch?.__.onLoad(() => {
              routeMatch.__.updateLoaderData()
            })
            s.parentMatch = parentMatch
          })
        }
      },
      onLoad: (listener) => {
        loadListeners.add(listener)
        return () => loadListeners.delete(listener)
      },
      abortController: new AbortController(),
      validate: () => {
        // Validate the search params and stabilize them
        const parentSearch =
          store.state.parentMatch?.store.state.search ??
          router.store.state.latestLocation.search

        try {
          const prevSearch = store.state.routeSearch

          const validator =
            typeof routeMatch.options.validateSearch === 'object'
              ? routeMatch.options.validateSearch.parse
              : routeMatch.options.validateSearch

          let nextSearch = validator?.(parentSearch) ?? {}

          batch(() => {
            // Invalidate route matches when search param stability changes
            if (prevSearch !== nextSearch) {
              store.setState((s) => (s.invalid = true))
            }

            store.setState((s) => {
              s.routeSearch = nextSearch
              s.search = {
                ...parentSearch,
                ...nextSearch,
              }
            })
          })

          componentTypes.map(async (type) => {
            const component = routeMatch.options[type]

            if (typeof routeMatch.__[type] !== 'function') {
              routeMatch.__[type] = component
            }
          })
        } catch (err: any) {
          console.error(err)
          const error = new (Error as any)('Invalid search params found', {
            cause: err,
          })
          error.code = 'INVALID_SEARCH_PARAMS'

          store.setState((s) => {
            s.status = 'error'
            s.error = error
          })

          // Do not proceed with loading the route
          return
        }
      },
    },
    cancel: () => {
      routeMatch.__.abortController?.abort()
    },
    invalidate: async () => {
      store.setState((s) => (s.invalid = true))
      if (
        router.store.state.currentMatches.find(
          (d) => d.matchId === routeMatch.matchId,
        )
      ) {
        await routeMatch.load()
      }
    },
    hasLoaders: () => {
      return !!(
        route.options.loader ||
        componentTypes.some((d) => route.options[d]?.preload)
      )
    },
    getIsInvalid: (): boolean => {
      const now = Date.now()
      return store.state.invalid || store.state.invalidAt < now
    },
    load: async (loaderOpts) => {
      const now = Date.now()
      const minMaxAge = loaderOpts?.preload
        ? Math.max(loaderOpts?.maxAge, loaderOpts?.gcMaxAge)
        : 0

      // If this is a preload, add it to the preload cache
      if (loaderOpts?.preload && minMaxAge > 0) {
        // If the match is currently active, don't preload it
        if (
          router.store.state.currentMatches.find(
            (d) => d.matchId === routeMatch.matchId,
          )
        ) {
          return
        }

        router.store.setState((s) => {
          s.matchCache[routeMatch.matchId] = {
            gc: now + loaderOpts.gcMaxAge,
            match: routeMatch as RouteMatch<any, any>,
          }
        })
      }

      // If the match is invalid, errored or idle, trigger it to load
      if (
        (store.state.status === 'success' && routeMatch.getIsInvalid()) ||
        store.state.status === 'error' ||
        store.state.status === 'idle'
      ) {
        const maxAge = loaderOpts?.preload ? loaderOpts?.maxAge : undefined
        await routeMatch.fetch({ maxAge })
      }
    },
    fetch: async (opts) => {
      routeMatch.__.loadPromise = new Promise(async (_resolve) => {
        const loadId = '' + Date.now() + Math.random()
        latestId = loadId

        const checkLatest = () =>
          loadId !== latestId
            ? routeMatch.__.loadPromise?.then(() => _resolve())
            : undefined

        let latestPromise

        batch(() => {
          // If the match was in an error state, set it
          // to a loading state again. Otherwise, keep it
          // as loading or resolved
          if (store.state.status === 'idle') {
            store.setState((s) => (s.status = 'loading'))
          }

          // We started loading the route, so it's no longer invalid
          store.setState((s) => (s.invalid = false))
        })

        // We are now fetching, even if it's in the background of a
        // resolved state
        store.setState((s) => (s.isFetching = true))
        resolve = _resolve as () => void

        componentsPromise = (async () => {
          // then run all component and data loaders in parallel
          // For each component type, potentially load it asynchronously

          await Promise.all(
            componentTypes.map(async (type) => {
              const component = routeMatch.options[type]

              if (routeMatch.__[type]?.preload) {
                routeMatch.__[type] = await router.options.loadComponent!(
                  component,
                )
              }
            }),
          )
        })()

        dataPromise = Promise.resolve().then(async () => {
          try {
            if (routeMatch.options.loader) {
              const data = await router.loadMatchData(routeMatch)
              if ((latestPromise = checkLatest())) return latestPromise

              setLoaderData(data)
            }

            store.setState((s) => {
              s.error = undefined
              s.status = 'success'
              s.updatedAt = Date.now()
              s.invalidAt =
                s.updatedAt +
                (opts?.maxAge ??
                  routeMatch.options.loaderMaxAge ??
                  router.options.defaultLoaderMaxAge ??
                  0)
            })

            return store.state.routeLoaderData
          } catch (err) {
            if ((latestPromise = checkLatest())) return latestPromise

            if (process.env.NODE_ENV !== 'production') {
              console.error(err)
            }

            store.setState((s) => {
              s.error = err
              s.status = 'error'
              s.updatedAt = Date.now()
            })

            throw err
          }
        })

        const after = async () => {
          if ((latestPromise = checkLatest())) return latestPromise
          store.setState((s) => (s.isFetching = false))
          resolve()
          delete routeMatch.__.loadPromise
        }

        try {
          await Promise.all([componentsPromise, dataPromise.catch(() => {})])
          after()
        } catch {
          after()
        }
      })

      await routeMatch.__.loadPromise
    },
  }

  if (!routeMatch.hasLoaders()) {
    store.setState((s) => (s.status = 'success'))
  }

  return routeMatch
}
