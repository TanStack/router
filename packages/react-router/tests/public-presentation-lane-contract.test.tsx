import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
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
  vi.useRealTimers()
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

  test('same-boundary takeover republishes successor search without restarting pendingMinMs', async () => {
    const firstGate = createControlledPromise<void>()
    const secondGate = createControlledPromise<void>()

    const rootRoute = createRootRoute({ component: Outlet })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => <div>Home</div>,
    })
    const pageRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      validateSearch: (search: Record<string, unknown>) => ({
        revision: Number(search.revision),
      }),
      pendingMs: 0,
      pendingMinMs: 100,
      pendingComponent: () => <div>Loading page</div>,
      beforeLoad: ({ search }) =>
        search.revision === 1 ? firstGate : secondGate,
      component: () => {
        const search = pageRoute.useSearch()
        return <div>Page revision {search.revision}</div>
      },
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, pageRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    render(<RouterProvider router={router} />)
    expect(await screen.findByText('Home')).toBeInTheDocument()
    await waitFor(() => expect(router.state.status).toBe('idle'))

    vi.useFakeTimers()
    vi.setSystemTime(0)

    let successorSettled = false
    let settledAtOriginalDeadline = false
    let renderedAtOriginalDeadline = false
    try {
      await act(async () => {
        void router.navigate({
          to: '/page',
          search: { revision: 1 },
        })
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(screen.getByText('Loading page')).toBeInTheDocument()
      expect(router.state.matches.at(-1)?.search).toMatchObject({ revision: 1 })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(25)
      })

      let secondNavigation!: Promise<void>
      await act(async () => {
        secondNavigation = router.navigate({
          to: '/page',
          search: { revision: 2 },
        })
        await vi.advanceTimersByTimeAsync(0)
      })

      expect(screen.getByText('Loading page')).toBeInTheDocument()
      expect(router.state.location.search).toMatchObject({ revision: 2 })
      expect(router.state.matches.at(-1)?.search).toMatchObject({ revision: 2 })

      void secondNavigation.then(() => {
        successorSettled = true
      })
      await act(async () => {
        secondGate.resolve()
        await Promise.resolve()
      })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(74)
      })
      expect(successorSettled).toBe(false)
      expect(screen.getByText('Loading page')).toBeInTheDocument()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1)
        await Promise.resolve()
      })

      settledAtOriginalDeadline = successorSettled
      renderedAtOriginalDeadline =
        screen.queryByText('Page revision 2') !== null
    } finally {
      // Finish a faulty implementation too, so a deadline assertion cannot
      // strand this router and contaminate the following test.
      firstGate.resolve()
      secondGate.resolve()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000)
        await Promise.resolve()
      })
    }

    expect({
      settled: settledAtOriginalDeadline,
      rendered: renderedAtOriginalDeadline,
    }).toEqual({ settled: true, rendered: true })
    expect(screen.getByText('Page revision 2')).toBeInTheDocument()
    expect(screen.queryByText('Loading page')).not.toBeInTheDocument()
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
