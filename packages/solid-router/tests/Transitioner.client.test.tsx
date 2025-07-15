import { describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@solidjs/testing-library'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'
import { RouterProvider } from '../src/RouterProvider'
import { beforeEach } from 'node:test'

describe('Transitioner client', () => {
  it('should call router.load() when Transitioner mounts on the client', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => <div>Index</div>,
    })

    const routeTree = rootRoute.addChildren([indexRoute])
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: ['/'],
      }),
    })

    // Mock router.load() to verify it gets called
    const loadSpy = vi.spyOn(router, 'load').mockResolvedValue(undefined)

    render(() => <RouterProvider router={router} />)

    // Wait for the createRenderEffect to run and call router.load()
    await waitFor(() => {
      expect(loadSpy).toHaveBeenCalledTimes(1)
    })

    loadSpy.mockRestore()
  })
})
