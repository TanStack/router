import { hydrate as hydrateRouter } from '@tanstack/router-core/ssr/client'
import { hydrate } from 'solid-js/web'
import { RouterProvider, createRouter } from '../../src'
import { createRouteTree } from './routeTree'

// Mirrors Solid Start's client entry: hydrate the router, then hydrate the
// document with `StartClient` (which renders `<RouterProvider>`).
export async function hydrateDocument() {
  const router = createRouter({ routeTree: createRouteTree() })
  await hydrateRouter(router).finally(() => window.$_TSR?.h())
  const dispose = hydrate(() => <RouterProvider router={router} />, document)
  return { router, dispose }
}
