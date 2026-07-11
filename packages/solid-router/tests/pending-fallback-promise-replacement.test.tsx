import { cleanup, render, screen } from '@solidjs/testing-library'
import { afterEach, expect, test, vi } from 'vitest'
import { createControlledPromise } from '@tanstack/router-core'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

const testCleanups: Array<() => void | Promise<void>> = []

afterEach(async () => {
  vi.useRealTimers()
  while (testCleanups.length) {
    await testCleanups.pop()!()
  }
  cleanup()
})

test('a mounted child pending fallback follows a replacement load promise for the same match', async () => {
  const firstReload = createControlledPromise<void>()
  const secondReload = createControlledPromise<void>()
  const reloads = [firstReload, secondReload]
  let loaderCall = 0

  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/page',
    pendingMs: 0,
    pendingMinMs: 100,
    pendingComponent: () => <div data-testid="pending">Pending</div>,
    loader: () => {
      const generation = ++loaderCall
      const gate = reloads[generation - 2]
      return gate ? gate.then(() => generation) : generation
    },
    component: () => <div>Generation {pageRoute.useLoaderData()()}</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([pageRoute]),
    history: createMemoryHistory({ initialEntries: ['/page'] }),
  })

  render(() => <RouterProvider router={router} />)
  expect(await screen.findByText('Generation 1')).toBeInTheDocument()

  vi.useFakeTimers()
  const firstInvalidation = router.invalidate({ forcePending: true })
  const invalidations = [firstInvalidation]
  testCleanups.push(async () => {
    firstReload.resolve()
    secondReload.resolve()
    await Promise.allSettled(invalidations)
  })
  await vi.advanceTimersByTimeAsync(0)
  expect(screen.getByTestId('pending')).toBeInTheDocument()

  await vi.advanceTimersByTimeAsync(25)
  let secondSettled = false
  const secondInvalidation = router
    .invalidate({ forcePending: true })
    .then(() => {
      secondSettled = true
    })
  invalidations.push(secondInvalidation)

  firstReload.resolve()
  secondReload.resolve()
  await Promise.resolve()

  await vi.advanceTimersByTimeAsync(74)
  expect(secondSettled).toBe(false)
  expect(screen.getByTestId('pending')).toBeInTheDocument()

  await vi.advanceTimersByTimeAsync(1)
  await Promise.all(invalidations)
  expect(screen.getByText('Generation 3')).toBeInTheDocument()
  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()
})

test('the root pending fallback follows a replacement load promise for the same match', async () => {
  const firstReload = createControlledPromise<void>()
  const secondReload = createControlledPromise<void>()
  const reloads = [firstReload, secondReload]
  let loaderCall = 0

  const rootRoute = createRootRoute({
    pendingMs: 0,
    pendingMinMs: 100,
    pendingComponent: () => <div data-testid="root-pending">Pending</div>,
    loader: () => {
      const generation = ++loaderCall
      const gate = reloads[generation - 2]
      return gate ? gate.then(() => generation) : generation
    },
    component: () => <div>Generation {rootRoute.useLoaderData()()}</div>,
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  render(() => <RouterProvider router={router} />)
  expect(await screen.findByText('Generation 1')).toBeInTheDocument()

  vi.useFakeTimers()
  const firstInvalidation = router.invalidate({ forcePending: true })
  const invalidations = [firstInvalidation]
  testCleanups.push(async () => {
    firstReload.resolve()
    secondReload.resolve()
    await Promise.allSettled(invalidations)
  })
  await vi.advanceTimersByTimeAsync(0)
  expect(screen.getByTestId('root-pending')).toBeInTheDocument()

  await vi.advanceTimersByTimeAsync(25)
  let secondSettled = false
  const secondInvalidation = router
    .invalidate({ forcePending: true })
    .then(() => {
      secondSettled = true
    })
  invalidations.push(secondInvalidation)

  firstReload.resolve()
  secondReload.resolve()
  await Promise.resolve()

  await vi.advanceTimersByTimeAsync(74)
  expect(secondSettled).toBe(false)
  expect(screen.getByTestId('root-pending')).toBeInTheDocument()

  await vi.advanceTimersByTimeAsync(1)
  await Promise.all(invalidations)
  expect(screen.getByText('Generation 3')).toBeInTheDocument()
  expect(screen.queryByTestId('root-pending')).not.toBeInTheDocument()
})

test('forcePending honors pendingMinMs when the reload settles before pendingMs', async () => {
  const reload = createControlledPromise<void>()
  let loaderCall = 0

  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/page',
    pendingMinMs: 100,
    pendingComponent: () => <div data-testid="fast-pending">Pending</div>,
    loader: async () => {
      if (++loaderCall > 1) {
        await reload
      }
      return loaderCall
    },
    component: () => <div>Generation {pageRoute.useLoaderData()()}</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([pageRoute]),
    history: createMemoryHistory({ initialEntries: ['/page'] }),
  })

  render(() => <RouterProvider router={router} />)
  expect(await screen.findByText('Generation 1')).toBeInTheDocument()

  const invalidation = router.invalidate({ forcePending: true })
  expect(await screen.findByTestId('fast-pending')).toBeInTheDocument()
  reload.resolve()

  await new Promise((resolve) => setTimeout(resolve, 25))
  expect(screen.getByTestId('fast-pending')).toBeInTheDocument()

  await invalidation
  expect(await screen.findByText('Generation 2')).toBeInTheDocument()
})
