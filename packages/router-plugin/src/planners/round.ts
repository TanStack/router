/**
 * Per-planning-round state the two router planners share: the module-wide
 * renames the HMR planner made in `prepare` (so the splitter's generated
 * text names the renamed symbol) and the compile-time names of the unsplit
 * component options. Keyed by the round's rewrite set.
 */
import type { PlanContext, SymbolId } from '@tanstack/router-utils/compiler'

export interface HmrRound {
  /** Module-level symbols renamed in `prepare` → their new symbol. */
  renamed: Map<SymbolId, SymbolId>
  /** Compile-time binding names of unsplit component options. */
  unsplit: Record<string, string>
}

const rounds = new WeakMap<object, HmrRound>()

export function roundOf(ctx: PlanContext): HmrRound {
  let r = rounds.get(ctx.rewrites)
  if (!r) {
    r = { renamed: new Map(), unsplit: {} }
    rounds.set(ctx.rewrites, r)
  }
  return r
}

/** The symbol a module binding renders as after the HMR renames of this round. */
export function renamedSymbol(ctx: PlanContext, sym: SymbolId): SymbolId {
  return rounds.get(ctx.rewrites)?.renamed.get(sym) ?? sym
}
