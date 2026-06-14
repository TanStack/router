import { Outlet, createRoute } from '@tanstack/react-router'
import { createRouteLifecycleOptions } from '../outletsRemountsRuntime'
import { RouteShell } from '../routeShell'
import { orgRoute } from './workspace.$orgId'

function ProjectsLayout() {
  const params = projectsRoute.useParams()
  const marker = `projects:${params.orgId}`

  return (
    <RouteShell routeId="projects" marker={marker}>
      <Outlet />
    </RouteShell>
  )
}

export const projectsRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: 'projects',
  ...createRouteLifecycleOptions('projects'),
  component: ProjectsLayout,
})
