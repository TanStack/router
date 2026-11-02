import { render } from 'solid-js/web'
import { RouterProvider, createRouteModuleRouter } from '@tanstack/solid-router'
import { routeTree } from './routeTree.gen'

const observedModuleMatches: Array<string | undefined> = []
Object.assign(window, { observedModuleMatches })
const router = createRouteModuleRouter({
  routeTree,
  context: { onProfileMatch: (routeId) => observedModuleMatches.push(routeId) },
})
declare module '@tanstack/solid-router' {
  interface Register {
    router: typeof router
  }
}
render(
  () => <RouterProvider router={router} />,
  document.getElementById('app')!,
)
