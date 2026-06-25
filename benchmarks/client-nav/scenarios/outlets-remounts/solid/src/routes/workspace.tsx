import { Outlet, createRoute } from '@tanstack/solid-router'
import { outletsRemountsScenarioSlug } from '../../../shared'
import { createRouteLifecycleOptions } from '../outletsRemountsRuntime'
import { RouteShell } from '../routeShell'
import { rootRoute } from './__root'

function WorkspaceLayout() {
  return (
    <RouteShell routeId="workspace" marker={() => 'workspace'}>
      <div data-client-nav-scenario={outletsRemountsScenarioSlug} />
      <Outlet />
    </RouteShell>
  )
}

export const workspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workspace',
  ...createRouteLifecycleOptions('workspace'),
  component: WorkspaceLayout,
})
