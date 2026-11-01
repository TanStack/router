import {
  getInstalledRouteModuleDirectories,
  resolveRouteModuleContext,
} from '@tanstack/router-generator'
import type { RouteModulesOption } from '@tanstack/router-generator'

/**
 * Package roots of the route modules an application installs. Start treats
 * their files as application source (import protection, entries).
 *
 * Composition errors are reported by the route generation; here a broken or
 * missing module simply contributes no directory.
 */
export function getRouteModuleDirectories(
  root: string,
  routeModules: RouteModulesOption | undefined,
): Array<string> {
  try {
    return getInstalledRouteModuleDirectories(
      resolveRouteModuleContext({ root, routeModules }),
    )
  } catch {
    return []
  }
}
