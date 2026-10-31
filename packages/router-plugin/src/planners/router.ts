/**
 * The router planner (SPEC J2 route splitting, J3 route HMR). One planning
 * round recognises the route and decides its splits once; route HMR hoists
 * the component options that stay in the route module (`hmr.ts`), the split
 * part moves the others to their chunks and erases `deleteNodes`
 * (`split.ts`), then route HMR appends the dev block.
 */
import {
  recognizeRoute,
  routeEntryDigest,
  unownedRouteOptions,
} from './route'
import { splitPlanOf } from './decisions'
import { planSplit } from './split'
import { planHmrBlock, planHmrHoists } from './hmr'
import { ROUTER_PLANNER, routerPlannerApplies } from './config'
import type { RouteEntryFacts, RouteModuleInfo } from './route'
import type { SplitPlan } from './decisions'
import type { RouterPlannerConfig } from './config'
import type {
  OutputId,
  Planner,
  SymRef,
  SymbolId,
} from '@tanstack/router-utils/compiler'

/** What one planning round of the router planner decided, read by its split and HMR parts. */
export interface RouterRound {
  cfg: RouterPlannerConfig
  route: RouteModuleInfo
  plan: SplitPlan
  /** Compile-time binding names of the component options left in the route module (route HMR). */
  unsplit: Record<string, string>
  /**
   * The components the split chunks export (route HMR marks them): the
   * user's binding or the chunk's own declaration, and the module binding
   * the option's value names, if any.
   */
  splitComponents: Array<{
    output: OutputId
    exported: SymRef
    valueSym: SymbolId | null
  }>
}

export function routerPlanner(): Planner {
  return {
    name: ROUTER_PLANNER,
    tier: 1,
    gate: (t0, ctx) =>
      routerPlannerApplies(ctx.config as RouterPlannerConfig) &&
      t0.exports.some((e) => e.kind === 'local' && e.name === 'Route'),
    prefetch(_t0, ctx) {
      // the route id comes from the generator's registry: a dependency
      const entry = ctx.host.routes?.lookup(ctx.identity.path) ?? null
      ctx.ledger.record({
        kind: 'route-registry',
        path: ctx.identity.path,
        digest: routeEntryDigest(entry),
      })
      ctx.set(entry)
      return Promise.resolve()
    },
    plan(ctx) {
      const cfg = ctx.config as RouterPlannerConfig
      const entry = ctx.prefetched.get(ROUTER_PLANNER) as RouteEntryFacts | null
      const recognition = recognizeRoute(ctx, entry)
      const route = recognition.route
      for (const d of unownedRouteOptions(
        ctx,
        cfg,
        route?.optionsCall ?? null,
      )) {
        ctx.diagnostic(d)
      }
      if (!route) {
        // no recognised route: report what recognition found (J2.10, J2.11)
        for (const w of recognition.warnings) {
          ctx.diagnostic(w)
        }
        return
      }
      const round: RouterRound = {
        cfg,
        route,
        plan: splitPlanOf(ctx, cfg, route),
        unsplit: {},
        splitComponents: [],
      }
      for (const w of round.plan.warnings) {
        ctx.diagnostic(w)
      }
      // the hoists and renames come first: the split part reads the renamed
      // bindings of the options it moves
      if (cfg.hmr) {
        planHmrHoists(ctx, round)
      }
      if (cfg.split || cfg.deleteNodes.length > 0) {
        planSplit(ctx, round)
      }
      if (cfg.hmr) {
        planHmrBlock(ctx, round, cfg.hmr.style)
      }
    },
  }
}
