import { join, resolve } from 'node:path'
import {
  removeExt,
  removeLeadingSlash,
  removeTrailingSlash,
  routePathToVariable,
} from '../../utils'
import { getRouteNodes as getRouteNodesPhysical } from '../physical/getRouteNodes'
import type { VirtualRouteNode } from '@tanstack/virtual-file-routes'
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
): Promise<GetRouteNodesResult> {
  const fullDir = resolve(tsrConfig.routesDirectory)
  if (tsrConfig.virtualRouteConfig === undefined) {
    throw new Error(`virtualRouteConfig is undefined`)
  }
  const children = await getRouteNodesRecursive(
    tsrConfig,
    fullDir,
    tsrConfig.virtualRouteConfig.children,
  )
  const allNodes = flattenTree({
    children,
    filePath: tsrConfig.virtualRouteConfig.file,
    fullPath: join(fullDir, tsrConfig.virtualRouteConfig.file),
    variableName: 'rootRoute',
    routePath: '/',
    isRoot: true,
  })

  const rootRouteNode = allNodes[0]
  const routeNodes = allNodes.slice(1)

  return { rootRouteNode, routeNodes }
}

export async function getRouteNodesRecursive(
  tsrConfig: Config,
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
        const { routeNodes } = await getRouteNodesPhysical({
          ...tsrConfig,
          routesDirectory: resolve(fullDir, node.directory),
        })
        routeNodes.forEach((subtreeNode) => {
          subtreeNode.variableName = routePathToVariable(
            `${node.pathPrefix}/${removeExt(subtreeNode.filePath)}`,
          )
          subtreeNode.routePath = `${parent?.routePath ?? ''}${node.pathPrefix}${subtreeNode.routePath}`
          subtreeNode.filePath = `${node.directory}/${subtreeNode.filePath}`
        })
        return routeNodes
      }

      const filePath = node.file
      const variableName = routePathToVariable(removeExt(filePath))
      const fullPath = join(fullDir, filePath)
      const parentRoutePath = removeTrailingSlash(parent?.routePath ?? '/')
      const isLayout = node.type === 'layout'
      switch (node.type) {
        case 'index': {
          const routePath = `${parentRoutePath}/`
          return {
            filePath,
            fullPath,
            variableName,
            routePath,
            isLayout,
          } satisfies RouteNode
        }

        case 'route':
        case 'layout': {
          let lastSegment: string
          if (node.type === 'layout') {
            if (node.id !== undefined) {
              node.id = ensureLeadingUnderScore(node.id)
            } else {
              node.id = '_layout'
            }
            lastSegment = node.id
          } else {
            lastSegment = node.path
          }
          const routePath = `${parentRoutePath}/${removeLeadingSlash(lastSegment)}`

          const routeNode: RouteNode = {
            fullPath,
            isLayout,
            filePath,
            variableName,
            routePath,
          }

          if (node.children !== undefined) {
            const children = await getRouteNodesRecursive(
              tsrConfig,
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
