import { createRoute } from '@tanstack/solid-router'
import {
  CONTROL_FLOW_PATHS,
  ERROR_MARKER,
  createShallowControlFlowError,
} from '../../../shared'
import {
  ControlFlowMarker,
  EmptyPage,
  parseFlowParams,
  stringifyFlowParams,
} from '../control-flow'
import { rootRoute } from './__root'

export const errorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: CONTROL_FLOW_PATHS.error,
  params: {
    parse: parseFlowParams,
    stringify: stringifyFlowParams,
  },
  loader: ({ params }) => {
    throw createShallowControlFlowError('loader', params.id)
  },
  errorComponent: ErrorPage,
  component: EmptyPage,
})

function ErrorPage() {
  return <ControlFlowMarker {...ERROR_MARKER} />
}
