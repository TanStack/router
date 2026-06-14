import * as Vue from 'vue'
import { createRoute } from '@tanstack/vue-router'
import { Route as rootRoute } from './__root'

const DeferredIndex = Vue.defineComponent({
  setup() {
    return () => <main data-deferred-page="index" />
  },
})

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/deferred',
  component: DeferredIndex,
})
