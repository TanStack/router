import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
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

// A painted fallback holds through its minimum window before the boundary
// moves to the leaf that is still loading.
test('a painted fallback holds its minimum before the shell renders', async () => {
  vi.useFakeTimers()
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
    defaultPendingMinMs: 400,
  })

  await router.load()
  render(<RouterProvider router={router} />)
  expect(screen.getByText('User list')).toBeInTheDocument()

  let navigation!: Promise<void>
  await act(async () => {
    navigation = router.navigate({
      to: '/users/$userId',
      params: { userId: 'u1' },
    })
    await vi.advanceTimersByTimeAsync(0)
  })
  expect(screen.getByRole('status')).toBeInTheDocument()
  expect(screen.queryByText('Header shell')).not.toBeInTheDocument()

  await act(async () => {
    headerChunk.resolve(headerOptions)
    await vi.advanceTimersByTimeAsync(0)
  })

  // The layout settled, but the painted fallback holds its minimum window.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(399)
  })
  expect(screen.getByRole('status')).toBeInTheDocument()
  expect(screen.queryByText('Header shell')).not.toBeInTheDocument()

  // Once the minimum elapses the shell renders with the leaf still pending.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1)
  })
  expect(screen.getByText('Header shell')).toBeInTheDocument()
  expect(screen.getByRole('status')).toBeInTheDocument()
  expect(screen.queryByText('User detail')).not.toBeInTheDocument()

  await act(async () => {
    detailLoader.resolve('detail data')
    await vi.advanceTimersByTimeAsync(399)
  })
  expect(screen.getByRole('status')).toBeInTheDocument()
  expect(screen.queryByText('User detail')).not.toBeInTheDocument()

  await act(async () => {
    await vi.advanceTimersByTimeAsync(1)
    await navigation
  })
  expect(screen.getByText('User detail')).toBeInTheDocument()
  expect(screen.getByText('Header shell')).toBeInTheDocument()
})

// Each boundary shows its own fallback as the boundary moves down the branch.
test('the pending fallback moves from the layout to the leaf', async () => {
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
    pendingComponent: () => <p>Header loading</p>,
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
    pendingComponent: () => <p>Leaf loading</p>,
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
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
  })

  render(<RouterProvider router={router} />)
  await waitFor(() => expect(screen.getByText('User list')).toBeInTheDocument())

  const navigation = router.navigate({
    to: '/users/$userId',
    params: { userId: 'u1' },
  })

  await waitFor(() =>
    expect(screen.getByText('Header loading')).toBeInTheDocument(),
  )
  expect(screen.queryByText('Header shell')).not.toBeInTheDocument()

  headerChunk.resolve(headerOptions)

  await waitFor(() =>
    expect(screen.getByText('Header shell')).toBeInTheDocument(),
  )
  expect(screen.getByText('Leaf loading')).toBeInTheDocument()
  expect(screen.queryByText('Header loading')).not.toBeInTheDocument()
  expect(screen.queryByText('User detail')).not.toBeInTheDocument()

  detailLoader.resolve('detail data')
  await navigation

  await waitFor(() =>
    expect(screen.getByText('User detail')).toBeInTheDocument(),
  )
  expect(screen.getByText('Header shell')).toBeInTheDocument()
})
