import { Suspense } from 'solid-js'
import { describe, expect, it, vi } from 'vitest'
import {
  Await,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
} from '../../src'
import {
  RouterServer,
  createRequestHandler,
  renderRouterToStream,
  renderRouterToString,
} from '../../src/ssr/server'
import type { AnyRouter } from '@tanstack/router-core'

function createLazyErrorComponent() {
  return lazyRouteComponent(
    async () => ({
      ErrorComponent: ({ error }: { error: Error }) => (
        <div data-testid="error-component">Route error: {error.message}</div>
      ),
    }),
    'ErrorComponent',
  )
}

describe('errorComponent (server)', () => {
  it('clears string-render state after a synchronous render error', async () => {
    vi.useFakeTimers()
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)

    try {
      const rootRoute = createRootRoute()
      const handler = createRequestHandler({
        request: new Request('http://localhost/'),
        createRouter: () =>
          createRouter({ routeTree: rootRoute, isServer: true }),
      })
      let requestRouter: AnyRouter | undefined

      const response = await handler(({ router, responseHeaders }) => {
        requestRouter = router
        return renderRouterToString({
          router,
          responseHeaders,
          children: () => {
            throw new Error('render boom')
          },
        })
      })

      expect(response.status).toBe(500)
      expect(requestRouter?.serverSsr).toBeUndefined()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      consoleError.mockRestore()
      vi.clearAllTimers()
      vi.useRealTimers()
    }
  })

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

  it('waits for a lazy error component after a render error', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        throw new Error('render boom')
      },
      errorComponent: createLazyErrorComponent(),
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
    const html = await response.text()

    expect(html).toContain('data-testid="error-component"')
    expect(html).toContain('render boom')
  })

  it('renders the route error component when a streamed Await rejects', async () => {
    let rejectDeferred!: (error: Error) => void
    const deferred = new Promise<string>((_resolve, reject) => {
      rejectDeferred = reject
    })
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      loader: () => ({ deferred }),
      component: () => {
        const data = indexRoute.useLoaderData()
        return (
          <Suspense fallback={<span>pending</span>}>
            <Await promise={data().deferred}>
              {() => <span>resolved</span>}
            </Await>
          </Suspense>
        )
      },
      errorComponent: createLazyErrorComponent(),
    })
    const routeTree = rootRoute.addChildren([indexRoute])
    const request = new Request('http://localhost/')
    const handler = createRequestHandler({
      request,
      createRouter: () => createRouter({ routeTree, isServer: true }),
    })
    const response = await handler(({ router, responseHeaders }) =>
      renderRouterToStream({
        request,
        router,
        responseHeaders,
        children: () => <RouterServer router={router} />,
      }),
    )
    const htmlPromise = response.text()

    rejectDeferred(new Error('deferred boom'))
    const html = await htmlPromise

    expect(html).toContain('data-testid="error-component"')
    expect(html).toContain('deferred boom')
    expect(html).not.toContain('pending')
  })
})
