import { expect, test, vi } from 'vitest'
import * as React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { createMemoryHistory } from '@tanstack/history'
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

/**
 * Start hydrates the router before RouterProvider renders it. Build that same
 * resolved state through the public load API, then verify the first StrictMode
 * commit emits one onRendered event after the route tree's layout effects.
 */
test('StrictMode emits one post-commit onRendered for an already resolved router', async () => {
  const lifecycle: Array<'layout' | 'rendered'> = []
  const Home = () => {
    React.useLayoutEffect(() => {
      lifecycle.push('layout')
    }, [])
    return <div data-testid="home">Home</div>
  }
  const rootRoute = createRootRoute({
    component: () => <Outlet />,
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    loader: () => 'home data',
    component: Home,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  let resolveRendered!: () => void
  const rendered = new Promise<void>((resolve) => {
    resolveRendered = resolve
  })
  const onRendered = vi.fn(() => {
    lifecycle.push('rendered')
    resolveRendered()
  })
  const onResolved = vi.fn()
  const onLoad = vi.fn()
  const unsubscribers = [
    router.subscribe('onRendered', onRendered),
    router.subscribe('onResolved', onResolved),
    router.subscribe('onLoad', onLoad),
  ]

  try {
    await router.load()
    expect(router.state.status).toBe('idle')
    expect(router.state.resolvedLocation?.pathname).toBe('/')
    expect(onLoad).toHaveBeenCalledTimes(1)
    expect(onResolved).toHaveBeenCalledTimes(1)
    expect(onRendered).not.toHaveBeenCalled()

    render(
      <React.StrictMode>
        <RouterProvider router={router} />
      </React.StrictMode>,
    )
    await screen.findByTestId('home')
    await rendered
    await new Promise((resolve) => setTimeout(resolve, 0))

    await waitFor(() => expect(onRendered).toHaveBeenCalledTimes(1))
    expect(lifecycle.indexOf('layout')).toBeLessThan(
      lifecycle.indexOf('rendered'),
    )
    expect(router.state.status).toBe('idle')
    expect(router.state.resolvedLocation?.pathname).toBe('/')
  } finally {
    unsubscribers.forEach((unsubscribe) => unsubscribe())
  }
})
