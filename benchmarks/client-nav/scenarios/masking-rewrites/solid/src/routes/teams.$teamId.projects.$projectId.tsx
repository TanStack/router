import { createRoute } from '@tanstack/solid-router'
import { MASKING_ROUTE_MARKERS, MASKING_ROUTE_PATHS } from '../../../shared.ts'
import { rootRoute } from './__root'

export const teamProjectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: MASKING_ROUTE_PATHS.teamProject,
  component: TeamProjectPage,
})

function TeamProjectPage() {
  const params = teamProjectRoute.useParams()

  return (
    <div
      data-route-marker={MASKING_ROUTE_MARKERS.teamProject}
      data-team-id={params().teamId}
      data-project-id={params().projectId}
    />
  )
}
