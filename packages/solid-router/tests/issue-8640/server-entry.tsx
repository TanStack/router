import { RouterProvider, createRouter } from '../../src'
import {
  createRequestHandler,
  renderRouterToString,
} from '../../src/ssr/server'
import { createRouteTree } from './routeTree'

// Mirrors Solid Start's server entry (`StartServer` renders `<RouterProvider>`).
export async function renderDocument(path: string): Promise<string> {
  const response = await createRequestHandler({
    request: new Request(`http://localhost${path}`),
    createRouter: () =>
      createRouter({ routeTree: createRouteTree(), isServer: true }),
  })(({ router, responseHeaders }) =>
    renderRouterToString({
      router,
      responseHeaders,
      children: () => <RouterProvider router={router} />,
    }),
  )
  return response.text()
}
