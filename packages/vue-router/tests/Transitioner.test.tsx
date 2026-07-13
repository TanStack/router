import { describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/vue'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'
import { RouterProvider } from '../src/RouterProvider'

describe('Transitioner', () => {
  it('loads the initial route when the provider mounts', async () => {
    const loader = vi.fn()
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => <div>Index</div>,
      loader,
    })

    const routeTree = rootRoute.addChildren([indexRoute])
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: ['/'],
      }),
    })

    const view = render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(loader).toHaveBeenCalledTimes(1)
      expect(view.getByText('Index')).toBeInTheDocument()
    })
  })
})
