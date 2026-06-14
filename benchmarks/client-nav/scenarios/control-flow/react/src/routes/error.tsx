import { createRoute } from '@tanstack/react-router'
import { ERROR_MARKER, createShallowControlFlowError } from '../../../shared'
import {
  ControlFlowMarker,
  EmptyPage,
  parseFlowParams,
  stringifyFlowParams,
} from '../control-flow'
import { rootRoute } from './__root'

export const errorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/flow/error/$id',
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
