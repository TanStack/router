import type {
  HandleNodeAccumulator,
  ImportDeclaration,
  RouteNode,
} from '../types'
import type { Generator } from '../generator'
import type { Config } from '../config'

export interface GeneratorPlugin {
  /**
   * Called after a route node file has been transformed.
   */
  afterTransform?: (opts: {
    node: RouteNode
    prevNode: RouteNode | undefined
  }) => void

  /**
   * Called when generating route tree content. Can return additional imports.
   */
  getAdditionalRouteTreeContent?: (opts: {
    routeTree: Array<RouteNode>
    routeNodes: Array<RouteNode>
    rootRouteNode: RouteNode
    acc: HandleNodeAccumulator
    config: Config
  }) => { imports?: Array<ImportDeclaration> } | void

  /**
   * Initialize the plugin with access to the generator instance.
   */
  init?: (opts: { generator: Generator }) => void

  /**
   * Determine if a file is built in.
   */
  isBuiltInFile?: (opts: {
    fileName: string
    fullPath: string
    relativePath: string
  }) => boolean

  /**
   * The name of the plugin.
   */
  name: string

  /**
   * Called after route tree is built.
   */
  onRouteTreeChanged?: (opts: {
    routeTree: Array<RouteNode>
    routeNodes: Array<RouteNode>
    rootRouteNode: RouteNode
    acc: HandleNodeAccumulator
    config: Config
  }) => void

  /**
   * Transform route nodes after filesystem discovery. Receives all nodes
   * and can return a modified array.
   */
  transformNodes?: (opts: {
    routeNodes: Array<RouteNode>
    config: Config
  }) => Array<RouteNode> | void
}
