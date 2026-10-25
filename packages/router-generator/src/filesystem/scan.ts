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

  checkRouteFilesUsedOnce(new Set([result.rootRouteNode, ...result.routeNodes]))

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

/**
 * A route file is one route: a virtual route config naming a file twice
 * (two `route()` entries, two `physical()` mounts of one directory, a
 * `__virtual.ts` entry for a file the directory scan routes too) is an error
 * naming the file (SPEC J1.7).
 */
function checkRouteFilesUsedOnce(nodes: ReadonlySet<RouteNode>) {
  const routesByFile = new Map<string, Array<string>>()
  for (const node of nodes) {
    if (node.isVirtual || node.isVirtualParentRoute) {
      continue
    }
    const routes = routesByFile.get(node.fullPath) ?? []
    routes.push(node.routePath ?? `/${rootPathId}`)
    routesByFile.set(node.fullPath, routes)
  }
  const reused = [...routesByFile].filter(([, routes]) => routes.length > 1)
  if (reused.length) {
    throw new Error(
      `A route file can be used for one route only. Files used for several routes:\n${reused
        .map(
          ([file, routes]) =>
            ` ${file}: ${routes.map((route) => `"${route}"`).join(', ')}`,
        )
        .join('\n')}\n`,
    )
  }
}
