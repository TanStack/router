import { cleanup, render, screen, waitFor } from '@solidjs/testing-library'
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

const testCleanups: Array<() => void | Promise<void>> = []

afterEach(async () => {
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

  const firstInvalidation = router.invalidate({ forcePending: true })
  const invalidations = [firstInvalidation]
  testCleanups.push(async () => {
    firstReload.resolve()
    secondReload.resolve()
    await Promise.allSettled(invalidations)
  })
  expect(await screen.findByTestId('pending')).toBeInTheDocument()

  const matchId = router.state.matches.find(
    (match) => match.routeId === pageRoute.id,
  )!.id
  const firstPromise = router.getMatch(matchId, false)!._.loadPromise!
  expect(firstPromise.pendingUntil).toBeTypeOf('number')

  await new Promise((resolve) => setTimeout(resolve, 25))
  invalidations.push(router.invalidate({ forcePending: true }))

  let secondPromise = router.getMatch(matchId, false)!._.loadPromise!
  await waitFor(() => {
    secondPromise = router.getMatch(matchId, false)!._.loadPromise!
    expect(secondPromise).not.toBe(firstPromise)
    expect(secondPromise.status).toBe('pending')
    expect(secondPromise.pendingUntil).toBeTypeOf('number')
  })
  // One continuously visible fallback owns one minimum-display deadline,
  // even when internal loader ownership changes underneath it.
  expect(secondPromise.pendingUntil).toBe(firstPromise.pendingUntil)
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

  const firstInvalidation = router.invalidate({ forcePending: true })
  const invalidations = [firstInvalidation]
  testCleanups.push(async () => {
    firstReload.resolve()
    secondReload.resolve()
    await Promise.allSettled(invalidations)
  })
  expect(await screen.findByTestId('root-pending')).toBeInTheDocument()

  const matchId = router.state.matches.find(
    (match) => match.routeId === rootRoute.id,
  )!.id
  const firstPromise = router.getMatch(matchId, false)!._.loadPromise!
  await waitFor(() => expect(firstPromise.pendingUntil).toBeTypeOf('number'))

  await new Promise((resolve) => setTimeout(resolve, 25))
  invalidations.push(router.invalidate({ forcePending: true }))

  let secondPromise = router.getMatch(matchId, false)!._.loadPromise!
  await waitFor(() => {
    secondPromise = router.getMatch(matchId, false)!._.loadPromise!
    expect(secondPromise).not.toBe(firstPromise)
    expect(secondPromise.status).toBe('pending')
    expect(secondPromise.pendingUntil).toBeTypeOf('number')
  })
  expect(secondPromise.pendingUntil).toBe(firstPromise.pendingUntil)
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
