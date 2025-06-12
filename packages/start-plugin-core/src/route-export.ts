/**
 * Route information export functionality
 * This file provides functionality to export route information from the start-plugin-core
 * to be consumed by router-plugin for code splitting
 */

let routeNodesInfo: RouteExportInfo | null = null

export interface RouteExportInfo {
  routesDirectory: string
  virtualRouteDirectories: Array<string>
  routes: Record<string, Record<string, unknown>>
}

/**
 * Export route nodes information for router-plugin to use
 */
export function exportRouteNodesInfo(info: RouteExportInfo): void {
  routeNodesInfo = info
  console.log('[TanStack Router] Exported route nodes info')
}

/**
 * Get exported route nodes information
 */
export function getRouteNodesInfo(): RouteExportInfo | null {
  return routeNodesInfo
}

export function isFileInVirtualRouteDirectories(
  filePath: string,
  virtualRouteDirectories: Array<string>,
): boolean {
  if (virtualRouteDirectories.length === 0) {
    return false
  }

  return virtualRouteDirectories.some((dir) =>
    filePath.startsWith(dir.replace(/\\/g, '/')),
  )
}
