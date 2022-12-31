import {
  CheckRelativePath,
  LinkInfo,
  LinkOptions,
  ResolveRelativePath,
  ToOptions,
} from './link'
import { LoaderContext, RouteConfig, RouteOptions } from './routeConfig'
import {
  AnyAllRouteInfo,
  AnyRouteInfo,
  DefaultAllRouteInfo,
  RouteInfo,
  RouteInfoByPath,
} from './routeInfo'
import {
  Action,
  ActionState,
  Loader,
  LoaderState,
  MatchRouteOptions,
  Router,
} from './router'
import { NoInfer } from './utils'
import { createStore } from '@solidjs/reactivity'

export interface AnyRoute extends Route<any, any, any> {}

export interface Route<
  TAllRouteInfo extends AnyAllRouteInfo = DefaultAllRouteInfo,
  TRouteInfo extends AnyRouteInfo = RouteInfo,
  TRouterContext = unknown,
> {
  routeInfo: TRouteInfo
  routeId: TRouteInfo['id']
  routeRouteId: TRouteInfo['routeId']
  routePath: TRouteInfo['path']
  fullPath: TRouteInfo['fullPath']
  parentRoute?: AnyRoute
  childRoutes?: AnyRoute[]
  options: RouteOptions
  originalIndex: number
  router: Router<TAllRouteInfo['routeConfig'], TAllRouteInfo, TRouterContext>
  action: unknown extends TRouteInfo['actionResponse']
    ?
        | Action<TRouteInfo['actionPayload'], TRouteInfo['actionResponse']>
        | undefined
    : Action<TRouteInfo['actionPayload'], TRouteInfo['actionResponse']>
  loader: unknown extends TRouteInfo['routeLoaderData']
    ?
        | Action<
            LoaderContext<
              TRouteInfo['fullSearchSchema'],
              TRouteInfo['allParams']
            >,
            TRouteInfo['routeLoaderData']
          >
        | undefined
    : Loader<
        TRouteInfo['fullSearchSchema'],
        TRouteInfo['allParams'],
        TRouteInfo['routeLoaderData']
      >
  // buildLink: <TTo extends string = '.'>(
  //   options: Omit<
  //     LinkOptions<TAllRouteInfo, TRouteInfo['fullPath'], TTo>,
  //     'from'
  //   >,
  // ) => LinkInfo
  // matchRoute: <
  //   TTo extends string = '.',
  //   TResolved extends string = ResolveRelativePath<TRouteInfo['id'], TTo>,
  // >(
  //   matchLocation: CheckRelativePath<
  //     TAllRouteInfo,
  //     TRouteInfo['fullPath'],
  //     NoInfer<TTo>
  //   > &
  //     Omit<ToOptions<TAllRouteInfo, TRouteInfo['fullPath'], TTo>, 'from'>,
  //   opts?: MatchRouteOptions,
  // ) => RouteInfoByPath<TAllRouteInfo, TResolved>['allParams']
  // navigate: <TTo extends string = '.'>(
  //   options: Omit<
  //     LinkOptions<TAllRouteInfo, TRouteInfo['fullPath'], TTo>,
  //     'from'
  //   >,
  // ) => Promise<void>
}

export function createRoute<
  TAllRouteInfo extends AnyAllRouteInfo = DefaultAllRouteInfo,
  TRouteInfo extends AnyRouteInfo = RouteInfo,
  TRouterContext = unknown,
>(
  routeConfig: RouteConfig,
  options: TRouteInfo['options'],
  originalIndex: number,
  parent: undefined | Route<TAllRouteInfo, any>,
  router: Router<TAllRouteInfo['routeConfig'], TAllRouteInfo, TRouterContext>,
): Route<TAllRouteInfo, TRouteInfo, TRouterContext> {
  const { id, routeId, path: routePath, fullPath } = routeConfig

  let route: Route<TAllRouteInfo, TRouteInfo, TRouterContext> = {
    routeInfo: undefined!,
    routeId: id,
    routeRouteId: routeId,
    originalIndex,
    routePath,
    fullPath,
    options,
    router,
    childRoutes: undefined!,
    parentRoute: parent,
    get action() {
      let action =
        router.store.actions[id] ||
        (() => {
          router.setStore((s) => {
            s.actions[id] = {
              submissions: [],
              submit: async <T, U>(
                submission: T,
                actionOpts?: { invalidate?: boolean; multi?: boolean },
              ) => {
                if (!route) {
                  return
                }

                const invalidate = actionOpts?.invalidate ?? true

                const [actionStore, setActionStore] = createStore<
                  ActionState<T, U>
                >({
                  submittedAt: Date.now(),
                  status: 'pending',
                  submission,
                  isMulti: !!actionOpts?.multi,
                })

                router.setStore((s) => {
                  if (!actionOpts?.multi) {
                    s.actions[id]!.submissions = action.submissions.filter(
                      (d) => d.isMulti,
                    )
                  }

                  s.actions[id]!.current = actionStore
                  s.actions[id]!.latest = actionStore
                  s.actions[id]!.submissions.push(actionStore)
                })

                try {
                  const res = await route.options.action?.(submission)

                  setActionStore((s) => {
                    s.data = res as U
                  })

                  if (invalidate) {
                    router.invalidateRoute({ to: '.', fromCurrent: true })
                    await router.reload()
                  }

                  setActionStore((s) => {
                    s.status = 'success'
                  })

                  return res
                } catch (err) {
                  console.error(err)
                  setActionStore((s) => {
                    s.error = err
                    s.status = 'error'
                  })
                }
              },
            }
          })

          return router.store.actions[id]!
        })()

      return action
    },
    get loader() {
      let loader =
        router.store.loaders[id] ||
        (() => {
          router.setStore((s) => {
            s.loaders[id] = {
              pending: [],
              fetch: (async (loaderContext: LoaderContext<any, any>) => {
                if (!route) {
                  return
                }

                const loaderState: LoaderState<any, any> = {
                  loadedAt: Date.now(),
                  loaderContext,
                }

                router.setStore((s) => {
                  s.loaders[id]!.current = loaderState
                  s.loaders[id]!.latest = loaderState
                  s.loaders[id]!.pending.push(loaderState)
                })

                try {
                  return await route.options.loader?.(loaderContext)
                } finally {
                  router.setStore((s) => {
                    s.loaders[id]!.pending = s.loaders[id]!.pending.filter(
                      (d) => d !== loaderState,
                    )
                  })
                }
              }) as any,
            }
          })

          return router.store.loaders[id]!
        })()

      return loader as any
    },

    // buildLink: (options) => {
    //   return router.buildLink({
    //     ...options,
    //     from: fullPath,
    //   } as any) as any
    // },

    // navigate: (options) => {
    //   return router.navigate({
    //     ...options,
    //     from: fullPath,
    //   } as any) as any
    // },

    // matchRoute: (matchLocation, opts) => {
    //   return router.matchRoute(
    //     {
    //       ...matchLocation,
    //       from: fullPath,
    //     } as any,
    //     opts,
    //   ) as any
    // },
  }

  router.options.createRoute?.({ router, route })

  return route
}
