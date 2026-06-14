import * as Vue from 'vue'
import { Outlet, createRootRoute } from '@tanstack/vue-router'

const Root = Vue.defineComponent({
  setup() {
    return () => <Outlet />
  },
})

export const rootRoute = createRootRoute({
  component: Root,
})
