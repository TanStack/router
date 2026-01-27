import path, { join, resolve } from 'node:path'
import {
  determineInitialRoutePath,
  removeExt,
  removeLeadingSlash,
  removeTrailingSlash,
  replaceBackslash,
  routePathToVariable,
} from '../../utils'
import { getRouteNodes as getRouteNodesPhysical } from '../physical/getRouteNodes'
import { rootPathId } from '../physical/rootPathId'
import { virtualRootRouteSchema } from './config'
import { loadConfigFile } from './loadConfigFile'
import type {
  VirtualRootRoute,
  VirtualRouteNode,
} from '@tanstack/virtual-file-routes'
import type { GetRouteNodesResult, RouteNode } from '../../types'
import type { Config } from '../../config'
import type { TokenRegexBundle } from '../physical/getRouteNodes'

function ensureLeadingUnderScore(id: string) {
  if (id.startsWith('_')) {
    return id
  }
  return `_${id}`
}

function flattenTree(
  node: RouteNode,
  parentRoutePath?: string,
): Array<RouteNode> {
  // Store the explicit parent's routePath for virtual routes.
  // This prevents the generator from auto-nesting based on path matching (#5822).
  //
  // Skip when the parent is the synthetic virtual root (`/${rootPathId}`).
  // Root-level nodes should use path-based inference to find their parent.
  const isRootParent = parentRoutePath === `/${rootPathId}`
  if (parentRoutePath !== undefined && !isRootParent) {
    node._virtualParentRoutePath = parentRoutePath
  }

  const result = [node]

  if (node.children) {
    for (const child of node.children) {
      result.push(...flattenTree(child, node.routePath))
    }
  }
  delete node.children

  return result
}

export async function getRouteNodes(
  tsrConfig: Pick<
    Config,
    | 'routesDirectory'
    | 'virtualRouteConfig'
    | 'routeFileIgnorePrefix'
    | 'disableLogging'
    | 'indexToken'
    | 'routeToken'
  >,
  root: string,
  tokenRegexes: TokenRegexBundle,
): Promise<GetRouteNodesResult> {
  const fullDir = resolve(tsrConfig.routesDirectory)
  if (tsrConfig.virtualRouteConfig === undefined) {
    throw new Error(`virtualRouteConfig is undefined`)
  }
  let virtualRouteConfig: VirtualRootRoute
  if (typeof tsrConfig.virtualRouteConfig === 'string') {
    virtualRouteConfig = await getVirtualRouteConfigFromFileExport(
      tsrConfig,
      root,
    )
  } else {
    virtualRouteConfig = tsrConfig.virtualRouteConfig
  }
  const { children, physicalDirectories } = await getRouteNodesRecursive(
    tsrConfig,
    root,
    fullDir,
    virtualRouteConfig.children,
    tokenRegexes,
  )
  const allNodes = flattenTree({
    children,
    filePath: virtualRouteConfig.file,
    fullPath: replaceBackslash(join(fullDir, virtualRouteConfig.file)),
    variableName: 'root',
    routePath: `/${rootPathId}`,
    _fsRouteType: '__root',
  })

  const rootRouteNode = allNodes[0]
  const routeNodes = allNodes.slice(1)

  return { rootRouteNode, routeNodes, physicalDirectories }
}

/**
 * Get the virtual route config from a file export
 *
 * @example
 * ```ts
 * // routes.ts
 * import { rootRoute } from '@tanstack/virtual-file-routes'
 *
 * export const routes = rootRoute({ ... })
 * // or
 * export default rootRoute({ ... })
 * ```
 *
 */
async function getVirtualRouteConfigFromFileExport(
  tsrConfig: Pick<Config, 'virtualRouteConfig'>,
  root: string,
): Promise<VirtualRootRoute> {
  if (
    tsrConfig.virtualRouteConfig === undefined ||
    typeof tsrConfig.virtualRouteConfig !== 'string' ||
    tsrConfig.virtualRouteConfig === ''
  ) {
    throw new Error(`virtualRouteConfig is undefined or empty`)
  }
  const exports = await loadConfigFile(join(root, tsrConfig.virtualRouteConfig))

  if (!('routes' in exports) && !('default' in exports)) {
    throw new Error(
      `routes not found in ${tsrConfig.virtualRouteConfig}. The routes export must be named like 'export const routes = ...' or done using 'export default ...'`,
    )
  }

  const virtualRouteConfig =
    'routes' in exports ? exports.routes : exports.default

  return virtualRootRouteSchema.parse(virtualRouteConfig)
}

export async function getRouteNodesRecursive(
  tsrConfig: Pick<
    Config,
    | 'routesDirectory'
    | 'routeFileIgnorePrefix'
    | 'disableLogging'
    | 'indexToken'
    | 'routeToken'
  >,
  root: string,
  fullDir: string,
  nodes: Array<VirtualRouteNode> | undefined,
  tokenRegexes: TokenRegexBundle,
  parent?: RouteNode,
): Promise<{ children: Array<RouteNode>; physicalDirectories: Array<string> }> {
  if (nodes === undefined) {
    return { children: [], physicalDirectories: [] }
  }
  const allPhysicalDirectories: Array<string> = []
  const children = await Promise.all(
    nodes.map(async (node) => {
      if (node.type === 'physical') {
        const { routeNodes, physicalDirectories } = await getRouteNodesPhysical(
          {
            ...tsrConfig,
            routesDirectory: resolve(fullDir, node.directory),
          },
          root,
          tokenRegexes,
        )
        allPhysicalDirectories.push(
          resolve(fullDir, node.directory),
          ...physicalDirectories,
        )
        routeNodes.forEach((subtreeNode) => {
          subtreeNode.variableName = routePathToVariable(
            `${node.pathPrefix}/${removeExt(subtreeNode.filePath)}`,
          )
          subtreeNode.routePath = `${parent?.routePath ?? ''}${node.pathPrefix}${subtreeNode.routePath}`
          // Keep originalRoutePath aligned with routePath for escape detection
          if (subtreeNode.originalRoutePath) {
            subtreeNode.originalRoutePath = `${parent?.routePath ?? ''}${node.pathPrefix}${subtreeNode.originalRoutePath}`
          }
          subtreeNode.filePath = `${node.directory}/${subtreeNode.filePath}`
        })
        return routeNodes
      }

      function getFile(file: string) {
        const filePath = file
        const variableName = routePathToVariable(removeExt(filePath))
        const fullPath = replaceBackslash(join(fullDir, filePath))
        return { filePath, variableName, fullPath }
      }
      const parentRoutePath = removeTrailingSlash(parent?.routePath ?? '/')

      switch (node.type) {
        case 'index': {
          const { filePath, variableName, fullPath } = getFile(node.file)
          const routePath = `${parentRoutePath}/`
          return {
            filePath,
            fullPath,
            variableName,
            routePath,
            _fsRouteType: 'static',
          } satisfies RouteNode
        }

        case 'route': {
          const lastSegment = node.path
          let routeNode: RouteNode

          // Process the segment to handle escape sequences like [_]
          const {
            routePath: escapedSegment,
            originalRoutePath: originalSegment,
          } = determineInitialRoutePath(removeLeadingSlash(lastSegment))
          const routePath = `${parentRoutePath}${escapedSegment}`
          // Store the original path with brackets for escape detection
          const originalRoutePath = `${parentRoutePath}${originalSegment}`

          if (node.file) {
            const { filePath, variableName, fullPath } = getFile(node.file)
            routeNode = {
              filePath,
              fullPath,
              variableName,
              routePath,
              originalRoutePath,
              _fsRouteType: 'static',
            }
          } else {
            routeNode = {
              filePath: '',
              fullPath: '',
              variableName: routePathToVariable(routePath),
              routePath,
              originalRoutePath,
              isVirtual: true,
              _fsRouteType: 'static',
            }
          }

          if (node.children !== undefined) {
            const { children, physicalDirectories } =
              await getRouteNodesRecursive(
                tsrConfig,
                root,
                fullDir,
                node.children,
                tokenRegexes,
                routeNode,
              )
            routeNode.children = children
            allPhysicalDirectories.push(...physicalDirectories)

            // If the route has children, it should be a layout
            routeNode._fsRouteType = 'layout'
          }
          return routeNode
        }
        case 'layout': {
          const { filePath, variableName, fullPath } = getFile(node.file)

          if (node.id !== undefined) {
            node.id = ensureLeadingUnderScore(node.id)
          } else {
            const baseName = path.basename(filePath)
            const fileNameWithoutExt = path.parse(baseName).name
            node.id = ensureLeadingUnderScore(fileNameWithoutExt)
          }
          const lastSegment = node.id
          // Process the segment to handle escape sequences like [_]
          const {
            routePath: escapedSegment,
            originalRoutePath: originalSegment,
          } = determineInitialRoutePath(removeLeadingSlash(lastSegment))
          const routePath = `${parentRoutePath}${escapedSegment}`
          // Store the original path with brackets for escape detection
          const originalRoutePath = `${parentRoutePath}${originalSegment}`

          const routeNode: RouteNode = {
            fullPath,
            filePath,
            variableName,
            routePath,
            originalRoutePath,
            _fsRouteType: 'pathless_layout',
          }

          if (node.children !== undefined) {
            const { children, physicalDirectories } =
              await getRouteNodesRecursive(
                tsrConfig,
                root,
                fullDir,
                node.children,
                tokenRegexes,
                routeNode,
              )
            routeNode.children = children
            allPhysicalDirectories.push(...physicalDirectories)
          }
          return routeNode
        }
      }
    }),
  )
  return {
    children: children.flat(),
    physicalDirectories: allPhysicalDirectories,
  }
}
