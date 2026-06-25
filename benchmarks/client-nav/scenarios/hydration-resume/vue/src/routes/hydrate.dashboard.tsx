import * as Vue from 'vue'
import { Outlet, createRoute } from '@tanstack/vue-router'
import {
  buildDashboardBeforeLoadContext,
  buildDashboardLoaderData,
  hydrationResumeRouteGcTime,
  hydrationResumeRouteStaleTime,
} from '../../../shared.ts'
import { PerfSubscriber, subscriberSlots } from '../perf'
import { getDashboardFixture, hydrationResumeRuntime } from '../runtime'
import { hydrateRoute } from './hydrate'

const DashboardLayout = Vue.defineComponent({
  setup() {
    const loaderData = dashboardRoute.useLoaderData()
    const routeContext = dashboardRoute.useRouteContext()

    return () => (
      <>
        {subscriberSlots.map((slot) => (
          <PerfSubscriber
            key={`dashboard-${slot}`}
            seed={
              loaderData.value.checksum +
              routeContext.value.dashboardBeforeSeed +
              slot
            }
          />
        ))}
        <Outlet />
      </>
    )
  },
})

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
