import { createRoute, notFound } from '@tanstack/react-router'
import { NOT_FOUND_MARKER } from '../../../shared'
import {
  ControlFlowMarker,
  EmptyPage,
  parseFlowParams,
  stringifyFlowParams,
} from '../control-flow'
import { rootRoute } from './__root'

export const notFoundRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/flow/not-found/$id',
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
