import { createRoute } from '@tanstack/solid-router'
import { UNMATCHED_MARKER } from '../../../shared'
import { ControlFlowMarker } from '../control-flow'
import { rootRoute } from './__root'

export const fallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/flow/$',
  component: FallbackPage,
})

function FallbackPage() {
  return <ControlFlowMarker {...UNMATCHED_MARKER} />
}
