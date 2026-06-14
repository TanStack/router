import * as Vue from 'vue'
import { createRoute, notFound } from '@tanstack/vue-router'
import { CONTROL_FLOW_PATHS, NOT_FOUND_MARKER } from '../../../shared'
import {
  EmptyPage,
  createControlFlowMarkerElement,
  parseFlowParams,
  stringifyFlowParams,
} from '../control-flow'
import { rootRoute } from './__root'

const NotFoundPage: ReturnType<typeof Vue.defineComponent> =
  Vue.defineComponent({
    setup() {
      return () => createControlFlowMarkerElement(NOT_FOUND_MARKER)
    },
  })

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
