import { h } from 'vue'
import { createRootRoute } from '@tanstack/vue-router'
import RootComponent from './__root.component.vue'
import NotFoundComponent from './__root.notFoundComponent.vue'

export const Route = createRootRoute({
  component: () => h(RootComponent),
  notFoundComponent: () => h(NotFoundComponent),
})
