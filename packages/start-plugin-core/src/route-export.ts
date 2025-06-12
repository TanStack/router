/**
 * Route information export functionality
 * This file provides functionality to export route information from the start-plugin-core
 * to be consumed by router-plugin for code splitting
 */

let routeNodesInfo: RouteExportInfo | null = null

export interface RouteExportInfo {
  routesDirectory: string
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


