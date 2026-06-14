import { createRoute, redirect } from '@tanstack/vue-router'
import {
  CONTROL_FLOW_PATHS,
  createControlFlowTargetRedirect,
} from '../../../shared'
import {
  EmptyPage,
  parseFlowParams,
  stringifyFlowParams,
} from '../control-flow'
import { rootRoute } from './__root'

export const redirectLoaderRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: CONTROL_FLOW_PATHS.redirectLoader,
  params: {
    parse: parseFlowParams,
    stringify: stringifyFlowParams,
  },
  loader: ({ params }) => {
    throw redirect(createControlFlowTargetRedirect(params.id))
  },
  component: EmptyPage,
})
