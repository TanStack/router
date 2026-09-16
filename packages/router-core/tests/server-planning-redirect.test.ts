import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, redirect } from '../src'
import { createRequestHandler } from '../src/ssr/server'
import { createTestRouter, loadServerResponse } from './routerTestUtils'

test.each([false, true])(
  'a route-context planning redirect is control with isServer=%s',
  async (isServer) => {
    const rootRoute = new BaseRootRoute({})
    const sourceRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/source',
      context: () => {
        throw redirect({ to: '/target' })
      },
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([sourceRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/source'] }),
      isServer,
    })

    if (isServer) {
      const response = await loadServerResponse(router, '/source')

      expect(response.status).toBe(307)
      expect(response.headers.get('Location')).toBe('/target')
    } else {
      await router.load()

      expect(router.state.location.pathname).toBe('/target')
      expect(router.state.matches.at(-1)).toMatchObject({
        routeId: targetRoute.id,
        status: 'success',
      })
    }
  },
)

test.each(['GET', 'POST'])(
  'the generic request handler returns an explicit redirect without rendering for %s',
  async (method) => {
    const rootRoute = new BaseRootRoute({})
    const sourceRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/source',
      loader: () =>
        redirect({
          to: '/target',
          statusCode: 308,
          headers: { 'x-redirect': 'route' },
        }),
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([sourceRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/source'] }),
      isServer: true,
    })
    const render = vi.fn(() => new Response('must not render'))
    const handler = createRequestHandler({
      createRouter: () => router,
      request: new Request(
        method === 'POST'
          ? 'http://localhost/source?q=a%2Ab'
          : 'http://localhost/source',
        { method },
      ),
    })

    const response = await handler(render)

    expect(response.status).toBe(308)
    expect(response.headers.get('Location')).toBe('/target')
    expect(response.headers.get('x-redirect')).toBe('route')
    expect(await response.text()).toBe('')
    expect(render).not.toHaveBeenCalled()
  },
)

test.each(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])(
  'the generic request handler canonicalizes only GET/HEAD requests (%s)',
  async (method) => {
    const root = new BaseRootRoute()
    const route = new BaseRoute({
      getParentRoute: () => root,
      path: '/work',
      loader: ({ location }) => location.search,
    })
    const router = createTestRouter({
      routeTree: root.addChildren([route]),
      isServer: true,
    })
    const handler = createRequestHandler({
      createRouter: () => router,
      request: new Request('http://localhost/work/?q=a%2Ab', { method }),
    })
    const render = vi.fn(() =>
      Response.json(router.state.matches.at(-1)?.loaderData),
    )

    const response = await handler(render)

    if (method === 'GET' || method === 'HEAD') {
      expect(response.status).toBe(307)
      expect(response.headers.get('Location')).toBe('/work?q=a*b')
      expect(render).not.toHaveBeenCalled()
    } else {
      expect(response.status).toBe(200)
      expect(response.headers.get('Location')).toBeNull()
      expect(await response.json()).toEqual({ q: 'a*b' })
      expect(render).toHaveBeenCalledOnce()
    }
  },
)
