import { createRoute } from '@tanstack/solid-router'
import { CONTROL_FLOW_PATHS } from '../../../shared'
import {
  ControlFlowMarker,
  parseFlowParams,
  stringifyFlowParams,
} from '../control-flow'
import { rootRoute } from './__root'

export const targetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: CONTROL_FLOW_PATHS.target,
  params: {
    parse: parseFlowParams,
    stringify: stringifyFlowParams,
  },
  component: TargetPage,
})

function TargetPage() {
  const params = targetRoute.useParams()

  return <ControlFlowMarker branch="target" value={params().id} />
}
