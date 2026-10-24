/**
 * The Start planners in the core's fixed order (DESIGN §2.6):
 * `start-env` → `hydrate` → `rsc-css` → `route-hmr.prepare` → `route-split`
 * → `route-hmr.plan` → `import-edges`. Hosts compose one array per env.
 *
 * Hooks for the planners other lanes build: `hydrate` (J5), the router
 * planners (`route-split`, `route-hmr`, J2/J3) and `import-edges` (J6) are
 * taken as given planner instances and slotted at their position.
 */
import { rscCssPlanner } from './rsc-css'
import { startEnvPlanner } from './start-env'
import type { Planner } from '@tanstack/router-utils/compiler'

export { START_ENV, startEnvPlanner } from './start-env'
export type { StartEnvConfig, StartEnvFacts } from './start-env'
export { RSC_CSS, rscCssPlanner } from './rsc-css'
export type { RscCssConfig } from './rsc-css'

export interface StartPlannerSlots {
  /** The Hydrate planner (J5), when the env extracts boundaries. */
  hydrate?: Planner | null
  /** Whether the env runs the RSC render (the `rsc-css` planner applies). */
  rscCss?: boolean
  /** The router planners (`route-split`, `route-hmr`) for this env, in order. */
  router?: ReadonlyArray<Planner>
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
  for (const p of slots.router ?? []) {
    planners.push(p)
  }
  if (slots.importEdges) {
    planners.push(slots.importEdges)
  }
  return planners
}
