import { createRoute } from '@tanstack/react-router'
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

function TeamPage() {
  const params = teamRoute.useParams()
  const search = teamRoute.useSearch()
  const loaderData = teamRoute.useLoaderData()
  const routeContext = teamRoute.useRouteContext()

  return (
    <>
      {subscriberSlots.map((slot) => (
        <PerfSubscriber
          key={`team-${slot}`}
          seed={loaderData.checksum + routeContext.teamBeforeSeed + slot}
        />
      ))}
      <div
        {...createDashboardHydrationMarkerAttributes(
          params.teamId,
          search,
          loaderData,
          routeContext.teamBeforeSeed,
        )}
      />
    </>
  )
}
