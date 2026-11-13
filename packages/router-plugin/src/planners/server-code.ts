/**
 * The router's recorder for the server-code check (R132; the check and how
 * to remove it: `@tanstack/router-utils` `src/compiler/server-code.ts`): the
 * value of every recognised route option whose key is in `deleteNodes`
 * (Start's `server`, `headers`, `ssr`), read from the route's recognition,
 * not from what the split plan deletes, so an option the planner skips is
 * still checked. A redundancy net: the router planner does not read it, and
 * it goes with the check in one deletion (this module and its hook in
 * `routerPlanner`).
 */
import { recognizeRoute } from './route'
import { ROUTER_PLANNER } from './config'
import type {
  PlanContext,
  ServerOnlyText,
} from '@tanstack/router-utils/compiler'

export function routeServerCode(
  ctx: PlanContext<typeof ROUTER_PLANNER>,
): Array<ServerOnlyText> {
  const deleteNodes = ctx.config.deleteNodes
  const entry = ctx.prefetched.get(ROUTER_PLANNER) ?? null
  if (deleteNodes.length === 0 || !entry || 'failure' in entry) {
    return []
  }
  const route = recognizeRoute(ctx, entry)
  const texts: Array<ServerOnlyText> = []
  for (const option of route?.props ?? []) {
    if (
      option.key !== null &&
      option.value !== null &&
      deleteNodes.includes(option.key)
    ) {
      texts.push({
        range: { start: option.value.start, end: option.value.end },
        subject: `the route's \`${option.keyText}\` option`,
      })
    }
  }
  return texts
}
