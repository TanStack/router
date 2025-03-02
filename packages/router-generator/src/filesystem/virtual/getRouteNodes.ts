import path, { join, resolve } from 'node:path'
import {
  removeExt,
  removeLeadingSlash,
  removeTrailingSlash,
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

function ensureLeadingUnderScore(id: string) {
  if (id.startsWith('_')) {
    return id
  }
  return `_${id}`
}

function flattenTree(node: RouteNode): Array<RouteNode> {
  const result = [node]

  if (node.children) {
    for (const child of node.children) {
      result.push(...flattenTree(child))
    }
  }
  delete node.children

  return result
}

export async function getRouteNodes(
  tsrConfig: Config,
  root: string,
): Promise<GetRouteNodesResult> {
  const fullDir = resolve(tsrConfig.routesDirectory)
  if (tsrConfig.virtualRouteConfig === undefined) {
    throw new Error(`virtualRouteConfig is undefined`)
  }
  let virtualRouteConfig: VirtualRootRoute
  let children: Array<RouteNode> = []
  if (typeof tsrConfig.virtualRouteConfig === 'string') {
    virtualRouteConfig = await getVirtualRouteConfigFromFileExport(
      tsrConfig,
      root,
    )
  } else {
    virtualRouteConfig = tsrConfig.virtualRouteConfig
  }
  children = await getRouteNodesRecursive(
    tsrConfig,
    root,
    fullDir,
    virtualRouteConfig.children,
  )
  const allNodes = flattenTree({
    children,
    filePath: virtualRouteConfig.file,
    fullPath: join(fullDir, virtualRouteConfig.file),
    variableName: 'rootRoute',
    routePath: `/${rootPathId}`,
    _fsRouteType: '__root',
  })

  const rootRouteNode = allNodes[0]
  const routeNodes = allNodes.slice(1)

  return { rootRouteNode, routeNodes }
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
  tsrConfig: Config,
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
  tsrConfig: Config,
  root: string,
  fullDir: string,
  nodes?: Array<VirtualRouteNode>,
  parent?: RouteNode,
): Promise<Array<RouteNode>> {
  if (nodes === undefined) {
    return []
  }
  const children = await Promise.all(
    nodes.map(async (node) => {
      if (node.type === 'physical') {
        const { routeNodes } = await getRouteNodesPhysical(
          {
            ...tsrConfig,
            routesDirectory: resolve(fullDir, node.directory),
          },
          root,
        )
        routeNodes.forEach((subtreeNode) => {
          subtreeNode.variableName = routePathToVariable(
            `${node.pathPrefix}/${removeExt(subtreeNode.filePath)}`,
          )
          subtreeNode.routePath = `${parent?.routePath ?? ''}${node.pathPrefix}${subtreeNode.routePath}`
          subtreeNode.filePath = `${node.directory}/${subtreeNode.filePath}`
        })
        return routeNodes
      }

      function getFile(file: string) {
        const filePath = file
        const variableName = routePathToVariable(removeExt(filePath))
        const fullPath = join(fullDir, filePath)
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

          const routePath = `${parentRoutePath}/${removeLeadingSlash(lastSegment)}`
          if (node.file) {
            const { filePath, variableName, fullPath } = getFile(node.file)
            routeNode = {
              filePath,
              fullPath,
              variableName,
              routePath,
              _fsRouteType: 'static',
            }
          } else {
            routeNode = {
              filePath: '',
              fullPath: '',
              variableName: routePathToVariable(routePath),
              routePath,
              isVirtual: true,
              _fsRouteType: 'static',
            }
          }

          if (node.children !== undefined) {
            const children = await getRouteNodesRecursive(
              tsrConfig,
              root,
              fullDir,
              node.children,
              routeNode,
            )
            routeNode.children = children

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
          const routePath = `${parentRoutePath}/${removeLeadingSlash(lastSegment)}`

          const routeNode: RouteNode = {
            fullPath,
            filePath,
            variableName,
            routePath,
            _fsRouteType: 'pathless_layout',
          }

          if (node.children !== undefined) {
            const children = await getRouteNodesRecursive(
              tsrConfig,
              root,
              fullDir,
              node.children,
              routeNode,
            )
            routeNode.children = children
          }
          return routeNode
        }
      }
    }),
  )
  return children.flat()
}
