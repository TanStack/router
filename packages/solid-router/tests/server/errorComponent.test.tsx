import { describe, expect, it, vi } from 'vitest'
import { renderToStringAsync } from 'solid-js/web'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../../src'

describe('errorComponent (server)', () => {
  it('renders the route error component when a loader throws during SSR', async () => {
    const rootRoute = createRootRoute()
    const onCatch = vi.fn()

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      loader: () => {
        throw new Error('loader boom')
      },
      component: () => <div>Index route</div>,
      onCatch,
      errorComponent: ({ error, reset }) => (
        <div data-testid="error-component">
          Route error: {error.message} reset:{typeof reset}
        </div>
      ),
    })

    const routeTree = rootRoute.addChildren([indexRoute])
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: ['/'],
      }),
      isServer: true,
    })

    await router.load()

    const html = await renderToStringAsync(() => (
      <RouterProvider router={router} />
    ))
    const normalizedHtml = html.replace(/<!--[\s\S]*?-->/g, '')

    expect(router.state.statusCode).toBe(500)
    expect(onCatch).toHaveBeenCalledTimes(1)
    expect(html).toContain('data-testid="error-component"')
    expect(html).toContain('loader boom')
    expect(normalizedHtml).toContain('reset:function')
    expect(html).not.toContain('Index route')
  })
})
