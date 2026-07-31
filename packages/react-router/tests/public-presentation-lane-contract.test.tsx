import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { createControlledPromise } from '@tanstack/router-core'
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

describe('public presentation lane contracts', () => {
  test('visible pending UI publishes every matched route and its loading state', async () => {
    const parentGate = createControlledPromise<string>()

    const rootRoute = createRootRoute({ component: Outlet })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => <div>Home</div>,
    })
    const parentRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      pendingMs: 0,
      pendingComponent: () => <div>Loading parent</div>,
      loader: () => parentGate,
      component: Outlet,
    })
    const childRoute = createRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      loader: () => 'child data',
      component: () => <div>Child content</div>,
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        parentRoute.addChildren([childRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    render(<RouterProvider router={router} />)
    expect(await screen.findByText('Home')).toBeInTheDocument()
    await waitFor(() => expect(router.state.status).toBe('idle'))

    let navigation!: Promise<void>
    await act(async () => {
      navigation = router.navigate({ to: '/parent/child' })
      await Promise.resolve()
    })

    expect(await screen.findByText('Loading parent')).toBeInTheDocument()
    expect(screen.queryByText('Child content')).not.toBeInTheDocument()

    expect(router.state.matches.map((match) => match.routeId)).toEqual([
      rootRoute.id,
      parentRoute.id,
      childRoute.id,
    ])
    expect(
      router.state.matches.find((match) => match.routeId === parentRoute.id),
    ).toMatchObject({ status: 'pending', isFetching: 'loader' })

    await act(async () => {
      parentGate.resolve('parent data')
      await navigation
    })

    expect(screen.getByText('Child content')).toBeInTheDocument()
    expect(router.state.status).toBe('idle')
  })

  test('a reentrant navigation from onResolved suppresses the stale onRendered event', async () => {
    const rootRoute = createRootRoute({ component: Outlet })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => <div>Home</div>,
    })
    const firstRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/first',
      component: () => <div>First</div>,
    })
    const secondRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/second',
      component: () => <div>Second</div>,
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, firstRoute, secondRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    render(<RouterProvider router={router} />)
    expect(await screen.findByText('Home')).toBeInTheDocument()
    await waitFor(() => expect(router.state.status).toBe('idle'))

    const renderedPaths: Array<string> = []
    let successor: Promise<void> | undefined
    const unsubscribeResolved = router.subscribe('onResolved', (event) => {
      if (event.toLocation.pathname === '/first') {
        successor = router.navigate({ to: '/second' })
      }
    })
    const unsubscribeRendered = router.subscribe('onRendered', (event) => {
      if (event.toLocation.pathname !== '/') {
        renderedPaths.push(event.toLocation.pathname)
      }
    })

    try {
      await act(() => router.navigate({ to: '/first' }))
      await act(async () => {
        await successor
      })

      expect(screen.getByText('Second')).toBeInTheDocument()
      expect(screen.queryByText('First')).not.toBeInTheDocument()
      expect(renderedPaths).toEqual(['/second'])
    } finally {
      unsubscribeResolved()
      unsubscribeRendered()
    }
  })
})
