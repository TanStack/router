import { hydrate as hydrateRouter } from '@tanstack/router-core/ssr/client'
import { hydrate } from 'solid-js/web'
import { RouterProvider, createRouter } from '../../src'
import { createRouteTree, stats } from './routeTree'
import type { NavigationCase } from './routeTree'

// Mirrors Solid Start's client entry: hydrate the router, then hydrate the
// document with `StartClient` (which renders `<RouterProvider>`).
export async function hydrateDocument(entry: NavigationCase) {
  const router = createRouter({ routeTree: createRouteTree(entry, 'client') })
  await hydrateRouter(router).finally(() => window.$_TSR?.h())
  const dispose = hydrate(() => <RouterProvider router={router} />, document)
  return { router, dispose, stats }
}
