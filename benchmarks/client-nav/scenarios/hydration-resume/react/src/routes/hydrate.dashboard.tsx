import { Outlet, createRoute } from '@tanstack/react-router'
import {
  buildDashboardBeforeLoadContext,
  buildDashboardLoaderData,
  hydrationResumeRouteGcTime,
  hydrationResumeRouteStaleTime,
} from '../../../shared.ts'
import { PerfSubscriber, subscriberSlots } from '../perf'
import { getDashboardFixture, hydrationResumeRuntime } from '../runtime'
import { hydrateRoute } from './hydrate'

export const dashboardRoute = createRoute({
  getParentRoute: () => hydrateRoute,
  path: 'dashboard',
  beforeLoad: () => {
    const fixture = getDashboardFixture()
    hydrationResumeRuntime.recordBeforeLoad('dashboardBeforeLoad')
    return buildDashboardBeforeLoadContext(fixture)
  },
  loader: () => {
    const sequence = hydrationResumeRuntime.recordLoader('dashboard')
    return buildDashboardLoaderData(getDashboardFixture(), 'client', sequence)
  },
  staleTime: hydrationResumeRouteStaleTime,
  gcTime: hydrationResumeRouteGcTime,
  component: DashboardLayout,
})

function DashboardLayout() {
  const loaderData = dashboardRoute.useLoaderData()
  const routeContext = dashboardRoute.useRouteContext()

  return (
    <>
      {subscriberSlots.map((slot) => (
        <PerfSubscriber
          key={`dashboard-${slot}`}
          seed={loaderData.checksum + routeContext.dashboardBeforeSeed + slot}
        />
      ))}
      <Outlet />
    </>
  )
}
