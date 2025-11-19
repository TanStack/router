import * as template from '@babel/template'
import type { AnyRoute, AnyRouteMatch, AnyRouter } from '@tanstack/router-core'

type AnyRouteWithPrivateProps = AnyRoute & {
  _path: string
  _id: string
  _fullPath: string
  _to: string
}

function handleRouteUpdate(
  oldRoute: AnyRouteWithPrivateProps,
  newRoute: AnyRouteWithPrivateProps,
) {
  newRoute._path = oldRoute._path
  newRoute._id = oldRoute._id
  newRoute._fullPath = oldRoute._fullPath
  newRoute._to = oldRoute._to
  newRoute.children = oldRoute.children
  newRoute.parentRoute = oldRoute.parentRoute

  const router = window.__TSR_ROUTER__!
  router.routesById[newRoute.id] = newRoute
  router.routesByPath[newRoute.fullPath] = newRoute
  router.processedTree.matchCache.clear()
  router.processedTree.flatCache?.clear()
  router.processedTree.singleCache.clear()
  router.resolvePathCache.clear()
  // TODO: how to rebuild the tree if we add a new route?
  walkReplaceSegmentTree(newRoute, router.processedTree.segmentTree)
  const filter = (m: AnyRouteMatch) => m.routeId === oldRoute.id
  if (
    router.state.matches.find(filter) ||
    router.state.pendingMatches?.find(filter)
  ) {
    router.invalidate({ filter })
  }
  function walkReplaceSegmentTree(
    route: AnyRouteWithPrivateProps,
    node: AnyRouter['processedTree']['segmentTree'],
  ) {
    if (node.route?.id === route.id) node.route = route
    if (node.notFound?.id === route.id) node.notFound = route

    node.static?.forEach((child) => walkReplaceSegmentTree(route, child))
    node.staticInsensitive?.forEach((child) =>
      walkReplaceSegmentTree(route, child),
    )
    node.dynamic?.forEach((child) => walkReplaceSegmentTree(route, child))
    node.optional?.forEach((child) => walkReplaceSegmentTree(route, child))
    node.wildcard?.forEach((child) => walkReplaceSegmentTree(route, child))
  }
}

export const routeHmrStatement = template.statement(
  `
if (import.meta.hot) {
  import.meta.hot.accept((newModule) => {
    if (Route && newModule && newModule.Route) {
      (${handleRouteUpdate.toString()})(Route, newModule.Route)
    }
   })
}
`,
  // Disable placeholder parsing so identifiers like __TSR_ROUTER__ are treated as normal identifiers instead of template placeholders
  { placeholderPattern: false },
)()
