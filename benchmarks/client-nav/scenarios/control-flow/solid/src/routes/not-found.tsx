import { createRoute, notFound } from '@tanstack/solid-router'
import { CONTROL_FLOW_PATHS, NOT_FOUND_MARKER } from '../../../shared'
import {
  ControlFlowMarker,
  EmptyPage,
  parseFlowParams,
  stringifyFlowParams,
} from '../control-flow'
import { rootRoute } from './__root'

export const notFoundRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: CONTROL_FLOW_PATHS.notFound,
  params: {
    parse: parseFlowParams,
    stringify: stringifyFlowParams,
  },
  loader: () => {
    throw notFound()
  },
  notFoundComponent: NotFoundPage,
  component: EmptyPage,
})

function NotFoundPage() {
  return <ControlFlowMarker {...NOT_FOUND_MARKER} />
}
