import { createRoute } from '@tanstack/solid-router'
import { rootRoute } from './__root'

export const teamProjectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/teams/$teamId/projects/$projectId',
  component: TeamProjectPage,
})

function TeamProjectPage() {
  const params = teamProjectRoute.useParams()

  return (
    <div
      data-route-marker="team-project"
      data-team-id={params().teamId}
      data-project-id={params().projectId}
    />
  )
}
