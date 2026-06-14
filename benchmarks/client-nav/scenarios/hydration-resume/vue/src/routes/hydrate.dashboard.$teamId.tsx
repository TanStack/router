import * as Vue from 'vue'
import { createRoute } from '@tanstack/vue-router'
import {
  buildTeamBeforeLoadContext,
  buildTeamLoaderData,
  createDashboardHydrationMarkerAttributes,
  hydrationResumeRouteGcTime,
  hydrationResumeRouteStaleTime,
  normalizeDashboardSearch,
  pickDashboardLoaderDeps,
} from '../../../shared.ts'
import { PerfSubscriber, subscriberSlots } from '../perf'
import { getDashboardFixture, hydrationResumeRuntime } from '../runtime'
import { dashboardRoute } from './hydrate.dashboard'

const TeamPage = Vue.defineComponent({
  setup() {
    const params = teamRoute.useParams()
    const search = teamRoute.useSearch()
    const loaderData = teamRoute.useLoaderData()
    const routeContext = teamRoute.useRouteContext()

    return () => (
      <>
        {subscriberSlots.map((slot) => (
          <PerfSubscriber
            key={`team-${slot}`}
            seed={
              loaderData.value.checksum +
              routeContext.value.teamBeforeSeed +
              slot
            }
          />
        ))}
        <div
          {...createDashboardHydrationMarkerAttributes(
            params.value.teamId,
            search.value,
            loaderData.value,
            routeContext.value.teamBeforeSeed,
          )}
        />
      </>
    )
  },
})

export const teamRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: '$teamId',
  validateSearch: normalizeDashboardSearch,
  loaderDeps: ({ search }) => pickDashboardLoaderDeps(search),
  beforeLoad: () => {
    const fixture = getDashboardFixture()
    hydrationResumeRuntime.recordBeforeLoad('teamBeforeLoad')
    return buildTeamBeforeLoadContext(fixture)
  },
  loader: () => {
    const sequence = hydrationResumeRuntime.recordLoader('team')
    return buildTeamLoaderData(getDashboardFixture(), 'client', sequence)
  },
  staleTime: hydrationResumeRouteStaleTime,
  gcTime: hydrationResumeRouteGcTime,
  component: TeamPage,
})
