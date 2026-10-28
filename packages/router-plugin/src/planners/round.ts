/**
 * Per-planning-round state the two router planners share: the compile-time
 * names of the unsplit component options (the HMR planner records them in
 * `prepare`, the splitter reads them in `plan`). Keyed by the round's rewrite
 * set.
 */
import type { PlanContext } from '@tanstack/router-utils/compiler'

export interface HmrRound {
  /** Compile-time binding names of unsplit component options. */
  unsplit: Record<string, string>
}

const rounds = new WeakMap<object, HmrRound>()

export function roundOf(ctx: PlanContext): HmrRound {
  let r = rounds.get(ctx.rewrites)
  if (!r) {
    r = { unsplit: {} }
    rounds.set(ctx.rewrites, r)
  }
  return r
}
