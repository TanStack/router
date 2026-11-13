/**
 * The router planner (SPEC J2 route splitting, J3 route HMR). One planning
 * round recognises the route and decides its splits once; route HMR hoists
 * the component options that stay in the route module (`hmr.ts`), the split
 * part moves the others to their chunks and erases `deleteNodes`
 * (`split.ts`), then route HMR appends the dev block.
 */
import { unwrapExpression } from '@tanstack/router-utils/compiler'
import { recognizeRoute, reportNotGenerated, routeEntryDigest } from './route'
import { SPLITTABLE_KEYS, splitPlanOf } from './decisions'
import { planSplit } from './split'
import { planHmrBlock, planHmrHoists } from './hmr'
import { routeServerCode } from './server-code'
import { ROUTER_PLANNER, routerPlannerApplies } from './config'
import type { RouteEntryFacts, RouteModuleInfo } from './route'
import type { SplitPlan } from './decisions'
import type { RouterPlannerConfig } from './config'
import type { PlanContext, Planner } from '@tanstack/router-utils/compiler'

/** What one planning round of the router planner decided, read by its split and HMR parts. */
export interface RouterRound {
  cfg: RouterPlannerConfig
  route: RouteModuleInfo
  plan: SplitPlan
}

declare module '@tanstack/router-utils/compiler' {
  interface PlannerData {
    /** The router planner's `PlannerData` (`ROUTER_PLANNER`): its config and its route-registry entry (or why there is none yet). */
    router: {
      config: RouterPlannerConfig
      prefetch: RouteEntryFacts | RoutesNotGenerated | null
    }
  }
}

/** The routes have never been generated: the generator's error. */
interface RoutesNotGenerated {
  failure: unknown
}

export function routerPlanner(): Planner<typeof ROUTER_PLANNER> {
  return {
    name: ROUTER_PLANNER,
    tier: 1,
    gate: (t0, ctx) =>
      routerPlannerApplies(ctx.config) &&
      t0.exports.some((e) => e.kind === 'local' && e.name === 'Route'),
    prefetch(_t0, ctx) {
      // the route id comes from the generator's registry: a dependency
      const routes = ctx.host.routes
      const path = ctx.identity.path
      const entry = routes?.lookup(path) ?? null
      ctx.ledger.record({
        kind: 'route-registry',
        path,
        digest: routes ? routes.digestFor(path) : routeEntryDigest(entry),
      })
      const failure = routes?.failure?.()
      ctx.set(failure !== undefined ? { failure } : entry)
      return Promise.resolve()
    },
    plan(ctx) {
      const cfg = ctx.config
      // (the prefetch always stores the entry) a file the generator does not
      // list is no route: served as written (R145)
      const entry = ctx.prefetched.get(ROUTER_PLANNER) ?? null
      if (!entry) {
        return
      }
      if ('failure' in entry) {
        // no route is known yet: whether this file is one, and which, is
        // not known either (as the route tree, it fails until it is)
        reportNotGenerated(ctx, entry.failure)
        return
      }
      const route = recognizeRoute(ctx, entry)
      if (!route) {
        return
      }
      stateCalledLater(ctx, route)
      const round: RouterRound = {
        cfg,
        route,
        plan: splitPlanOf(ctx, cfg, route),
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
    serverCode: routeServerCode,
  }
}

/**
 * The values of the options the router calls later (the components and the
 * loader), split or not: a call there holds the functions it is handed
 * (R152), so `component: observer(Page)` does not run `Page` when the
 * module loads. Other options read as every call does.
 */
function stateCalledLater(ctx: PlanContext, route: RouteModuleInfo): void {
  for (const option of route.props) {
    if (
      option.key !== null &&
      option.value !== null &&
      SPLITTABLE_KEYS.includes(option.key)
    ) {
      const value = unwrapExpression(option.value)
      ctx.calledLater({ start: value.start, end: value.end })
    }
  }
}
