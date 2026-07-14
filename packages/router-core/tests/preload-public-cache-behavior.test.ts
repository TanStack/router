import { afterEach, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

// https://github.com/TanStack/router/issues/2980
// Repeated child preloads must borrow a stale active parent instead of rerunning
// its loader.
test('#2980: repeated child preloads do not rerun a stale active parent loader', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(1_000)

  const layoutLoader = vi.fn(() => 'layout data')
  const childLoader = vi.fn((childId: string) => `child ${childId}`)
  const rootRoute = new BaseRootRoute({})
  const layoutRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/layout',
    staleTime: 10,
    loader: layoutLoader,
  })
  const childRoute = new BaseRoute({
    getParentRoute: () => layoutRoute,
    path: '$childId',
    loader: ({ params }) => childLoader(params.childId),
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([layoutRoute.addChildren([childRoute])]),
    history: createMemoryHistory({ initialEntries: ['/layout'] }),
  })

  await router.load()
  expect(layoutLoader).toHaveBeenCalledTimes(1)
  vi.setSystemTime(2_000)

  await router.preloadRoute({
    to: '/layout/$childId',
    params: { childId: 'one' },
  })
  expect(layoutLoader).toHaveBeenCalledTimes(1)
  expect(childLoader).toHaveBeenNthCalledWith(1, 'one')

  await router.preloadRoute({
    to: '/layout/$childId',
    params: { childId: 'two' },
  })

  expect(layoutLoader).toHaveBeenCalledTimes(1)
  expect(childLoader).toHaveBeenCalledTimes(2)
  expect(childLoader).toHaveBeenNthCalledWith(2, 'two')
})

// Public contract: the public stale/gc options determine whether user loader
// code runs. A read-only preload must not silently shorten a navigation-owned
// cache entry's lifetime.
test('fresh navigation data keeps its gc policy when a preload reuses it', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(1_000)

  let revision = 0
  const loader = vi.fn(() => ++revision)
  const rootRoute = new BaseRootRoute({})
  const homeRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const reportsRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/reports',
    gcTime: 30 * 60_000,
    preloadGcTime: 30_000,
    preloadStaleTime: 10 * 60_000,
    staleTime: Infinity,
    loader,
  })
  const otherRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/other',
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([homeRoute, reportsRoute, otherRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  await router.navigate({ to: '/reports' })
  await router.navigate({ to: '/' })
  expect(loader).toHaveBeenCalledTimes(1)

  vi.setSystemTime(61_000)
  await router.preloadRoute({ to: '/reports' })
  await router.navigate({ to: '/other' })
  await router.navigate({ to: '/reports' })
  expect(loader).toHaveBeenCalledTimes(1)
  expect(
    router.state.matches.find((match) => match.routeId === reportsRoute.id)
      ?.loaderData,
  ).toBe(1)

  await router.navigate({ to: '/' })
  vi.setSystemTime(1_000 + 31 * 60_000)
  await router.navigate({ to: '/other' })
  await router.navigate({ to: '/reports' })
  expect(loader).toHaveBeenCalledTimes(2)
  expect(
    router.state.matches.find((match) => match.routeId === reportsRoute.id)
      ?.loaderData,
  ).toBe(2)
})

// Public contract: clearCache must remain authoritative even if an older
// preload finishes unrelated asset work after the clear.
test('clearCache during an in-flight preload cannot resurrect its borrowed data', async () => {
  const headGate = createControlledPromise<{
    meta: Array<{ title: string }>
  }>()
  let revision = 0
  let headCalls = 0
  const loader = vi.fn(() => ++revision)
  const rootRoute = new BaseRootRoute({})
  const homeRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const reportsRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/reports',
    staleTime: Infinity,
    preloadStaleTime: Infinity,
    loader,
    head: () => {
      headCalls++
      return headCalls === 1 ? { meta: [{ title: 'Reports' }] } : headGate
    },
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([homeRoute, reportsRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  await router.navigate({ to: '/reports' })
  await router.navigate({ to: '/' })
  expect(loader).toHaveBeenCalledTimes(1)

  const preload = router.preloadRoute({ to: '/reports' })
  await vi.waitFor(() => expect(headCalls).toBe(2))
  expect(headGate.status).toBe('pending')
  router.clearCache()
  headGate.resolve({ meta: [{ title: 'Preloaded Reports' }] })
  await preload

  await router.navigate({ to: '/reports' })
  expect(loader).toHaveBeenCalledTimes(2)
  expect(
    router.state.matches.find((match) => match.routeId === reportsRoute.id)
      ?.loaderData,
  ).toBe(2)
})

// Probe, not a required cancellation policy: invalidating the accepted route
// need not cancel unrelated private preload work, but the public operations
// must both settle and leave navigation usable.
test('invalidate and an unrelated in-flight preload both settle cleanly', async () => {
  const loaderGate = createControlledPromise<string>()
  const loader = vi.fn(() => loaderGate)
  const rootRoute = new BaseRootRoute({})
  const homeRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const targetRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/target',
    preloadStaleTime: Infinity,
    staleTime: Infinity,
    loader,
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([homeRoute, targetRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  const preload = router.preloadRoute({ to: '/target' })
  await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1))
  expect(loaderGate.status).toBe('pending')
  await router.invalidate()
  expect(loaderGate.status).toBe('pending')
  loaderGate.resolve('target data')
  await preload

  await router.navigate({ to: '/target' })
  expect(router.state.location.pathname).toBe('/target')
  expect(
    router.state.matches.find((match) => match.routeId === targetRoute.id)
      ?.loaderData,
  ).toBe('target data')
  expect(loader).toHaveBeenCalledTimes(1)
})
