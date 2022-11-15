import { GetFrameworkGeneric } from './frameworks'
import { Route } from './route'
import {
  AnyAllRouteInfo,
  AnyRouteInfo,
  DefaultAllRouteInfo,
  RouteInfo,
} from './routeInfo'
import { ActionState, Router } from './router'
import { replaceEqualDeep, Timeout } from './utils'

export interface RouteMatch<
  TAllRouteInfo extends AnyAllRouteInfo = DefaultAllRouteInfo,
  TRouteInfo extends AnyRouteInfo = RouteInfo,
> extends Route<TAllRouteInfo, TRouteInfo> {
  matchId: string
  pathname: string
  params: TRouteInfo['params']
  parentMatch?: RouteMatch
  childMatches: RouteMatch[]
  routeSearch: TRouteInfo['searchSchema']
  search: TRouteInfo['fullSearchSchema']
  status: 'idle' | 'loading' | 'success' | 'error'
  updatedAt?: number
  error?: unknown
  isInvalid: boolean
  getIsInvalid: () => boolean
  loaderData: TRouteInfo['loaderData']
  routeLoaderData: TRouteInfo['routeLoaderData']
  isFetching: boolean
  isPending: boolean
  invalidAt: number
  __: {
    component?: GetFrameworkGeneric<'Component'> // , TRouteInfo['loaderData']>
    errorComponent?: GetFrameworkGeneric<'Component'> // , TRouteInfo['loaderData']>
    pendingComponent?: GetFrameworkGeneric<'Component'> // , TRouteInfo['loaderData']>
    loadPromise?: Promise<void>
    componentsPromise?: Promise<void>
    dataPromise?: Promise<void>
    pendingTimeout?: Timeout
    pendingMinTimeout?: Timeout
    pendingMinPromise?: Promise<void>
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
    startPending: () => void
    cancelPending: () => void
    notify: () => void
    resolve: () => void
  }
  cancel: () => void
  load: (
    loaderOpts?: { withPending?: boolean } & (
      | { preload: true; maxAge: number; gcMaxAge: number }
      | { preload?: false; maxAge?: never; gcMaxAge?: never }
    ),
  ) => Promise<TRouteInfo['routeLoaderData']>
  fetch: (opts?: { maxAge?: number }) => Promise<TRouteInfo['routeLoaderData']>
  invalidate: () => void
  hasLoaders: () => boolean
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
  router: Router<any, any>,
  route: Route<TAllRouteInfo, TRouteInfo>,
  opts: {
    matchId: string
    params: TRouteInfo['allParams']
    pathname: string
  },
): RouteMatch<TAllRouteInfo, TRouteInfo> {
  const routeMatch: RouteMatch<TAllRouteInfo, TRouteInfo> = {
    ...route,
    ...opts,
    router,
    routeSearch: {},
    search: {},
    childMatches: [],
    status: 'idle',
    routeLoaderData: {} as TRouteInfo['routeLoaderData'],
    loaderData: {} as TRouteInfo['loaderData'],
    isPending: false,
    isFetching: false,
    isInvalid: false,
    invalidAt: Infinity,
    // pendingActions: [],
    getIsInvalid: () => {
      const now = Date.now()
      return routeMatch.isInvalid || routeMatch.invalidAt < now
    },
    __: {
      abortController: new AbortController(),
      latestId: '',
      resolve: () => {},
      notify: () => {
        routeMatch.__.resolve()
        routeMatch.router.notify()
      },
      startPending: () => {
        const pendingMs =
          routeMatch.options.pendingMs ?? router.options.defaultPendingMs
        const pendingMinMs =
          routeMatch.options.pendingMinMs ?? router.options.defaultPendingMinMs

        if (
          routeMatch.__.pendingTimeout ||
          routeMatch.status !== 'loading' ||
          typeof pendingMs === 'undefined'
        ) {
          return
        }

        routeMatch.__.pendingTimeout = setTimeout(() => {
          routeMatch.isPending = true
          routeMatch.__.resolve()
          if (typeof pendingMinMs !== 'undefined') {
            routeMatch.__.pendingMinPromise = new Promise(
              (r) =>
                (routeMatch.__.pendingMinTimeout = setTimeout(r, pendingMinMs)),
            )
          }
        }, pendingMs)
      },
      cancelPending: () => {
        routeMatch.isPending = false
        clearTimeout(routeMatch.__.pendingTimeout)
        clearTimeout(routeMatch.__.pendingMinTimeout)
        delete routeMatch.__.pendingMinPromise
      },
      validate: () => {
        // Validate the search params and stabilize them
        const parentSearch =
          routeMatch.parentMatch?.search ?? router.location.search

        try {
          const prevSearch = routeMatch.routeSearch

          const validator =
            typeof routeMatch.options.validateSearch === 'object'
              ? routeMatch.options.validateSearch.parse
              : routeMatch.options.validateSearch

          let nextSearch = replaceEqualDeep(
            prevSearch,
            validator?.(parentSearch) ?? {},
          )

          // Invalidate route matches when search param stability changes
          if (prevSearch !== nextSearch) {
            routeMatch.isInvalid = true
          }

          routeMatch.routeSearch = nextSearch

          routeMatch.search = replaceEqualDeep(parentSearch, {
            ...parentSearch,
            ...nextSearch,
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
          routeMatch.status = 'error'
          routeMatch.error = error
          // Do not proceed with loading the route
          return
        }
      },
    },
    cancel: () => {
      routeMatch.__.abortController?.abort()
      routeMatch.__.cancelPending()
    },
    invalidate: () => {
      routeMatch.isInvalid = true
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
          router.state.matches.find((d) => d.matchId === routeMatch.matchId)
        ) {
          return
        }

        router.matchCache[routeMatch.matchId] = {
          gc: now + loaderOpts.gcMaxAge,
          match: routeMatch as RouteMatch<any, any>,
        }
      }

      // If the match is invalid, errored or idle, trigger it to load
      if (
        (routeMatch.status === 'success' && routeMatch.getIsInvalid()) ||
        routeMatch.status === 'error' ||
        routeMatch.status === 'idle'
      ) {
        const maxAge = loaderOpts?.preload ? loaderOpts?.maxAge : undefined

        await routeMatch.fetch({ maxAge })
      }
    },
    fetch: async (opts) => {
      const id = '' + Date.now() + Math.random()
      routeMatch.__.latestId = id

      // If the match was in an error state, set it
      // to a loading state again. Otherwise, keep it
      // as loading or resolved
      if (routeMatch.status === 'idle') {
        routeMatch.status = 'loading'
      }

      // We started loading the route, so it's no longer invalid
      routeMatch.isInvalid = false

      routeMatch.__.loadPromise = new Promise(async (resolve) => {
        // We are now fetching, even if it's in the background of a
        // resolved state
        routeMatch.isFetching = true
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
              const data = await routeMatch.options.loader({
                params: routeMatch.params,
                search: routeMatch.routeSearch,
                signal: routeMatch.__.abortController.signal,
              })
              if (id !== routeMatch.__.latestId) {
                return routeMatch.__.loadPromise
              }

              routeMatch.routeLoaderData = replaceEqualDeep(
                routeMatch.routeLoaderData,
                data,
              )
            }

            routeMatch.error = undefined
            routeMatch.status = 'success'
            routeMatch.updatedAt = Date.now()
            routeMatch.invalidAt =
              routeMatch.updatedAt +
              (opts?.maxAge ??
                routeMatch.options.loaderMaxAge ??
                router.options.defaultLoaderMaxAge ??
                0)
          } catch (err) {
            if (id !== routeMatch.__.latestId) {
              return routeMatch.__.loadPromise
            }

            if (process.env.NODE_ENV !== 'production') {
              console.error(err)
            }
            routeMatch.error = err
            routeMatch.status = 'error'
            routeMatch.updatedAt = Date.now()
          }
        })

        try {
          await Promise.all([
            routeMatch.__.componentsPromise,
            routeMatch.__.dataPromise,
          ])
          if (id !== routeMatch.__.latestId) {
            return routeMatch.__.loadPromise
          }

          if (routeMatch.__.pendingMinPromise) {
            await routeMatch.__.pendingMinPromise
            delete routeMatch.__.pendingMinPromise
          }
        } finally {
          if (id !== routeMatch.__.latestId) {
            return routeMatch.__.loadPromise
          }
          routeMatch.__.cancelPending()
          routeMatch.isPending = false
          routeMatch.isFetching = false
          routeMatch.__.notify()
        }
      })

      await routeMatch.__.loadPromise

      if (id !== routeMatch.__.latestId) {
        return routeMatch.__.loadPromise
      }

      delete routeMatch.__.loadPromise
    },
  }

  if (!routeMatch.hasLoaders()) {
    routeMatch.status = 'success'
  }

  return routeMatch
}
