/**
 * The router planners (J2 route splitting, J3 route HMR) for hosts: the
 * standalone router hosts of this package and Start's hosts, which compose
 * them with the Start planners in one `compileModule` per module (one parse and plan
 * per module for both).
 */
import { routeSplitPlanner } from './split'
import { routeHmrPlanner } from './hmr'
import type { RouterPlannerConfig } from './config'
import type { Planner } from '@tanstack/router-utils/compiler'

export type { RouterPlannerConfig, HmrStyle } from './config'
export { RouteRegistryView } from './registry'
export { routeEntryDigest, routerPureCalls } from './route'

/**
 * The router planners in their fixed order. Pass the same
 * `RouterPlannerConfig` object as `perPlanner['route-split']` and
 * `perPlanner['route-hmr']`, and a `services.routes` registry on the host.
 */
export function routerPlanners(): Array<Planner> {
  return [routeSplitPlanner(), routeHmrPlanner()]
}

/** The `perPlanner` entries of a compile for `config`. */
export function routerPlannerConfig(
  config: RouterPlannerConfig,
): Record<string, RouterPlannerConfig> {
  return { 'route-split': config, 'route-hmr': config }
}
