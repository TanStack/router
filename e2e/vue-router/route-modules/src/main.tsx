import { createApp, h } from 'vue'
import { RouterProvider, createRouter } from '@tanstack/vue-router'
import { routeTree } from './routeTree.gen'

const observedModuleMatches: Array<string | undefined> = []
Object.assign(window, { observedModuleMatches })
const router = createRouter({
  routeTree,
  context: { onProfileMatch: (routeId) => observedModuleMatches.push(routeId) },
})
declare module '@tanstack/vue-router' {
  interface Register {
    router: typeof router
  }
}
createApp({ setup: () => () => h(RouterProvider, { router }) }).mount('#app')
