import { getRouteModuleId } from '@tanstack/router-core/_internal/route-module'
import type { AnyRoute, AnyRouter } from '@tanstack/router-core'

/** The module id when `route` is the root route of a mounted route module. */
export function getModuleRootId(route: AnyRoute): string | undefined {
  const moduleId = getRouteModuleId(route.id)
  return moduleId !== undefined && route.id === `${moduleId}:`
    ? moduleId
    : undefined
}

export function getModuleRoot(
  router: AnyRouter,
  moduleId: string,
): AnyRoute | undefined {
  return router.routesById[`${moduleId}:`] as AnyRoute | undefined
}

/** The ids of the route modules mounted in the router, in tree order. */
export function getModuleIds(router: AnyRouter): Array<string> {
  const ids: Array<string> = []
  for (const route of Object.values(router.routesById) as Array<AnyRoute>) {
    const moduleId = getModuleRootId(route)
    if (moduleId !== undefined) {
      ids.push(moduleId)
    }
  }
  return ids
}

/** The module that mounts `moduleId`, or `undefined` for the application. */
export function getParentModuleId(
  router: AnyRouter,
  moduleId: string,
): string | undefined {
  let route = getModuleRoot(router, moduleId)?.parentRoute as
    | AnyRoute
    | undefined
  while (route) {
    const parentModuleId = getRouteModuleId(route.id)
    if (parentModuleId !== undefined) {
      return parentModuleId
    }
    route = route.parentRoute as AnyRoute | undefined
  }
  return undefined
}

/** The routes a module owns, without those of modules it mounts. */
export function getModuleRoutes(
  router: AnyRouter,
  moduleId: string,
): Array<AnyRoute> {
  return (Object.values(router.routesById) as Array<AnyRoute>).filter(
    (route) => getRouteModuleId(route.id) === moduleId,
  )
}

/**
 * The path module code uses for a module route: its full path below the
 * module root, wherever the module is mounted.
 */
export function getModuleLocalPath(
  router: AnyRouter,
  route: AnyRoute,
): string | undefined {
  const moduleId = getRouteModuleId(route.id)
  const root =
    moduleId === undefined ? undefined : getModuleRoot(router, moduleId)
  if (!root) {
    return undefined
  }
  const base = root.fullPath.replace(/\/$/, '')
  return route.fullPath.slice(base.length) || '/'
}
