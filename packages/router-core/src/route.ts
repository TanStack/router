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

export interface AnyRoute extends Route<any, any> {}

export interface Route<
  TAllRouteInfo extends AnyAllRouteInfo = DefaultAllRouteInfo,
  TRouteInfo extends AnyRouteInfo = RouteInfo,
> {
  routeInfo: TRouteInfo
  routeId: TRouteInfo['id']
  routeRouteId: TRouteInfo['routeId']
  routePath: TRouteInfo['path']
  fullPath: TRouteInfo['fullPath']
  parentRoute?: AnyRoute
  childRoutes?: AnyRoute[]
  options: RouteOptions
  router: Router<TAllRouteInfo['routeConfig'], TAllRouteInfo>
  buildLink: <TTo extends string = '.'>(
    options: Omit<
      LinkOptions<TAllRouteInfo, TRouteInfo['fullPath'], TTo>,
      'from'
    >,
  ) => LinkInfo
  matchRoute: <
    TTo extends string = '.',
    TResolved extends string = ResolveRelativePath<TRouteInfo['id'], TTo>,
  >(
    matchLocation: CheckRelativePath<
      TAllRouteInfo,
      TRouteInfo['fullPath'],
      NoInfer<TTo>
    > &
      Omit<ToOptions<TAllRouteInfo, TRouteInfo['fullPath'], TTo>, 'from'>,
    opts?: MatchRouteOptions,
  ) => RouteInfoByPath<TAllRouteInfo, TResolved>['allParams']
  navigate: <TTo extends string = '.'>(
    options: Omit<
      LinkOptions<TAllRouteInfo, TRouteInfo['fullPath'], TTo>,
      'from'
    >,
  ) => Promise<void>
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
}

export function createRoute<
  TAllRouteInfo extends AnyAllRouteInfo = DefaultAllRouteInfo,
  TRouteInfo extends AnyRouteInfo = RouteInfo,
>(
  routeConfig: RouteConfig,
  options: TRouteInfo['options'],
  parent: undefined | Route<TAllRouteInfo, any>,
  router: Router<TAllRouteInfo['routeConfig'], TAllRouteInfo>,
): Route<TAllRouteInfo, TRouteInfo> {
  const { id, routeId, path: routePath, fullPath } = routeConfig

  const action =
    router.state.actions[id] ||
    (() => {
      router.state.actions[id] = {
        submissions: [],
        submit: async <T, U>(
          submission: T,
          actionOpts?: { invalidate?: boolean; multi?: boolean },
        ) => {
          if (!route) {
            return
          }

          const invalidate = actionOpts?.invalidate ?? true

          if (!actionOpts?.multi) {
            action.submissions = action.submissions.filter((d) => d.isMulti)
          }

          const actionState: ActionState<T, U> = {
            submittedAt: Date.now(),
            status: 'pending',
            submission,
            isMulti: !!actionOpts?.multi,
          }

          action.current = actionState
          action.latest = actionState
          action.submissions.push(actionState)

          router.notify()

          try {
            const res = await route.options.action?.(submission)
            actionState.data = res as U

            if (invalidate) {
              router.invalidateRoute({ to: '.', fromCurrent: true })
              await router.reload()
            }
            actionState.status = 'success'
            return res
          } catch (err) {
            console.error(err)
            actionState.error = err
            actionState.status = 'error'
          } finally {
            router.notify()
          }
        },
      }
      return router.state.actions[id]!
    })()

  const loader =
    router.state.loaders[id] ||
    (() => {
      router.state.loaders[id] = {
        pending: [],
        fetch: (async (loaderContext: LoaderContext<any, any>) => {
          if (!route) {
            return
          }

          const loaderState: LoaderState<any, any> = {
            loadedAt: Date.now(),
            loaderContext,
          }

          loader.current = loaderState
          loader.latest = loaderState
          loader.pending.push(loaderState)

          // router.state = {
          //   ...router.state,
          //   currentAction: loaderState,
          //   latestAction: loaderState,
          // }

          router.notify()

          try {
            return await route.options.loader?.(loaderContext)
          } finally {
            loader.pending = loader.pending.filter((d) => d !== loaderState)
            // router.removeActionQueue.push({ loader, loaderState })
            router.notify()
          }
        }) as any,
      }
      return router.state.loaders[id]!
    })()

  let route: Route<TAllRouteInfo, TRouteInfo> = {
    routeInfo: undefined!,
    routeId: id,
    routeRouteId: routeId,
    routePath,
    fullPath,
    options,
    router,
    childRoutes: undefined!,
    parentRoute: parent,
    action,
    loader: loader as any,

    buildLink: (options) => {
      return router.buildLink({
        ...options,
        from: fullPath,
      } as any) as any
    },

    navigate: (options) => {
      return router.navigate({
        ...options,
        from: fullPath,
      } as any) as any
    },

    matchRoute: (matchLocation, opts) => {
      return router.matchRoute(
        {
          ...matchLocation,
          from: fullPath,
        } as any,
        opts,
      )
    },
  }

  router.options.createRoute?.({ router, route })

  return route
}
