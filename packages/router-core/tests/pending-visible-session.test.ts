import { afterEach, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'

afterEach(() => {
  vi.restoreAllMocks()
})

test('an already-presented pending match starts a replacement session as rendered', async () => {
  const loaderGate = createControlledPromise<string>()
  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const targetRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/target',
    pendingMs: 0,
    pendingMinMs: 50,
    pendingComponent: () => null,
    loader: () => loaderGate,
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([indexRoute, targetRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  const firstNavigation = router.navigate({
    to: '/target',
    search: { revision: 'first' } as any,
  })
  await vi.waitFor(() => {
    expect(
      router.stores.matches
        .get()
        .find((match) => match.routeId === targetRoute.id)?.status,
    ).toBe('pending')
    expect(router._pending?.ack).toBeDefined()
  })

  const firstSession = router._pending!
  clearTimeout(firstSession.timer)
  router._pending = undefined

  const secondNavigation = router.navigate({
    to: '/target',
    search: { revision: 'second' } as any,
  })

  try {
    await vi.waitFor(() => {
      expect(router._pending?.owner).not.toBe(firstSession.owner)
      expect(router._pending?.ack).toBeDefined()
    })
    await expect(router._pending!.ack).resolves.toBe(true)
  } finally {
    loaderGate.resolve('loaded')
    await Promise.all([firstNavigation, secondNavigation])
  }
})
