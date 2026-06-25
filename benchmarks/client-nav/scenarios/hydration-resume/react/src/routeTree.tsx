import type { HydrationResumeRouteIds } from '../../shared.ts'
import { rootRoute } from './routes/__root'
import { dashboardRoute } from './routes/hydrate.dashboard'
import { teamRoute } from './routes/hydrate.dashboard.$teamId'
import { deferredRoute } from './routes/hydrate.deferred.$itemId'
import { liveRoute } from './routes/hydrate.live.$itemId'
import { hydrateRoute } from './routes/hydrate'

export const routeTree = rootRoute.addChildren([
  hydrateRoute.addChildren([
    dashboardRoute.addChildren([teamRoute]),
    deferredRoute,
    liveRoute,
  ]),
])

export function getHydrationResumeRouteIds(): HydrationResumeRouteIds {
  return {
    hydrate: hydrateRoute.id,
    dashboard: dashboardRoute.id,
    team: teamRoute.id,
    deferred: deferredRoute.id,
    live: liveRoute.id,
  }
}
