import * as Vue from 'vue'
import { Outlet, createRootRoute } from '@tanstack/vue-router'

const Root: ReturnType<typeof Vue.defineComponent> = Vue.defineComponent({
  setup() {
    return () => <Outlet />
  },
})

export const rootRoute = createRootRoute({
  component: Root,
})
