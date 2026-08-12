import { expect, test } from 'vitest'
import { Outlet, createRootRoute, createRoute, createRouter } from '../src'
import {
  RouterServer,
  createRequestHandler,
  renderRouterToStream,
} from '../src/ssr/server'

// https://github.com/TanStack/router/issues/8053
test('a root pendingComponent does not wrap the SSR document in Suspense', async () => {
  const rootRoute = createRootRoute({
    pendingComponent: () => null,
    component: () => (
      <html>
        <head>
          <title>Root document</title>
        </head>
        <body>
          <Outlet />
        </body>
      </html>
    ),
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <main>Root content</main>,
  })
  const handler = createRequestHandler({
    request: new Request('http://localhost/'),
    createRouter: () =>
      createRouter({
        routeTree: rootRoute.addChildren([indexRoute]),
        isServer: true,
      }),
  })

  const response = await handler(({ request, router, responseHeaders }) =>
    renderRouterToStream({
      request,
      router,
      responseHeaders,
      children: <RouterServer router={router} />,
    }),
  )
  const html = await response.text()
  const serverDocument = new DOMParser().parseFromString(html, 'text/html')

  expect(response.status).toBe(200)
  expect(serverDocument.body.textContent).toContain('Root content')
  expect(html).not.toContain('<!--html--><!--head--><!--body-->')
})
