import { createRoute } from '@tanstack/solid-router'
import { createOutletsRemountsMarker } from '../../../shared'
import { createRouteLifecycleOptions } from '../outletsRemountsRuntime'
import { RouteShell } from '../routeShell'
import { boardRoute } from './workspace.$orgId.projects.$projectId.boards.$boardId'

function CardPage() {
  const params = cardRoute.useParams()
  const marker = () =>
    createOutletsRemountsMarker({
      kind: 'card',
      orgId: params().orgId,
      projectId: params().projectId,
      boardId: params().boardId,
      cardId: params().cardId,
    })

  return (
    <RouteShell routeId="card" marker={marker}>
      <main
        data-outlets-card-marker={marker()}
        data-org-id={params().orgId}
        data-project-id={params().projectId}
        data-board-id={params().boardId}
        data-card-id={params().cardId}
      />
    </RouteShell>
  )
}

export const cardRoute = createRoute({
  getParentRoute: () => boardRoute,
  path: 'cards/$cardId',
  ...createRouteLifecycleOptions('card'),
  component: CardPage,
})
