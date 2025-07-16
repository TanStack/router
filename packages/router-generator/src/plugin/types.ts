import type { TransformPlugin } from '../transform/types'
import type {
  HandleNodeAccumulator,
  ImportDeclaration,
  RouteNode,
} from '../types'

import type { Generator } from '../generator'

export type GeneratorPlugin = GeneratorPluginBase | GeneratorPluginWithTransform

export interface GeneratorPluginBase {
  name: string
  onRouteTreesChanged?: (opts: {
    routeTrees: Array<{
      sortedRouteNodes: Array<RouteNode>
      acc: HandleNodeAccumulator
      exportName: string
    }>
    rootRouteNode: RouteNode
    generator: Generator
  }) => void
}

export interface GeneratorPluginWithTransform extends GeneratorPluginBase {
  transformPlugin: TransformPlugin
  moduleAugmentation: (opts: { generator: Generator }) => {
    module: string
    interfaceName: string
  }
  imports: (opts: {
    rootRouteNode: RouteNode
    sortedRouteNodes: Array<RouteNode>
    acc: HandleNodeAccumulator
    generator: Generator
  }) => Array<ImportDeclaration>
  routeModuleAugmentation: (opts: {
    routeNode: RouteNode
  }) => string | undefined
  createRootRouteCode: () => string
  createVirtualRouteCode: (opts: { node: RouteNode }) => string
  config: (opts: {
    generator: Generator
    rootRouteNode: RouteNode
    sortedRouteNodes: Array<RouteNode>
  }) => {
    virtualRootRoute?: boolean
  }
}

export {}
