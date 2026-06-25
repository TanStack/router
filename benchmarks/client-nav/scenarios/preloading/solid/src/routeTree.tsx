import { createRootRouteForPreloading } from './routes/__root'
import { createLazyPreloadRoute } from './routes/preload.lazy.$lazyId'
import { createPreloadIndexRoute } from './routes/preload'
import { createItemRoutes } from './routes/preload.items.$itemId'
import { createParkRoute } from './routes/preload.park'
import { createReportRoute } from './routes/preload.reports.$reportId'

export function createRouteTree() {
  const rootRoute = createRootRouteForPreloading()
  const preloadIndexRoute = createPreloadIndexRoute(rootRoute)
  const { itemRoute, itemDetailsRoute } = createItemRoutes(rootRoute)
  const reportRoute = createReportRoute(rootRoute)
  const parkRoute = createParkRoute(rootRoute)
  const lazyRoute = createLazyPreloadRoute(rootRoute)

  return rootRoute.addChildren([
    preloadIndexRoute,
    itemRoute.addChildren([itemDetailsRoute]),
    reportRoute,
    parkRoute,
    lazyRoute,
  ])
}
