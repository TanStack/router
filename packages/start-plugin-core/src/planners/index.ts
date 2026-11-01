/**
 * The Start planners in the core's fixed order:
 * `start-env` → `hydrate` → `rsc-css` → `router` → `import-edges`. Hosts
 * compose one array per env.
 *
 * The planners built elsewhere: `hydrate` (J5), the router planner (J2/J3)
 * and `import-edges` (J6) are taken as given planner instances and slotted
 * at their position.
 */
import { rscCssPlanner } from './rsc-css'
import { startEnvPlanner } from './start-env'
import type { Planner } from '@tanstack/router-utils/compiler'

export { START_ENV, startEnvPlanner } from './start-env'
export type { StartEnvConfig, StartEnvFacts } from './start-env'
export type { RscCssConfig } from './rsc-css'

interface StartPlannerSlots {
  /** The Hydrate planner (J5), when the env extracts boundaries. */
  hydrate?: Planner | null
  /** Whether the env runs the RSC render (the `rsc-css` planner applies). */
  rscCss?: boolean
  /** The router planner (J2/J3), when it runs in this env. */
  router?: Planner | null
  /** The import-protection edge planner (J6). */
  importEdges?: Planner | null
}

/** The planner array of one Start env. */
export function startPlanners(slots: StartPlannerSlots = {}): Array<Planner> {
  const planners: Array<Planner> = [startEnvPlanner()]
  if (slots.hydrate) {
    planners.push(slots.hydrate)
  }
  if (slots.rscCss) {
    planners.push(rscCssPlanner())
  }
  if (slots.router) {
    planners.push(slots.router)
  }
  if (slots.importEdges) {
    planners.push(slots.importEdges)
  }
  return planners
}
