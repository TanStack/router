import { astTemplate, hole } from '../ast-template'
import type { AnyRoute, AnyRouter } from '@tanstack/router-core'
import type { Expression } from '@yuku-toolchain/types'

type AnyRouteWithPrivateProps = AnyRoute & {
  options: Record<string, unknown>
  parentRoute: AnyRoute
  _lazy?: Promise<void> | true
  update: (options: Record<string, unknown>) => unknown
  _path: string
  _id: string
  _fullPath: string
  _to: string
}

type AnyRouterWithPrivateState = AnyRouter & {
  routesById: Record<string, AnyRoute>
  buildRouteTree: () => Parameters<AnyRouter['setRoutes']>[0]
  setRoutes: AnyRouter['setRoutes']
  _refreshRoute?: () => Promise<void>
  _replaceRouteChunk: (route: AnyRoute, lazyFn: AnyRoute['lazyFn']) => void
}

export type HandleRouteUpdate = (routeId: string, newRoute: AnyRoute) => void

const handleRouteUpdate = astTemplate(
  { stableRouteOptionKeys: hole.literal<Array<string>>() },
  ({ stableRouteOptionKeys }) =>
    function handleRouteUpdate(
      routeId: string,
      newRoute: AnyRouteWithPrivateProps,
    ) {
      const router = window.__TSR_ROUTER__ as AnyRouterWithPrivateState
      const oldRoute = router.routesById[routeId] as
        | AnyRouteWithPrivateProps
        | undefined

      if (!oldRoute) {
        return
      }

      // Generated route-tree options are not present on the freshly imported route
      // module, but they must stay on the live route before rebuilding indexes.
      const generatedRouteOptionKeys = ['id', 'path', 'getParentRoute']
      const generatedRouteOptions: Record<string, unknown> = {}
      generatedRouteOptionKeys.forEach((key) => {
        if (key in oldRoute.options) {
          generatedRouteOptions[key] = oldRoute.options[key]
        }
      })

      // Keys whose identity must remain stable to prevent React from
      // unmounting/remounting the component tree.  React Fast Refresh already
      // handles hot-updating the function bodies of these components — our job
      // is only to update non-component route options (loader, head, etc.).
      // For code-split (splittable) routes, the lazyRouteComponent wrapper is
      // already cached in the bundler hot data so its identity is stable.
      // For unsplittable routes (e.g. root routes), the component is a plain
      // function reference that gets recreated on every module re-execution,
      // so we must explicitly preserve the old reference, unless the route
      // gained or lost its shell component.
      if (
        'shellComponent' in oldRoute.options ===
        'shellComponent' in newRoute.options
      ) {
        stableRouteOptionKeys.forEach((key) => {
          if (key in oldRoute.options && key in newRoute.options) {
            newRoute.options[key] = oldRoute.options[key]
          }
        })
      }

      const nextOptions = {
        ...newRoute.options,
        ...generatedRouteOptions,
      }

      oldRoute.options = nextOptions
      oldRoute.update(nextOptions)
      router._replaceRouteChunk(oldRoute, newRoute.lazyFn)

      router.setRoutes(router.buildRouteTree())
      // routeTree.gen.ts mutates the original module export with generated
      // routing state. Mirror that state onto the fresh HMR export too, so
      // aliased route imports keep working after the module is hot-reloaded.
      newRoute.options = oldRoute.options
      newRoute.parentRoute = oldRoute.parentRoute
      newRoute._path = oldRoute._path
      newRoute._id = oldRoute._id
      newRoute._fullPath = oldRoute._fullPath
      newRoute._to = oldRoute._to
      router.resolvePathCache.clear()
      router._refreshRoute?.()
    },
)

/**
 * The function that patches a live route with the options of its hot-updated
 * module, inserted into route modules.
 */
export function createHandleRouteUpdate(
  stableRouteOptionKeys: Array<string>,
): Expression {
  return handleRouteUpdate({ stableRouteOptionKeys })
}
