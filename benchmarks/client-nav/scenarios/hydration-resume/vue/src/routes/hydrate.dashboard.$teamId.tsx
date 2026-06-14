import * as Vue from 'vue'
import { createRoute } from '@tanstack/vue-router'
import {
  buildTeamLoaderData,
  normalizeDashboardSearch,
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
          data-hydration-resume-marker="dashboard"
          data-team-id={params.value.teamId}
          data-tab={search.value.tab}
          data-cursor={search.value.cursor}
          data-source={loaderData.value.source}
          data-context-seed={routeContext.value.teamBeforeSeed}
        />
      </>
    )
  },
})

export const teamRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: '$teamId',
  validateSearch: (search: Record<string, unknown>) =>
    normalizeDashboardSearch(search),
  loaderDeps: ({ search }) => ({
    tab: search.tab,
    cursor: search.cursor,
  }),
  beforeLoad: () => {
    const fixture = getDashboardFixture()
    hydrationResumeRuntime.recordBeforeLoad('teamBeforeLoad')
    return {
      teamBeforeSeed: fixture.seed + 11,
    }
  },
  loader: () => {
    const sequence = hydrationResumeRuntime.recordLoader('team')
    return buildTeamLoaderData(getDashboardFixture(), 'client', sequence)
  },
  staleTime: Infinity,
  gcTime: Infinity,
  component: TeamPage,
})
