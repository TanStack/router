import * as Vue from 'vue'
import { createRoute } from '@tanstack/vue-router'
import { CONTROL_FLOW_PATHS } from '../../../shared'
import {
  createControlFlowMarkerElement,
  parseFlowParams,
  stringifyFlowParams,
} from '../control-flow'
import { rootRoute } from './__root'

const TargetPage: ReturnType<typeof Vue.defineComponent> = Vue.defineComponent({
  setup() {
    const params = targetRoute.useParams()

    return () =>
      createControlFlowMarkerElement({
        branch: 'target',
        value: params.value.id,
      })
  },
})

export const targetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: CONTROL_FLOW_PATHS.target,
  params: {
    parse: parseFlowParams,
    stringify: stringifyFlowParams,
  },
  component: TargetPage,
})
