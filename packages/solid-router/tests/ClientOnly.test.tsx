import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import {
  Link,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'
import { ClientOnly } from '../src/ClientOnly'

afterEach(() => {
  vi.resetAllMocks()
  window.history.replaceState(null, 'root', '/')
  cleanup()
})

function createTestRouter() {
  const rootRoute = createRootRoute({})

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => (
      <div>
        <p>Index Route</p>
        <Link data-testid="other-link" to="/other">
          Go to Other
        </Link>
        <ClientOnly fallback={<div data-testid="loading">Loading...</div>}>
          <div data-testid="client-only-content">Client Only Content</div>
        </ClientOnly>
      </div>
    ),
  })

  const otherRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/other',
    component: () => (
      <div>
        <p data-testid="other-route">Other Route</p>
        <Link data-testid="index-link" to="/">
          Go to Index
        </Link>
      </div>
    ),
  })

  const routeTree = rootRoute.addChildren([indexRoute, otherRoute])
  const router = createRouter({ routeTree })

  return {
    router,
    routes: { indexRoute },
  }
}

describe('ClientOnly', () => {
  beforeEach(() => {
    window.scrollTo = vi.fn()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should render client content after hydration', async () => {
    const { router } = createTestRouter()

    render(() => <RouterProvider router={router} />)

    // Navigate away and back to trigger client-side re-mount
    const otherLink = await screen.findByTestId('other-link')
    fireEvent.click(otherLink)

    const otherRoute = await screen.findByTestId('other-route')
    expect(otherRoute).toBeInTheDocument()

    const indexLink = await screen.findByTestId('index-link')
    fireEvent.click(indexLink)

    expect(await screen.findByTestId('client-only-content')).toBeInTheDocument()
    expect(screen.queryByTestId('loading')).not.toBeInTheDocument()
  })

  it('should handle navigation with client-only content', async () => {
    const { router } = createTestRouter()

    render(() => <RouterProvider router={router} />)

    // Content should be visible after initial render
    expect(
      await screen.findByTestId('client-only-content', {}, { timeout: 2000 }),
    ).toBeInTheDocument()

    // Navigate to a different route and back
    const otherLink = await screen.findByTestId('other-link')
    fireEvent.click(otherLink)

    expect(await screen.findByTestId('other-route')).toBeInTheDocument()

    const indexLink = await screen.findByTestId('index-link')
    fireEvent.click(indexLink)

    // Content should still be visible after navigation
    expect(await screen.findByTestId('client-only-content')).toBeInTheDocument()
  })
})
