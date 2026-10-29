/**
 * The router planner (J2 route splitting, J3 route HMR) for hosts: the
 * standalone router hosts of this package and Start's hosts, which compose
 * it with the Start planners in one `compileModule` per module (one parse and
 * plan per module for both). A host passes the planner's configuration as
 * `perPlanner[ROUTER_PLANNER]` and a `routes` registry.
 */
export { routerPlanner } from './router'
export {
  ROUTER_PLANNER,
  routeRefreshMarkers,
  routerPlannerApplies,
  routerPlannerConfigDigest,
  routerPlannerConfigFrom,
} from './config'
export type { HmrStyle, RouterPlannerConfig, RouterPlannerEnv } from './config'
export { RouteRegistryView } from './registry'
export { routerPureCalls } from './route'
