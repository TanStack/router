import type { HandleNodeAccumulator, RouteNode } from '../types'
import type { Generator } from '../generator'

export interface TransformRouteSourceOptions {
  source: string
  filename: string
  node: RouteNode
}

export interface FormatRouteOptions {
  source: string
  node: RouteNode
}

export interface GeneratorPlugin {
  name: string
  init?: (opts: { generator: Generator }) => void
  onRouteTreeChanged?: (opts: {
    routeTree: Array<RouteNode>
    routeNodes: Array<RouteNode>
    rootRouteNode: RouteNode
    acc: HandleNodeAccumulator
  }) => void

  afterTransform?: (opts: {
    node: RouteNode
    prevNode: RouteNode | undefined
  }) => void

  /**
   * Converts framework-specific route syntax into position-preserving
   * TypeScript/JSX for route analysis. Hooks run in plugin order and each
   * returned value is passed to the next hook. The final source must have the
   * same length as the authored source. It is never emitted.
   */
  transformRouteSource?: (
    opts: TransformRouteSourceOptions,
  ) => string | void | Promise<string | void>

  /**
   * Formats a newly scaffolded route. Hooks run in plugin order and each
   * returned value is passed to the next hook. The built-in TypeScript
   * formatter is used only when no plugin handles the route.
   */
  formatRoute?: (
    opts: FormatRouteOptions,
  ) => string | void | Promise<string | void>
}
