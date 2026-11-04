import path from 'node:path'
import { createTokenRegex, removeExt, replaceBackslash } from '../utils'
import {
  isRootRouteFile,
  getRouteNodes as physicalGetRouteNodes,
} from './physical/getRouteNodes'
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

  // A root route file is no route of the tree but its root: the routes
  // directory's own (a `physical()` mount's, beside the virtual root route
  // file it may be) or one in a `__root/` directory beside it.
  const routeNodes = result.routeNodes.filter((node) => !isRootRouteFile(node))
  checkRouteFilesUsedOnce(
    [result.rootRouteNode, ...routeNodes],
    config.addExtensions,
  )

  return {
    rootRouteNode: result.rootRouteNode,
    routeNodes,
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
 * naming the file (SPEC J1.7). The route tree imports a file by its path
 * without the extension (unless `addExtensions` keeps it), so two files
 * that differ only by their extension are one module: used for two routes,
 * they are an error naming both files. (Two such files of ONE route are
 * left to the route uniqueness check.)
 */
function checkRouteFilesUsedOnce(
  nodes: ReadonlyArray<RouteNode>,
  addExtensions: Config['addExtensions'],
) {
  const usesByModule = new Map<string, Array<{ file: string; route: string }>>()
  for (const node of nodes) {
    if (node.isVirtual || node.isVirtualParentRoute) {
      continue
    }
    const module = removeExt(node.fullPath, addExtensions)
    const uses = usesByModule.get(module) ?? []
    uses.push({
      file: node.fullPath,
      route: node.routePath ?? `/${rootPathId}`,
    })
    usesByModule.set(module, uses)
  }
  const reused = [...usesByModule.values()].filter(
    (uses) =>
      new Set(uses.map(({ file }) => file)).size < uses.length ||
      new Set(uses.map(({ route }) => route)).size > 1,
  )
  if (reused.length) {
    const lines = reused.flatMap((uses) => {
      const routesByFile = new Map<string, Array<string>>()
      for (const { file, route } of uses) {
        routesByFile.set(file, [...(routesByFile.get(file) ?? []), route])
      }
      return [...routesByFile].map(
        ([file, routes]) =>
          ` ${file}: ${routes.map((route) => `"${route}"`).join(', ')}`,
      )
    })
    throw new Error(
      `A route file can be used for one route only (files differing only by their extension are imported as one module). Files used for several routes:\n${lines.join('\n')}\n`,
    )
  }
}
