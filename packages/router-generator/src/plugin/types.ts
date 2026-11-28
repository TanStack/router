import type { TreeModel } from '../types'
import type { Generator } from '../generator'

export interface GeneratorPlugin {
  name: string
  init?: (opts: { generator: Generator }) => void
  /**
   * After each generation that rebuilt the tree model (a batch that scanned
   * the routes again, or whose edited route files added or removed a
   * `Route` or changed its recorded options), once the
   * generator publishes it: its registry, digests and the route files' upkeep
   * are that generation's.
   */
  onRouteTreeChanged?: (opts: {
    model: TreeModel
    generator: Generator
  }) => void
}
