import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Outlet,
  RouterProvider,
  createControlledPromise,
  createLazyRoute,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// A lazy-only layout settles before its leaf loader, so its shell renders
// while the leaf fallback stays visible.
test('a settled layout renders its shell while its leaf is still loading', async () => {
  const headerOptions = createLazyRoute('/users/$userId')({
    component: () => (
      <div>
        <h1>Header shell</h1>
        <Outlet />
      </div>
    ),
  })
  const headerChunk = createControlledPromise<typeof headerOptions>()
  const detailLoader = createControlledPromise<string>()

  const rootRoute = createRootRoute({ component: Outlet })
  const authRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: '_auth',
    component: Outlet,
  })
  const sidebarRoute = createRoute({
    getParentRoute: () => authRoute,
    id: '_sidebar',
    component: Outlet,
  })
  const headerRoute = createRoute({
    getParentRoute: () => authRoute,
    id: '_header',
  }).lazy(() => headerChunk)

  const listRoute = createRoute({
    getParentRoute: () => sidebarRoute,
    path: '/users',
    component: () => <p>User list</p>,
  })
  const detailRoute = createRoute({
    getParentRoute: () => headerRoute,
    path: '/users/$userId',
    loader: () => detailLoader,
    component: () => <p>User detail</p>,
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([
      authRoute.addChildren([
        sidebarRoute.addChildren([listRoute]),
        headerRoute.addChildren([detailRoute]),
      ]),
    ]),
    history: createMemoryHistory({ initialEntries: ['/users'] }),
    defaultPendingComponent: () => <p role="status">Loading</p>,
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
  })

  render(<RouterProvider router={router} />)
  await waitFor(() => expect(screen.getByText('User list')).toBeInTheDocument())

  const navigation = router.navigate({
    to: '/users/$userId',
    params: { userId: 'u1' },
  })

  await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument())
  expect(screen.queryByText('Header shell')).not.toBeInTheDocument()

  headerChunk.resolve(headerOptions)

  await waitFor(() =>
    expect(screen.getByText('Header shell')).toBeInTheDocument(),
  )
  expect(screen.getByRole('status')).toBeInTheDocument()
  expect(screen.queryByText('User detail')).not.toBeInTheDocument()

  detailLoader.resolve('detail data')
  await navigation

  await waitFor(() =>
    expect(screen.getByText('User detail')).toBeInTheDocument(),
  )
  expect(screen.getByText('Header shell')).toBeInTheDocument()
})
