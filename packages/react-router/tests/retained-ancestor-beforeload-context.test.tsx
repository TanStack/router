import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { createControlledPromise } from '@tanstack/router-core'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(cleanup)

// While a child route shows its pending fallback, ancestor routes stay mounted
// and must keep the context their own `beforeLoad` produced. Losing it is not
// cosmetic: ancestors that reach into a nested context value - the usual shape
// for an auth/session context - throw while they are still on screen.
test('retained ancestor keeps its beforeLoad context while a child route is pending', async () => {
  const childLoader = createControlledPromise<void>()
  // Errors thrown while rendering the mounted ancestor. Caught here only so the
  // failure surfaces as an assertion instead of taking out the route's error
  // boundary; in an app this is an uncaught render crash.
  const renderErrors: Array<string> = []

  const rootRoute = createRootRoute({
    beforeLoad: () => ({ auth: { user: 'ada' } }),
    component: function RootLayout() {
      const { auth } = rootRoute.useRouteContext()
      let user
      try {
        user = auth.user
      } catch (error) {
        renderErrors.push(String(error))
      }
      return (
        <>
          <div>{`user:${user ?? 'MISSING'}`}</div>
          <Outlet />
        </>
      )
    },
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div>Home</div>,
  })
  const childRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/child',
    pendingMs: 0,
    pendingComponent: () => <div>Pending</div>,
    loader: () => childLoader,
    component: () => <div>Child</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, childRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  render(<RouterProvider router={router} />)
  await screen.findByText('Home')
  await waitFor(() => expect(router.state.status).toBe('idle'))

  const navigation = router.navigate({ to: '/child' })
  await screen.findByText('Pending')

  expect(renderErrors).toEqual([])
  expect(screen.getByText('user:ada')).toBeInTheDocument()

  childLoader.resolve()
  await navigation
})

// Contextualization walks the lane serially, so an ancestor whose `beforeLoad`
// is still in flight parks the walk above every deeper ancestor. The pending
// fallback is published from that parked state, so the ancestors the walk has
// not reached yet must already be presentable.
test('retained ancestor keeps its beforeLoad context while an ancestor above it is pending', async () => {
  const childLoader = createControlledPromise<void>()
  const rootBeforeLoad = createControlledPromise<void>()
  let rootResolved = false
  const renderErrors: Array<string> = []

  const rootRoute = createRootRoute({
    beforeLoad: async () => {
      // Only the navigation blocks; the initial load must settle normally.
      if (rootResolved) {
        await rootBeforeLoad
      }
      rootResolved = true
      return { session: 'live' }
    },
    component: () => <Outlet />,
  })
  const dashRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/dash',
    beforeLoad: () => ({ auth: { user: 'ada' } }),
    component: function DashLayout() {
      const { auth } = dashRoute.useRouteContext()
      let user
      try {
        user = auth.user
      } catch (error) {
        renderErrors.push(String(error))
      }
      return (
        <>
          <div>{`user:${user ?? 'MISSING'}`}</div>
          <Outlet />
        </>
      )
    },
  })
  const overviewRoute = createRoute({
    getParentRoute: () => dashRoute,
    path: 'overview',
    component: () => <div>Overview</div>,
  })
  const detailRoute = createRoute({
    getParentRoute: () => dashRoute,
    path: 'detail',
    pendingMs: 0,
    pendingComponent: () => <div>Pending</div>,
    loader: () => childLoader,
    component: () => <div>Detail</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      dashRoute.addChildren([overviewRoute, detailRoute]),
    ]),
    history: createMemoryHistory({ initialEntries: ['/dash/overview'] }),
  })

  render(<RouterProvider router={router} />)
  await screen.findByText('Overview')
  await waitFor(() => expect(router.state.status).toBe('idle'))

  const navigation = router.navigate({ to: '/dash/detail' })
  await screen.findByText('Pending')

  expect(renderErrors).toEqual([])
  expect(screen.getByText('user:ada')).toBeInTheDocument()

  rootBeforeLoad.resolve()
  childLoader.resolve()
  await navigation
})
