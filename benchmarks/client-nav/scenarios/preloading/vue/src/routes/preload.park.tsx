import { createRoute } from '@tanstack/vue-router'
import type { createRootRouteForPreloading } from './__root'

type RootRoute = ReturnType<typeof createRootRouteForPreloading>

export function createParkRoute(rootRoute: RootRoute) {
  return createRoute({
    getParentRoute: () => rootRoute,
    path: '/preload/park',
    component: ParkPage,
  })
}

function ParkPage() {
  return <article data-preloading-page="park">Park</article>
}
