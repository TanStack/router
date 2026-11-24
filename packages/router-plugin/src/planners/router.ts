/**
 * The router planner (SPEC J2 route splitting, J3 route HMR). One planning
 * round recognises the route and decides its splits once; route HMR hoists
 * the component options that stay in the route module (`hmr.ts`), the split
 * part moves the others to their chunks and erases `deleteNodes`
 * (`split.ts`), then route HMR appends the dev block. In every environment,
 * a server option passed by a name the module assigns elsewhere is refused
 * (`reportReassignedServerOptions`).
 */
import {
  reassignedServerCode,
  unwrapExpression,
} from '@tanstack/router-utils/compiler'
import {
  recognizeRoute,
  reportNotGenerated,
  reportRouterDiagnostic,
  routeEntryDigest,
} from './route'
import { splitPlanOf } from './decisions'
import { planSplit } from './split'
import { planHmrBlock, planHmrHoists } from './hmr'
import { routeServerCode } from './server-code'
import { ROUTER_PLANNER, routerPlannerApplies } from './config'
import type { RouteEntryFacts, RouteModuleInfo } from './route'
import type { SplitPlan } from './decisions'
import type { RouterPlannerConfig } from './config'
import type {
  PlanContext,
  Planner,
  Range,
  YukuNode as Node,
} from '@tanstack/router-utils/compiler'

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
      reportReassignedServerOptions(ctx, route)
      const round: RouterRound = {
        cfg,
        route,
        plan: splitPlanOf(ctx, cfg, route),
      }
      for (const w of round.plan.warnings) {
        reportRouterDiagnostic(ctx, w)
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
 * Refuses each name a route's server option passes server code by (its
 * value, or a property of an object literal in it: `server: { handlers: {
 * GET: get } }`) when the module assigns it elsewhere, so that the client,
 * which erases the option, would keep the assignments with what they read
 * (`reassignedServerCode`). Judged on the source, so in every environment
 * alike.
 */
function reportReassignedServerOptions(
  ctx: PlanContext<typeof ROUTER_PLANNER>,
  route: RouteModuleInfo,
): void {
  const named: Array<{ node: Node; path: Array<string> }> = []
  const serverCode: Array<Range> = []
  const visit = (value: Node, path: Array<string>) => {
    const node = unwrapExpression(value)
    if (node.type === 'Identifier') {
      named.push({ node, path })
    } else if (node.type === 'ObjectExpression') {
      for (const p of node.properties) {
        if (p.type === 'Property' && !p.computed) {
          // (the key as written)
          const key = ctx.analysis.source.code.slice(p.key.start, p.key.end)
          visit(p.value, [...path, key])
        }
      }
    }
  }
  for (const option of route.props) {
    if (
      option.key !== null &&
      option.value !== null &&
      ctx.config.serverOptions.includes(option.key)
    ) {
      serverCode.push({ start: option.value.start, end: option.value.end })
      visit(option.value, [option.keyText])
    }
  }
  for (const { node, path } of named) {
    const sym = reassignedServerCode(ctx.t1, node, serverCode)
    if (sym === null) {
      continue
    }
    const binding = ctx.symbols.name(sym)
    const inPlace = path.reduceRight(
      (inner, key) => `${key}: ${inner === '…' ? inner : `{ ${inner} }`}`,
      '…',
    )
    // (an error: every environment reports it)
    reportRouterDiagnostic(ctx, {
      severity: 'error',
      message: `[tanstack-router] \`${binding}\` is assigned elsewhere in ${ctx.displayPath}, so the server code it holds can ship to the client: the client output can keep the assignments of \`${binding}\` and the code they reference. Write it in place in the route options (\`${inPlace}\`), or define it once with a \`const\` (\`const ${binding} = wrap(…)\`, \`const ${binding} = condition ? a : b\`).`,
      range: { start: node.start, end: node.end },
      by: ROUTER_PLANNER,
      code: 'route-server-code-reassigned',
    })
  }
}
