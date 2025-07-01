import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToString } from 'solid-js/web'
import { cleanup, render, screen } from '@solidjs/testing-library'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'
import { ClientOnly } from '../src/ClientOnly'
import type { RouterHistory } from '../src'

afterEach(() => {
  vi.resetAllMocks()
  cleanup()
})

function createTestRouter(initialHistory?: RouterHistory) {
  const history =
    initialHistory ?? createMemoryHistory({ initialEntries: ['/'] })

  const rootRoute = createRootRoute({})

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => (
      <div>
        <p>Index Route</p>
        <ClientOnly fallback={<div data-testid="loading">Loading...</div>}>
          <div data-testid="client-only-content">Client Only Content</div>
        </ClientOnly>
      </div>
    ),
  })

  const routeTree = rootRoute.addChildren([indexRoute])
  const router = createRouter({ routeTree, history })

  return {
    router,
    routes: { indexRoute },
  }
}

describe('ClientOnly', () => {
  it.skip('should render fallback during SSR', async () => {
    const { router } = createTestRouter()
    await router.load()

    // Initial render (SSR)
    const html = renderToString(() => <RouterProvider router={router} />)

    expect(html).include('Loading...')
    expect(html).not.include('Client Only Content')
  })

  it('should render client content after hydration', async () => {
    const { router } = createTestRouter()
    await router.load()

    // Mock useSyncExternalStore to simulate hydration
    // vi.spyOn(Solid, 'createEffect').mockImplementation(() => true)

    render(() => <RouterProvider router={router} />)

    expect(screen.getByText('Client Only Content')).toBeInTheDocument()
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
  })

  it('should handle navigation with client-only content', async () => {
    const { router } = createTestRouter()
    await router.load()

    // Simulate hydration
    // vi.spyOn(Solid, 'createEffect').mockImplementation(() => true)

    // Re-render after hydration
    render(() => <RouterProvider router={router} />)

    // Navigate to a different route and back
    await router.navigate({ to: '/other' })
    await router.navigate({ to: '/' })

    // Content should still be visible after navigation
    expect(screen.getByText('Client Only Content')).toBeInTheDocument()
  })
})
