import { RouterProvider, createRouter } from '../../src'
import {
  createRequestHandler,
  renderRouterToString,
} from '../../src/ssr/server'
import { createRouteTree } from './routeTree'
import type { HydrationCase } from './routeTree'

// Mirrors Solid Start's server entry (`StartServer` renders `<RouterProvider>`).
export async function renderDocument(entry: HydrationCase): Promise<string> {
  const response = await createRequestHandler({
    request: new Request(`http://localhost${entry.path}`),
    createRouter: () =>
      createRouter({ routeTree: createRouteTree(entry), isServer: true }),
  })(({ router, responseHeaders }) =>
    renderRouterToString({
      router,
      responseHeaders,
      children: () => <RouterProvider router={router} />,
    }),
  )
  return response.text()
}
