import { expect, test } from 'vitest'
import {
  Outlet,
  createLazyRoute,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from '../src'
import {
  RouterServer,
  createRequestHandler,
  renderRouterToString,
} from '../src/ssr/server'

test('P07: generic SSR preserves redirect response status and headers', async () => {
  const rootRoute = createRootRoute({ component: Outlet })
  const sourceRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/source',
    beforeLoad: () => {
      throw redirect({
        href: '/target',
        statusCode: 307,
        headers: { 'x-redirect-source': 'beforeLoad' },
      })
    },
  })
  const targetRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/target',
    component: () => <div>target</div>,
  })
  const handler = createRequestHandler({
    request: new Request('http://localhost/source'),
    createRouter: () =>
      createRouter({
        routeTree: rootRoute.addChildren([sourceRoute, targetRoute]),
        isServer: true,
      }),
  })

  const response = await handler(({ router, responseHeaders }) =>
    renderRouterToString({
      router,
      responseHeaders,
      children: <RouterServer router={router} />,
    }),
  )

  expect.soft(response.status).toBe(307)
  expect(response.headers.get('location')).toBe('/target')
  expect(response.headers.get('x-redirect-source')).toBe('beforeLoad')
})

test('P11: a functional ssr failure renders its lazy error boundary', async () => {
  const rootRoute = createRootRoute({ component: Outlet })
  const reportsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/reports',
    ssr: () => {
      throw new Error('ssr selection failed')
    },
    component: () => <div>reports</div>,
  })

  reportsRoute.lazy(() =>
    Promise.resolve(
      createLazyRoute('/reports')({
        errorComponent: ({ error }) => (
          <div>lazy reports boundary: {error.message}</div>
        ),
      }),
    ),
  )

  const handler = createRequestHandler({
    request: new Request('http://localhost/reports'),
    createRouter: () =>
      createRouter({
        routeTree: rootRoute.addChildren([reportsRoute]),
        isServer: true,
      }),
  })

  const response = await handler(({ router, responseHeaders }) =>
    renderRouterToString({
      router,
      responseHeaders,
      children: <RouterServer router={router} />,
    }),
  )

  expect(response.status).toBe(500)
  expect(await response.text()).toContain(
    'lazy reports boundary: ssr selection failed',
  )
})
