import * as Vue from 'vue'
import { createRoute } from '@tanstack/vue-router'
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
  path: '/flow/target/$id',
  params: {
    parse: parseFlowParams,
    stringify: stringifyFlowParams,
  },
  component: TargetPage,
})
