import { For } from 'solid-js'
import { createRoute } from '@tanstack/solid-router'
import {
  buildTeamLoaderData,
  normalizeDashboardSearch,
} from '../../../shared.ts'
import { PerfSubscriber, subscriberSlots } from '../perf'
import { getDashboardFixture, hydrationResumeRuntime } from '../runtime'
import { dashboardRoute } from './hydrate.dashboard'

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

function TeamPage() {
  const params = teamRoute.useParams()
  const search = teamRoute.useSearch()
  const loaderData = teamRoute.useLoaderData()
  const routeContext = teamRoute.useRouteContext()

  return (
    <>
      <For each={subscriberSlots}>
        {(slot) => (
          <PerfSubscriber
            seed={loaderData().checksum + routeContext().teamBeforeSeed + slot}
          />
        )}
      </For>
      <div
        data-hydration-resume-marker="dashboard"
        data-team-id={params().teamId}
        data-tab={search().tab}
        data-cursor={search().cursor}
        data-source={loaderData().source}
        data-context-seed={routeContext().teamBeforeSeed}
      />
    </>
  )
}
