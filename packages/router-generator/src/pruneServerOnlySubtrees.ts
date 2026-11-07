import type { HandleNodeAccumulator, RouteNode } from './types'

/** A route with a `server` option and nothing else: it has no client part. */
export function isServerOnlyNode(node: RouteNode | undefined): boolean {
  return (
    node?.createFileRouteProps?.has('server') === true &&
    node.createFileRouteProps.size === 1
  )
}

export function pruneServerOnlySubtrees({
  rootRouteNode,
  acc,
}: {
  rootRouteNode: RouteNode
  acc: HandleNodeAccumulator
}) {
  const routeNodes: Array<RouteNode> = []
  const routeTree =
    prune({ ...rootRouteNode, children: acc.routeTree }, routeNodes)
      ?.children || []
  // remove root node from routeNodes
  routeNodes.pop()
  return {
    routeTree,
    routeNodes,
  }
}
function prune(
  node: RouteNode,
  collectedRouteNodes: Array<RouteNode>,
): RouteNode | null {
  const newChildren: Array<RouteNode> = []
  let allChildrenServerOnly = true

  for (const child of node.children || []) {
    const newChild = prune(child, collectedRouteNodes)
    if (newChild) {
      newChildren.push(newChild)
      // at least one child survived pruning
      allChildrenServerOnly = false
    }
  }

  const allServerOnly = isServerOnlyNode(node) && allChildrenServerOnly
  // prune this subtree
  if (allServerOnly) {
    return null
  }
  collectedRouteNodes.push(node)
  return { ...node, children: newChildren }
}
