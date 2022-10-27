import {
  CheckRelativePath,
  LinkInfo,
  LinkOptions,
  ResolveRelativePath,
  ToOptions,
} from './link'
import { RouteConfig, RouteOptions } from './routeConfig'
import {
  AnyAllRouteInfo,
  AnyRouteInfo,
  DefaultAllRouteInfo,
  RouteInfo,
  RouteInfoByPath,
} from './routeInfo'
import { RouteMatch } from './routeMatch'
import { Action, ActionState, MatchRouteOptions, Router } from './router'
import { NoInfer, replaceEqualDeep } from './utils'

export interface AnyRoute extends Route<any, any> {}

export interface Route<
  TAllRouteInfo extends AnyAllRouteInfo = DefaultAllRouteInfo,
  TRouteInfo extends AnyRouteInfo = RouteInfo,
> {
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
    options: Omit<LinkOptions<TAllRouteInfo, TRouteInfo['id'], TTo>, 'from'>,
  ) => Promise<void>
  action: unknown extends TRouteInfo['actionResponse']
    ?
        | Action<TRouteInfo['actionPayload'], TRouteInfo['actionResponse']>
        | undefined
    : Action<TRouteInfo['actionPayload'], TRouteInfo['actionResponse']>
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
        pending: [],
        submit: async <T, U>(
          submission: T,
          actionOpts?: { invalidate?: boolean },
        ) => {
          if (!route) {
            return
          }

          const invalidate = actionOpts?.invalidate ?? true

          const actionState: ActionState<T, U> = {
            submittedAt: Date.now(),
            status: 'pending',
            submission,
          }

          action.current = actionState
          action.latest = actionState
          action.pending.push(actionState)

          router.state = {
            ...router.state,
            currentAction: actionState,
            latestAction: actionState,
          }

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
            action.pending = action.pending.filter((d) => d !== actionState)
            router.removeActionQueue.push({ action, actionState })
            router.notify()
          }
        },
      }
      return router.state.actions[id]!
    })()

  let route: Route<TAllRouteInfo, TRouteInfo> = {
    routeId: id,
    routeRouteId: routeId,
    routePath,
    fullPath,
    options,
    router,
    childRoutes: undefined!,
    parentRoute: parent,
    action,

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

export function cascadeLoaderData(matches: RouteMatch<any, any>[]) {
  matches.forEach((match, index) => {
    const parent = matches[index - 1]

    if (parent) {
      match.loaderData = replaceEqualDeep(match.loaderData, {
        ...parent.loaderData,
        ...match.routeLoaderData,
      })
    }
  })
}
