import { cleanup, render, screen, waitFor } from '@solidjs/testing-library'
import { afterEach, expect, test, vi } from 'vitest'
import * as Solid from 'solid-js'
import { createControlledPromise } from '@tanstack/router-core'
import {
  Outlet,
  RouterProvider,
  createLazyRoute,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 1))

function setup(opts?: {
  pendingComponent?: () => any
  bComponent?: (data: Promise<string>) => () => any
}) {
  const data = createControlledPromise<string>()
  let setCount!: (updater: (count: number) => number) => void

  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const aRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => {
      const [count, set] = Solid.createSignal(0)
      setCount = set
      return <div data-testid="route-a">count {count()}</div>
    },
  })
  const bRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/b',
    pendingComponent: opts?.pendingComponent,
    component: opts?.bComponent
      ? opts.bComponent(data)
      : () => {
          const value = Solid.createMemo(() => data)
          return <div data-testid="route-b">{value()}</div>
        },
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([aRoute, bRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  return { router, data, bump: () => setCount((count) => count + 1) }
}

test('an uncaught async component read holds the previous view until it settles', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  const { router, data, bump } = setup()
  const { container } = render(() => <RouterProvider router={router} />)
  expect(await screen.findByTestId('route-a')).toHaveTextContent('count 0')

  // No loader: the router commits immediately, so the hold below is Solid's
  // implicit transition, not the router's commit gating.
  const navigation = router.navigate({ to: '/b' })
  await tick()

  expect(screen.getByTestId('route-a')).toBeInTheDocument()
  expect(screen.queryByTestId('route-b')).not.toBeInTheDocument()
  expect(container.textContent).toContain('count 0')

  // The held view is live, not a frozen snapshot.
  bump()
  await waitFor(() => {
    expect(screen.getByTestId('route-a')).toHaveTextContent('count 1')
  })
  expect(screen.queryByTestId('route-b')).not.toBeInTheDocument()

  data.resolve('route b data')
  await navigation
  await waitFor(() => {
    expect(screen.getByTestId('route-b')).toHaveTextContent('route b data')
  })
  expect(screen.queryByTestId('route-a')).not.toBeInTheDocument()
  expect(error).not.toHaveBeenCalled()
})

test('a configured pendingComponent does not catch component async reads — the hold still applies', async () => {
  const { router, data } = setup({
    pendingComponent: () => <div data-testid="pending">Pending</div>,
  })
  render(() => <RouterProvider router={router} />)
  expect(await screen.findByTestId('route-a')).toBeInTheDocument()

  const navigation = router.navigate({ to: '/b' })
  await tick()

  // pendingComponent rides router pending state (blocking navigations), not
  // Solid async: with no loader the navigation is settled, so the async read
  // holds the previous view instead of presenting pending UI.
  expect(screen.getByTestId('route-a')).toBeInTheDocument()
  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()

  data.resolve('route b data')
  await navigation
  await waitFor(() => {
    expect(screen.getByTestId('route-b')).toHaveTextContent('route b data')
  })
  expect(screen.queryByTestId('route-a')).not.toBeInTheDocument()
})

test('a user-placed Loading boundary catches the route component async reads', async () => {
  const { router, data } = setup({
    bComponent: (promise) => () => {
      const value = Solid.createMemo(() => promise)
      return (
        <Solid.Loading fallback={<div data-testid="fallback">Loading</div>}>
          <div data-testid="route-b">{value()}</div>
        </Solid.Loading>
      )
    },
  })
  render(() => <RouterProvider router={router} />)
  expect(await screen.findByTestId('route-a')).toBeInTheDocument()

  await router.navigate({ to: '/b' })

  expect(await screen.findByTestId('fallback')).toBeVisible()
  expect(screen.queryByTestId('route-a')).not.toBeInTheDocument()

  data.resolve('route b data')
  await waitFor(() => {
    expect(screen.getByTestId('route-b')).toHaveTextContent('route b data')
  })
  expect(screen.queryByTestId('fallback')).not.toBeInTheDocument()
})

test('a blocking pending navigation presents pendingComponent through router state', async () => {
  const loaderStarted = createControlledPromise<void>()
  const loaderData = createControlledPromise<string>()

  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const aRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div data-testid="route-a">A</div>,
  })
  const bRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/b',
    loader: () => {
      loaderStarted.resolve()
      return loaderData
    },
    pendingComponent: () => <div data-testid="pending">Pending</div>,
    component: () => (
      <div data-testid="route-b">{bRoute.useLoaderData()()}</div>
    ),
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([aRoute, bRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
  })

  render(() => <RouterProvider router={router} />)
  expect(await screen.findByTestId('route-a')).toBeInTheDocument()

  const navigation = router.navigate({ to: '/b' })
  await loaderStarted

  expect(await screen.findByTestId('pending')).toBeVisible()
  expect(screen.queryByTestId('route-a')).not.toBeInTheDocument()

  loaderData.resolve('route b data')
  await navigation
  await waitFor(() => {
    expect(screen.getByTestId('route-b')).toHaveTextContent('route b data')
  })
  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()
})

test('a pendingComponent arriving in a late lazy chunk presents through router state', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  const lazyChunk = createControlledPromise<void>()
  const loaderStarted = createControlledPromise<void>()
  const loaderData = createControlledPromise<string>()

  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const aRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div data-testid="route-a">A</div>,
  })
  const bRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/b',
    loader: () => {
      loaderStarted.resolve()
      return loaderData
    },
  }).lazy(async () => {
    await lazyChunk
    return createLazyRoute('/b')({
      pendingComponent: () => <div data-testid="pending">Pending</div>,
      component: () => (
        <div data-testid="route-b">{bRoute.useLoaderData()()}</div>
      ),
    })
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([aRoute, bRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
  })

  render(() => <RouterProvider router={router} />)
  expect(await screen.findByTestId('route-a')).toBeInTheDocument()

  const navigation = router.navigate({ to: '/b' })
  await tick()

  // Lazy options are awaited before anything publishes: the previous view
  // stays put while the chunk is in flight.
  expect(screen.getByTestId('route-a')).toBeInTheDocument()
  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()

  lazyChunk.resolve()
  await loaderStarted

  expect(await screen.findByTestId('pending')).toBeVisible()

  loaderData.resolve('route b data')
  await navigation
  await waitFor(() => {
    expect(screen.getByTestId('route-b')).toHaveTextContent('route b data')
  })
  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()
  expect(error).not.toHaveBeenCalled()
})
