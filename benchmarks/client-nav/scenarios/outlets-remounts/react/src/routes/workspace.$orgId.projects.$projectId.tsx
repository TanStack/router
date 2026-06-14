import { Outlet, createRoute } from '@tanstack/react-router'
import { createOutletsRemountsProjectMarker } from '../../../shared'
import { createRouteLifecycleOptions } from '../outletsRemountsRuntime'
import { RouteShell } from '../routeShell'
import { projectsRoute } from './workspace.$orgId.projects'

function ProjectLayout() {
  const params = projectRoute.useParams()
  const marker = createOutletsRemountsProjectMarker(params)

  return (
    <RouteShell routeId="project" marker={marker}>
      <Outlet />
    </RouteShell>
  )
}

export const projectRoute = createRoute({
  getParentRoute: () => projectsRoute,
  path: '$projectId',
  ...createRouteLifecycleOptions('project'),
  remountDeps: ({ params }) => ({
    projectId: params.projectId,
  }),
  component: ProjectLayout,
})
