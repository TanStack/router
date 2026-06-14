import * as Vue from 'vue'
import { Outlet, createRoute } from '@tanstack/vue-router'
import { stateRoute } from './state'

const SectionLayout = Vue.defineComponent({
  setup() {
    return () => <Outlet />
  },
})

export const sectionRoute = createRoute({
  getParentRoute: () => stateRoute,
  path: '$section',
  component: SectionLayout,
})
