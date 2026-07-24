import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'

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

test('clearCache cancels a brand-new in-flight preload before it can populate the cache', async () => {
  const firstLoad = createControlledPromise<string>()
  const loader = vi
    .fn<() => string | Promise<string>>()
    .mockImplementationOnce(() => firstLoad)
    .mockReturnValue('navigation data')
  const rootRoute = new BaseRootRoute({})
  const homeRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const reportsRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/reports',
    preloadStaleTime: Infinity,
    staleTime: Infinity,
    loader,
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([homeRoute, reportsRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  const preload = router.preloadRoute({ to: '/reports' })
  await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1))

  router.clearCache()
  firstLoad.resolve('obsolete preload data')
  await preload
  await router.navigate({ to: '/reports' })

  expect(loader).toHaveBeenCalledTimes(2)
  expect(
    router.state.matches.find((match) => match.routeId === reportsRoute.id)
      ?.loaderData,
  ).toBe('navigation data')
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

// Preload lanes are not cancelled by unrelated navigations: an in-flight
// async beforeLoad runs to completion, its loader still executes and seeds
// the cache, and a later navigation to the target reuses that work.
test('an unrelated navigation does not cancel an in-flight preload beforeLoad', async () => {
  const beforeLoadGate = createControlledPromise<{ token: string }>()
  const beforeLoad = vi.fn(() => beforeLoadGate)
  const loader = vi.fn(() => 'target data')
  const rootRoute = new BaseRootRoute({})
  const homeRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const otherRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/other',
  })
  const targetRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/target',
    preloadStaleTime: Infinity,
    staleTime: Infinity,
    beforeLoad,
    loader,
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([homeRoute, otherRoute, targetRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  const preload = router.preloadRoute({ to: '/target' })
  await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledTimes(1))

  // Unrelated navigation commits while the preload's beforeLoad is pending.
  await router.navigate({ to: '/other' })
  expect(router.state.location.pathname).toBe('/other')

  beforeLoadGate.resolve({ token: 'ctx' })
  await preload
  // The preload completed its work despite the navigation.
  expect(loader).toHaveBeenCalledTimes(1)

  // Navigating to the target consumes the seeded cache without a new load.
  await router.navigate({ to: '/target' })
  expect(router.state.location.pathname).toBe('/target')
  expect(
    router.state.matches.find((match) => match.routeId === targetRoute.id)
      ?.loaderData,
  ).toBe('target data')
  expect(loader).toHaveBeenCalledTimes(1)
})
