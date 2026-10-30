import type { TreeModel } from '../types'
import type { Generator } from '../generator'

export interface GeneratorPlugin {
  name: string
  init?: (opts: { generator: Generator }) => void
  /**
   * After each generation that rebuilt the tree model: the routes changed,
   * or the recorded options of a route file did.
   */
  onRouteTreeChanged?: (opts: {
    model: TreeModel
    generator: Generator
  }) => void
}
