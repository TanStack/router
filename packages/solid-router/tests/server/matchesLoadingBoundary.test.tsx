import { describe, expect, it } from 'vitest'
import { renderToString } from '@solidjs/web'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../../src'
import { RouterProvider } from '../../src/RouterProvider'

function createTestRouter(routerOptions?: Record<string, unknown>) {
  const rootRoute = createRootRoute({})
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div>Index</div>,
  })
  return createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    isServer: true,
    ...routerOptions,
  } as any)
}

describe('Matches server render (no router-owned boundaries)', () => {
  it('renders settled content on the server with pending UI configured', async () => {
    const router = createTestRouter({
      defaultPendingComponent: () => <div>Pending...</div>,
    })
    await router.load()

    const html = await renderToString(() => <RouterProvider router={router} />)
    expect(html).toContain('Index')
    expect(html).not.toContain('Pending...')
  })

  it('renders settled content on the server with nothing configured', async () => {
    const router = createTestRouter()
    await router.load()

    const html = await renderToString(() => <RouterProvider router={router} />)
    expect(html).toContain('Index')
  })
})
