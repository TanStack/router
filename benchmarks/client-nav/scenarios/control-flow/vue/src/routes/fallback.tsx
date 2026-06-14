import * as Vue from 'vue'
import { createRoute } from '@tanstack/vue-router'
import { CONTROL_FLOW_PATHS, UNMATCHED_MARKER } from '../../../shared'
import { createControlFlowMarkerElement } from '../control-flow'
import { rootRoute } from './__root'

const FallbackPage: ReturnType<typeof Vue.defineComponent> =
  Vue.defineComponent({
    setup() {
      return () => createControlFlowMarkerElement(UNMATCHED_MARKER)
    },
  })

export const fallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: CONTROL_FLOW_PATHS.fallback,
  component: FallbackPage,
})
