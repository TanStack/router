import { h } from 'vue'
import { createRootRoute } from '@tanstack/vue-router'
import RootComponent from './-RootComponent.vue'
import NotFoundComponent from './-NotFoundComponent.vue'

export const Route = createRootRoute({
  component: () => h(RootComponent),
  notFoundComponent: () => h(NotFoundComponent),
})
