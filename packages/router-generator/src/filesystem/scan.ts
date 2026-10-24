import path from 'node:path'
import { createTokenRegex, replaceBackslash } from '../utils'
import { getRouteNodes as physicalGetRouteNodes } from './physical/getRouteNodes'
import { getRouteNodes as virtualGetRouteNodes } from './virtual/getRouteNodes'
import { rootPathId } from './physical/rootPathId'
import type { Config } from '../config'
import type { RouteNode } from '../types'

/** What one scan of the routes found. Immutable once returned. */
export interface ScanResult {
  rootRouteNode: RouteNode
  /** Every route file and file-less virtual route but the root route. */
  routeNodes: ReadonlyArray<RouteNode>
  /** The directories `physical()` mounts scan (absolute, `/`-separated). */
  physicalDirectories: ReadonlyArray<string>
}

/**
 * Scans the routes directory (or the virtual route config): which route
 * files exist and which route each one is, by the routing conventions.
 * Virtual route config modules are evaluated anew on every scan.
 */
export async function scanRoutes(
  config: Config,
  root: string,
): Promise<ScanResult> {
  const tokenRegexes = {
    indexTokenSegmentRegex: createTokenRegex(config.indexToken, {
      type: 'segment',
    }),
    routeTokenSegmentRegex: createTokenRegex(config.routeToken, {
      type: 'segment',
    }),
  }
  const result = config.virtualRouteConfig
    ? await virtualGetRouteNodes(config, root, tokenRegexes)
    : await physicalGetRouteNodes(config, root, tokenRegexes)

  if (result.rootRouteNode === undefined) {
    let errorMessage = `rootRouteNode must not be undefined. Make sure you've added your root route into the route-tree.`
    if (!config.virtualRouteConfig) {
      errorMessage += `\nMake sure that you add a "${rootPathId}.${config.disableTypes ? 'js' : 'tsx'}" file to your routes directory.\nAdd the file in: "${config.routesDirectory}/${rootPathId}.${config.disableTypes ? 'js' : 'tsx'}"`
    }
    throw new Error(errorMessage)
  }

  return {
    rootRouteNode: result.rootRouteNode,
    routeNodes: result.routeNodes,
    physicalDirectories: [
      ...new Set(
        result.physicalDirectories.map((dir) =>
          replaceBackslash(path.resolve(dir)),
        ),
      ),
    ].sort(),
  }
}
