import * as Vue from 'vue'
import { createRoute } from '@tanstack/vue-router'
import { ERROR_MARKER, createShallowControlFlowError } from '../../../shared'
import {
  EmptyPage,
  createControlFlowMarkerElement,
  parseFlowParams,
  stringifyFlowParams,
} from '../control-flow'
import { rootRoute } from './__root'

const ErrorPage: ReturnType<typeof Vue.defineComponent> = Vue.defineComponent({
  setup() {
    return () => createControlFlowMarkerElement(ERROR_MARKER)
  },
})

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
