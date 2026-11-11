import type { AnyRoute, AnyRouter } from '@tanstack/router-core'

type AnyRouteWithPrivateProps = AnyRoute & {
  options: Record<string, unknown>
  parentRoute: AnyRoute
  _lazy?: Promise<void> | true
  _template?: AnyRouteWithPrivateProps
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

/**
 * Applies a hot update of a route file to the live router. Returns whether
 * the router had an older version of the route to update.
 */
function handleRouteUpdate(
  routeId: string,
  newRoute: AnyRouteWithPrivateProps,
): boolean {
  const router = window.__TSR_ROUTER__ as AnyRouterWithPrivateState
  const oldRoute = router.routesById[routeId] as
    | AnyRouteWithPrivateProps
    | undefined

  // The route of a route module the route tree installs several times is the
  // template of one copy per installation: `<moduleId>#<as>:/…` for
  // `<moduleId>:/…`. The copies are updated, and the template stands in for
  // the live route of the hot export.
  const liveRoutes = oldRoute
    ? [oldRoute]
    : (
        Object.values(router.routesById) as Array<AnyRouteWithPrivateProps>
      ).filter(
        (route) =>
          route._template && route.id.replace(/#[^:]*:/, ':') === routeId,
      )
  const previousRoute = oldRoute ?? liveRoutes[0]?._template

  if (!previousRoute || previousRoute === newRoute) {
    return false
  }

  // Generated route-tree options are not present on the freshly imported route
  // module, but they must stay on the live route before rebuilding indexes.
  const generatedRouteOptionKeys = [
    'id',
    'path',
    'getParentRoute',
    '_module',
    '_uses',
  ]

  const oldHasShellComponent = 'shellComponent' in previousRoute.options
  const newHasShellComponent = 'shellComponent' in newRoute.options
  const preserveComponentIdentity =
    oldHasShellComponent === newHasShellComponent

  // Keys whose identity must remain stable to prevent React from
  // unmounting/remounting the component tree.  React Fast Refresh already
  // handles hot-updating the function bodies of these components — our job
  // is only to update non-component route options (loader, head, etc.).
  // For code-split (splittable) routes, the lazyRouteComponent wrapper is
  // already cached in the bundler hot data so its identity is stable.
  // For unsplittable routes (e.g. root routes), the component is a plain
  // function reference that gets recreated on every module re-execution,
  // so we must explicitly preserve the old reference.
  // Preserve component identity so React doesn't remount.
  // React Fast Refresh patches the function bodies in-place.
  // Installations share their template's components.
  const componentKeys = '__TSR_COMPONENT_TYPES__' as unknown as Array<string>
  if (preserveComponentIdentity) {
    componentKeys.forEach((key) => {
      if (key in previousRoute.options && key in newRoute.options) {
        newRoute.options[key] = previousRoute.options[key]
      }
    })
  }

  const updateRoute = (route: AnyRouteWithPrivateProps) => {
    const nextOptions = { ...newRoute.options }
    generatedRouteOptionKeys.forEach((key) => {
      if (key in route.options) {
        nextOptions[key] = route.options[key]
      }
    })
    route.options = nextOptions
    route.update(nextOptions)
  }

  liveRoutes.forEach((liveRoute) => {
    updateRoute(liveRoute)
    router._replaceRouteChunk(liveRoute, newRoute.lazyFn)
  })
  if (!oldRoute) {
    updateRoute(previousRoute)
  }

  router.setRoutes(router.buildRouteTree())
  syncHotRouteExport(previousRoute)
  if (!oldRoute) {
    liveRoutes.forEach((liveRoute) => {
      liveRoute._template = newRoute
    })
  }
  router.resolvePathCache.clear()
  void router._refreshRoute?.()
  return true

  function syncHotRouteExport(liveRoute: AnyRouteWithPrivateProps) {
    // routeTree.gen.ts mutates the original module export with generated
    // routing state. Mirror that state onto the fresh HMR export too, so
    // aliased route imports keep working after the module is hot-reloaded.
    newRoute.options = liveRoute.options
    newRoute.parentRoute = liveRoute.parentRoute
    newRoute._path = liveRoute._path
    newRoute._id = liveRoute._id
    newRoute._fullPath = liveRoute._fullPath
    newRoute._to = liveRoute._to
  }
}

const handleRouteUpdateStr = handleRouteUpdate.toString()

export function getHandleRouteUpdateCode(stableRouteOptionKeys: Array<string>) {
  return handleRouteUpdateStr.replace(
    /['"]__TSR_COMPONENT_TYPES__['"]/,
    JSON.stringify(stableRouteOptionKeys),
  )
}
