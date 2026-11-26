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
  staticPropertyKey,
  unwrapExpression,
  writePosition,
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
  YukuNode as Node,
  PlanContext,
  Planner,
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
    serverText(ctx) {
      const entry = ctx.prefetched.get(ROUTER_PLANNER) ?? null
      const route =
        entry && !('failure' in entry) ? recognizeRoute(ctx, entry) : null
      return route ? serverOptionsOf(ctx, route).map(({ value }) => value) : []
    },
  }
}

/** The route's options that hold server code (`RouterPlannerConfig.serverOptions`), with their values. */
function serverOptionsOf(
  ctx: PlanContext<typeof ROUTER_PLANNER>,
  route: RouteModuleInfo,
): Array<{ keyText: string; key: string; value: Node }> {
  return route.props.flatMap((option) =>
    option.key !== null &&
    option.value !== null &&
    ctx.config.serverOptions.includes(option.key)
      ? [{ keyText: option.keyText, key: option.key, value: option.value }]
      : [],
  )
}

/**
 * Refuses each name a route's server option passes server code by, when the
 * module assigns it outside server-only text: the client, which erases the
 * option, keeps the assignments with what they read (`reassignedServerCode`).
 * The names: the value, and in it each property value and spread of an
 * object literal (`server: { handlers: { GET: get, ...more } }`), each
 * element of an array (`middleware: [auth]`), and the object a `handlers`
 * function gives `createHandlers` (`handlers: ({ createHandlers }) =>
 * createHandlers({ GET: get })`); `ssr`'s as well. Judged on the source, so
 * in every environment alike.
 */
function reportReassignedServerOptions(
  ctx: PlanContext<typeof ROUTER_PLANNER>,
  route: RouteModuleInfo,
): void {
  const code = ctx.analysis.source.code
  /**
   * Each name, with the keys down to it as written (a spread's or an
   * element's: its container's, and `keyed` false), and whether it is in a
   * `createHandlers(…)` object.
   */
  interface Named {
    node: Node
    path: Array<string>
    keyed: boolean
    factory: boolean
  }
  const named: Array<Named> = []
  const visit = (value: Node, at: Omit<Named, 'node'>, handlers: boolean) => {
    const node = unwrapExpression(value)
    if (node.type === 'Identifier') {
      named.push({ node, ...at })
    } else if (node.type === 'ObjectExpression') {
      for (const p of node.properties) {
        if (p.type === 'SpreadElement') {
          visit(p.argument, { ...at, keyed: false }, false)
        } else if (!p.computed) {
          const path = [...at.path, code.slice(p.key.start, p.key.end)]
          visit(
            p.value,
            { ...at, path, keyed: true },
            staticPropertyKey(p) === 'handlers',
          )
        }
      }
    } else if (node.type === 'ArrayExpression') {
      for (const e of node.elements) {
        if (e !== null) {
          visit(
            e.type === 'SpreadElement' ? e.argument : e,
            { ...at, keyed: false },
            false,
          )
        }
      }
    } else if (handlers) {
      const object = createHandlersArgument(node)
      if (object) {
        // (the object itself, or a name for it: no key at its place)
        visit(object, { ...at, factory: true, keyed: false }, false)
      }
    }
  }
  for (const { keyText, value } of serverOptionsOf(ctx, route)) {
    visit(value, { path: [keyText], keyed: true, factory: false }, false)
  }
  for (const { node, path, keyed, factory } of named) {
    const reassigned = reassignedServerCode(ctx, node)
    if (reassigned === null) {
      continue
    }
    const binding = ctx.symbols.name(reassigned.sym)
    const at = writePosition(ctx, reassigned.write)
    // (in a `createHandlers(…)` object: at the argument, the callback and
    // the middleware around it stay)
    const inPlace = factory
      ? `Write it in place at this argument${keyed ? ` (\`${path.at(-1)}: …\`)` : ''}, keeping the \`createHandlers\` callback and its middleware`
      : `Write it in place in the route options (\`${path.reduceRight(
          (inner, key) => `${key}: ${inner === '…' ? inner : `{ ${inner} }`}`,
          '…',
        )}\`)`
    // (an error: every environment reports it)
    reportRouterDiagnostic(ctx, {
      severity: 'error',
      message: `[tanstack-router] \`${binding}\` is assigned elsewhere in ${ctx.displayPath} (at ${at}), so the server code it holds can ship to the client: the client output can keep the assignments of \`${binding}\` and the code they reference. ${inPlace}, or define it once with a \`const\` (\`const ${binding} = wrap(…)\`, \`const ${binding} = condition ? a : b\`).`,
      range: { start: node.start, end: node.end },
      by: ROUTER_PLANNER,
      code: 'route-server-code-reassigned',
    })
  }
}

/**
 * The object of handlers a `handlers` function gives `createHandlers` (its
 * result: `({ createHandlers }) => createHandlers({ GET })`, also as the one
 * statement `return createHandlers(…)`), or null.
 */
function createHandlersArgument(node: Node): Node | null {
  if (
    node.type !== 'ArrowFunctionExpression' &&
    node.type !== 'FunctionExpression'
  ) {
    return null
  }
  let body = node.body
  if (body?.type === 'BlockStatement') {
    const only = body.body.length === 1 ? body.body[0]! : null
    if (only?.type !== 'ReturnStatement' || !only.argument) {
      return null
    }
    body = only.argument
  }
  const call = body ? unwrapExpression(body) : null
  if (call?.type !== 'CallExpression') {
    return null
  }
  const callee = unwrapExpression(call.callee)
  const name =
    callee.type === 'Identifier'
      ? callee.name
      : callee.type === 'MemberExpression' &&
          !callee.computed &&
          callee.property.type === 'Identifier'
        ? callee.property.name
        : null
  const first = call.arguments[0]
  return name === 'createHandlers' && first && first.type !== 'SpreadElement'
    ? first
    : null
}
