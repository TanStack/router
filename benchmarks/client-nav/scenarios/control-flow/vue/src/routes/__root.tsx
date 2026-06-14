import * as Vue from 'vue'
import { Outlet, createRootRoute } from '@tanstack/vue-router'
import { UNMATCHED_MARKER } from '../../../shared'
import { createControlFlowMarkerElement } from '../control-flow'

const Root: ReturnType<typeof Vue.defineComponent> = Vue.defineComponent({
  setup() {
    return () => <Outlet />
  },
})

const RootNotFoundComponent: ReturnType<typeof Vue.defineComponent> =
  Vue.defineComponent({
    setup() {
      return () => createControlFlowMarkerElement(UNMATCHED_MARKER)
    },
  })

const RootErrorComponent: ReturnType<typeof Vue.defineComponent> =
  Vue.defineComponent({
    setup() {
      return () =>
        createControlFlowMarkerElement({ branch: 'error', value: 'root' })
    },
  })

export const rootRoute = createRootRoute({
  component: Root,
  notFoundComponent: RootNotFoundComponent,
  errorComponent: RootErrorComponent,
})
