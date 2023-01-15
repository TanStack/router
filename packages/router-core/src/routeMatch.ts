import { boolean } from 'zod'
import { GetFrameworkGeneric } from './frameworks'
import { Route } from './route'
import {
  AnyAllRouteInfo,
  AnyRouteInfo,
  DefaultAllRouteInfo,
  RouteInfo,
} from './routeInfo'
import { AnyRouter, Router } from './router'
import { batch, createStore, SetStoreFunction } from './reactivity'
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
  isInvalid: boolean
  loaderData: TRouteInfo['loaderData']
  routeLoaderData: TRouteInfo['routeLoaderData']
  isFetching: boolean
  invalidAt: number
}

export interface RouteMatch<
  TAllRouteInfo extends AnyAllRouteInfo = DefaultAllRouteInfo,
  TRouteInfo extends AnyRouteInfo = RouteInfo,
> extends Route<TAllRouteInfo, TRouteInfo> {
  store: RouteMatchStore<TAllRouteInfo, TRouteInfo>
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
  __: {
    setStore: SetStoreFunction<RouteMatchStore<TAllRouteInfo, TRouteInfo>>
    setParentMatch: (parentMatch?: RouteMatch) => void
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
      setStore((s) => {
        s.routeLoaderData = loaderData
      })
      updateLoaderData()
    })
  }

  function updateLoaderData() {
    setStore((s) => {
      s.loaderData = replaceEqualDeep(s.loaderData, {
        ...store.parentMatch?.store.loaderData,
        ...s.routeLoaderData,
      }) as TRouteInfo['loaderData']
    })
  }

  const [store, setStore] = createStore<
    RouteMatchStore<TAllRouteInfo, TRouteInfo>
  >({
    routeSearch: {},
    search: {} as any,
    status: 'idle',
    routeLoaderData: {} as TRouteInfo['routeLoaderData'],
    loaderData: {} as TRouteInfo['loaderData'],
    isFetching: false,
    invalid: false,
    invalidAt: Infinity,
    get isInvalid(): boolean {
      const now = Date.now()
      return this.invalid || this.invalidAt < now
    },
  })

  const routeMatch: RouteMatch<TAllRouteInfo, TRouteInfo> = {
    ...route,
    ...opts,
    store,
    childMatches: [],
    __: {
      setStore,
      setParentMatch: (parentMatch?: RouteMatch) => {
        batch(() => {
          if (!store.parentMatch) {
            setStore((s) => {
              s.parentMatch = parentMatch
            })
          }

          updateLoaderData()
        })
      },
      abortController: new AbortController(),
      validate: () => {
        // Validate the search params and stabilize them
        const parentSearch =
          store.parentMatch?.store.search ?? router.store.latestLocation.search

        try {
          const prevSearch = store.routeSearch

          const validator =
            typeof routeMatch.options.validateSearch === 'object'
              ? routeMatch.options.validateSearch.parse
              : routeMatch.options.validateSearch

          let nextSearch = validator?.(parentSearch) ?? {}

          batch(() => {
            // Invalidate route matches when search param stability changes
            if (prevSearch !== nextSearch) {
              setStore((s) => (s.invalid = true))
            }

            setStore((s) => {
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

          setStore((s) => {
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
      setStore((s) => (s.invalid = true))
      if (
        router.store.currentMatches.find(
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
    load: async (loaderOpts) => {
      const now = Date.now()
      const minMaxAge = loaderOpts?.preload
        ? Math.max(loaderOpts?.maxAge, loaderOpts?.gcMaxAge)
        : 0

      // If this is a preload, add it to the preload cache
      if (loaderOpts?.preload && minMaxAge > 0) {
        // If the match is currently active, don't preload it
        if (
          router.store.currentMatches.find(
            (d) => d.matchId === routeMatch.matchId,
          )
        ) {
          return
        }

        router.setStore((s) => {
          s.matchCache[routeMatch.matchId] = {
            gc: now + loaderOpts.gcMaxAge,
            match: routeMatch as RouteMatch<any, any>,
          }
        })
      }

      // If the match is invalid, errored or idle, trigger it to load
      if (
        (store.status === 'success' && store.isInvalid) ||
        store.status === 'error' ||
        store.status === 'idle'
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
          if (store.status === 'idle') {
            setStore((s) => (s.status = 'loading'))
          }

          // We started loading the route, so it's no longer invalid
          setStore((s) => (s.invalid = false))
        })

        // We are now fetching, even if it's in the background of a
        // resolved state
        setStore((s) => (s.isFetching = true))
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

            setStore((s) => {
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

            return store.routeLoaderData
          } catch (err) {
            if ((latestPromise = checkLatest())) return latestPromise

            if (process.env.NODE_ENV !== 'production') {
              console.error(err)
            }

            setStore((s) => {
              s.error = err
              s.status = 'error'
              s.updatedAt = Date.now()
            })

            throw err
          }
        })

        const after = async () => {
          if ((latestPromise = checkLatest())) return latestPromise
          setStore((s) => (s.isFetching = false))
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
    setStore((s) => (s.status = 'success'))
  }

  return routeMatch
}
