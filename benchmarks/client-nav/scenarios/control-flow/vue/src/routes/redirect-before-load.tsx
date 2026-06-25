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

export const redirectBeforeLoadRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: CONTROL_FLOW_PATHS.redirectBeforeLoad,
  params: {
    parse: parseFlowParams,
    stringify: stringifyFlowParams,
  },
  beforeLoad: ({ params }) => {
    throw redirect(createControlFlowTargetRedirect(params.id))
  },
  component: EmptyPage,
})
