import { h } from 'vue'
import { createRootRoute } from '@tanstack/vue-router'
import RootComponent from './-components/RootComponent.vue'
import NotFoundComponent from './-components/NotFoundComponent.vue'

export const Route = createRootRoute({
  component: () => h(RootComponent),
  notFoundComponent: () => h(NotFoundComponent),
})
