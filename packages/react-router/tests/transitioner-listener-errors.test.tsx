import * as React from 'react'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(() => {
  cleanup()
})

test('a throwing load-event listener cannot interrupt route hooks or later navigations', async () => {
  const firstOnEnter = vi.fn()
  const secondOnEnter = vi.fn()
  const listenerError = new Error('onLoad listener failed')
  const unhandledRejection = vi.fn()
  const laterOnLoad = vi.fn()
  process.on('unhandledRejection', unhandledRejection)

  const rootRoute = createRootRoute({ component: Outlet })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div>Index route</div>,
  })
  const firstRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/first',
    onEnter: firstOnEnter,
    component: () => <div>First route</div>,
  })
  const secondRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/second',
    onEnter: secondOnEnter,
    component: () => <div>Second route</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, firstRoute, secondRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  try {
    render(<RouterProvider router={router} />)
    expect(await screen.findByText('Index route')).toBeInTheDocument()
    await waitFor(() => expect(router.state.status).toBe('idle'))

    const unsubscribe = router.subscribe('onLoad', (event) => {
      if (event.toLocation.pathname === '/first') {
        throw listenerError
      }
    })
    const unsubscribeLater = router.subscribe('onLoad', laterOnLoad)

    await act(() => router.navigate({ to: '/first' }))

    expect(screen.getByText('First route')).toBeInTheDocument()

    unsubscribe()
    await act(() => router.navigate({ to: '/second' }))

    expect(screen.getByText('Second route')).toBeInTheDocument()
    expect(firstOnEnter).toHaveBeenCalledTimes(1)
    expect(secondOnEnter).toHaveBeenCalledTimes(1)
    expect(laterOnLoad).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(router.state.status).toBe('idle'))

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(unhandledRejection).toHaveBeenCalledWith(
      listenerError,
      expect.anything(),
    )
    unsubscribeLater()
  } finally {
    process.off('unhandledRejection', unhandledRejection)
  }
})
