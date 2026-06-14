import * as Vue from 'vue'
import { Outlet, createRootRoute } from '@tanstack/vue-router'

const RootComponent = Vue.defineComponent({
  setup() {
    return () => <Outlet />
  },
})

export const Route = createRootRoute({
  component: RootComponent,
})
