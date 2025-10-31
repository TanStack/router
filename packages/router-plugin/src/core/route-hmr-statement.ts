import * as template from '@babel/template'
import type { AnyRoute, AnyRouteMatch } from '@tanstack/router-core'

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
  const oldRouteIndex = router.flatRoutes.indexOf(oldRoute)
  if (oldRouteIndex > -1) {
    router.flatRoutes[oldRouteIndex] = newRoute
  }
  const filter = (m: AnyRouteMatch) => m.routeId === oldRoute.id
  if (
    router.state.matches.find(filter) ||
    router.state.pendingMatches?.find(filter)
  ) {
    router.invalidate({ filter })
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
