import { createRoute } from '@tanstack/solid-router'
import {
  ControlFlowMarker,
  parseFlowParams,
  stringifyFlowParams,
} from '../control-flow'
import { rootRoute } from './__root'

export const targetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/flow/target/$id',
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
