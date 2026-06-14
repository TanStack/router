import { Outlet, createRoute } from '@tanstack/solid-router'
import { createOutletsRemountsBoardMarker } from '../../../shared'
import { createRouteLifecycleOptions } from '../outletsRemountsRuntime'
import { RouteShell } from '../routeShell'
import { projectRoute } from './workspace.$orgId.projects.$projectId'

function BoardLayout() {
  const params = boardRoute.useParams()
  const marker = () => createOutletsRemountsBoardMarker(params())

  return (
    <RouteShell routeId="board" marker={marker}>
      <Outlet />
    </RouteShell>
  )
}

export const boardRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: 'boards/$boardId',
  ...createRouteLifecycleOptions('board'),
  remountDeps: ({ params }) => ({
    boardId: params.boardId,
  }),
  component: BoardLayout,
})
