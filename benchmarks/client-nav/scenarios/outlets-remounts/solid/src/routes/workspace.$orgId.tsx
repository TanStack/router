import { Outlet, createRoute } from '@tanstack/solid-router'
import { createOutletsRemountsMarker } from '../../../shared'
import { createRouteLifecycleOptions } from '../outletsRemountsRuntime'
import { RouteShell } from '../routeShell'
import { workspaceRoute } from './workspace'

function OrgLayout() {
  const params = orgRoute.useParams()
  const marker = () =>
    createOutletsRemountsMarker({
      kind: 'org',
      orgId: params().orgId,
    })

  return (
    <RouteShell routeId="org" marker={marker}>
      <div data-outlets-org-marker={marker()} data-org-id={params().orgId} />
      <Outlet />
    </RouteShell>
  )
}

export const orgRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '$orgId',
  ...createRouteLifecycleOptions('org'),
  component: OrgLayout,
})
