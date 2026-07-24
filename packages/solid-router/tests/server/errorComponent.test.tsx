import { describe, expect, it } from 'vitest'
import { createRootRoute, createRoute, createRouter } from '../../src'
import {
  RouterServer,
  createRequestHandler,
  renderRouterToString,
} from '../../src/ssr/server'

describe('errorComponent (server)', () => {
  it('renders the route error component when a loader throws during SSR', async () => {
    const rootRoute = createRootRoute()

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      loader: () => {
        throw new Error('loader boom')
      },
      component: () => <div>Index route</div>,
      errorComponent: ({ error }) => (
        <div data-testid="error-component">Route error: {error.message}</div>
      ),
    })

    const routeTree = rootRoute.addChildren([indexRoute])
    const handler = createRequestHandler({
      request: new Request('http://localhost/'),
      createRouter: () => createRouter({ routeTree, isServer: true }),
    })

    const response = await handler(({ router, responseHeaders }) =>
      renderRouterToString({
        router,
        responseHeaders,
        children: () => <RouterServer router={router} />,
      }),
    )

    expect(response.status).toBe(500)
    const html = await response.text()
    expect(html).toContain('data-testid="error-component"')
    expect(html).toContain('loader boom')
    expect(html).not.toContain('Index route')
  })
})
