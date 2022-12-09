import { boolean } from 'zod'
import { GetFrameworkGeneric } from './frameworks'
import { Route } from './route'
import {
  AnyAllRouteInfo,
  AnyRouteInfo,
  DefaultAllRouteInfo,
  RouteInfo,
} from './routeInfo'
import { Router } from './router'
import { batch, createMemo, createStore } from '@solidjs/reactivity'
import { Expand, replaceEqualDeep } from './utils'

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
  // setStore: WritableStore<RouteMatchStore<TAllRouteInfo, TRouteInfo>>
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
  invalidate: () => void
  hasLoaders: () => boolean
  __: {
    setParentMatch: (parentMatch?: RouteMatch) => void
    component?: GetFrameworkGeneric<'Component'>
    errorComponent?: GetFrameworkGeneric<'ErrorComponent'>
    pendingComponent?: GetFrameworkGeneric<'Component'>
    loadPromise?: Promise<void>
    componentsPromise?: Promise<void>
    dataPromise?: Promise<TRouteInfo['routeLoaderData']>
    onExit?:
      | void
      | ((matchContext: {
          params: TRouteInfo['allParams']
          search: TRouteInfo['fullSearchSchema']
        }) => void)
    abortController: AbortController
    latestId: string
    // setParentMatch: (parentMatch: RouteMatch) => void
    // addChildMatch: (childMatch: RouteMatch) => void
    validate: () => void
    resolve: () => void
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
  router: Router<any, any, any>,
  route: Route<TAllRouteInfo, TRouteInfo>,
  opts: {
    parentMatch?: RouteMatch<any, any>
    matchId: string
    params: TRouteInfo['allParams']
    pathname: string
  },
): RouteMatch<TAllRouteInfo, TRouteInfo> {
  let cachedLoaderData = {}

  const [store, setStore] = createStore<
    RouteMatchStore<TAllRouteInfo, TRouteInfo>
  >({
    routeSearch: {},
    search: {} as any,
    status: 'idle',
    routeLoaderData: {} as TRouteInfo['routeLoaderData'],
    get loaderData(): TRouteInfo['loaderData'] {
      const cached = replaceEqualDeep(cachedLoaderData, {
        ...store.parentMatch?.store.loaderData,
        ...store.routeLoaderData,
      }) as TRouteInfo['loaderData']

      cachedLoaderData = cached

      return cached
      // return loaderData()
    },
    isFetching: false,
    invalid: false,
    invalidAt: Infinity,
    get isInvalid(): boolean {
      const now = Date.now()
      return this.invalid || this.invalidAt < now
    },
  })

  // const loaderData = createMemo(
  //   () =>
  //     replaceEqualDeep(store.loaderData, {
  //       ...store.parentMatch?.store.loaderData,
  //       ...store.routeLoaderData,
  //     }) as TRouteInfo['loaderData'],
  // )

  const routeMatch: RouteMatch<TAllRouteInfo, TRouteInfo> = {
    ...route,
    ...opts,
    store,
    // setStore,
    router,
    childMatches: [],
    __: {
      setParentMatch: (parentMatch?: RouteMatch) => {
        setStore((s) => {
          s.parentMatch = parentMatch
        })
      },
      abortController: new AbortController(),
      latestId: '',
      resolve: () => {},
      // notify: () => {
      //   routeMatch.router.notify() TODO: ????
      // },
      validate: () => {
        // Validate the search params and stabilize them
        const parentSearch =
          store.parentMatch?.store.search ?? router.store.currentLocation.search

        try {
          const prevSearch = store.routeSearch

          const validator =
            typeof routeMatch.options.validateSearch === 'object'
              ? routeMatch.options.validateSearch.parse
              : routeMatch.options.validateSearch

          let nextSearch = replaceEqualDeep(
            prevSearch,
            validator?.(parentSearch) ?? {},
          )

          batch(() => {
            // Invalidate route matches when search param stability changes
            if (prevSearch !== nextSearch) {
              setStore((s) => (s.invalid = true))
            }

            // TODO: Alright, do we need batch() here?
            setStore((s) => {
              s.routeSearch = nextSearch
              s.search = replaceEqualDeep(parentSearch, {
                ...parentSearch,
                ...nextSearch,
              })
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
    invalidate: () => {
      setStore((s) => (s.invalid = true))
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

        router.store.matchCache[routeMatch.matchId] = {
          gc: now + loaderOpts.gcMaxAge,
          match: routeMatch as RouteMatch<any, any>,
        }
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
      const loadId = '' + Date.now() + Math.random()
      routeMatch.__.latestId = loadId
      const checkLatest = async () => {
        if (loadId !== routeMatch.__.latestId) {
          // warning(true, 'Data loader is out of date!')
          return new Promise(() => {})
        }
      }

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

      routeMatch.__.loadPromise = new Promise(async (resolve) => {
        // We are now fetching, even if it's in the background of a
        // resolved state
        setStore((s) => (s.isFetching = true))
        routeMatch.__.resolve = resolve as () => void

        routeMatch.__.componentsPromise = (async () => {
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

        routeMatch.__.dataPromise = Promise.resolve().then(async () => {
          try {
            if (routeMatch.options.loader) {
              const data = await router.loadMatchData(routeMatch)
              await checkLatest()

              setStore(
                (s) =>
                  (s.routeLoaderData = replaceEqualDeep(
                    store.routeLoaderData,
                    data,
                  )),
              )
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
            await checkLatest()

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
          await checkLatest()
          setStore((s) => (s.isFetching = false))
          delete routeMatch.__.loadPromise
          routeMatch.__.resolve()
        }

        try {
          await Promise.all([
            routeMatch.__.componentsPromise,
            routeMatch.__.dataPromise.catch(() => {}),
          ])
          after()
        } catch {
          after()
        }
      })

      await routeMatch.__.loadPromise
      await checkLatest()
    },
  }

  if (!routeMatch.hasLoaders()) {
    setStore((s) => (s.status = 'success'))
  }

  return routeMatch
}
