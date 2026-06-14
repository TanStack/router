import { createRoute } from '@tanstack/solid-router'
import { CONTROL_FLOW_PATHS, UNMATCHED_MARKER } from '../../../shared'
import { ControlFlowMarker } from '../control-flow'
import { rootRoute } from './__root'

export const fallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: CONTROL_FLOW_PATHS.fallback,
  component: FallbackPage,
})

function FallbackPage() {
  return <ControlFlowMarker {...UNMATCHED_MARKER} />
}
