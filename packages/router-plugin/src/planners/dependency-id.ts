/**
 * A dependency module: `node_modules` in its path (not its query). The hosts
 * never compile one (each bundler filters them out natively); a route file
 * there is reported with `dependencyRouteFileWarning`. Start's hosts share
 * it (`@tanstack/router-plugin/planners`).
 */
export const DEPENDENCY_ID_RE = /^[^?]*[\\/]node_modules[\\/]/
