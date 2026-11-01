import type { RouteNode } from './types'

/** Page eligibility before resolving its installation's full URL. */
export function isPrerenderableRoute(node: RouteNode): boolean {
  return Boolean(
    node.routePath &&
    !node.routePath.includes('$') &&
    !node.isNonPath &&
    node.createFileRouteProps?.has('component'),
  )
}
