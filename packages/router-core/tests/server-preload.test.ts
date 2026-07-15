import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, redirect } from '../src'
import { createTestRouter } from './routerTestUtils'

test('server preload owns matching, execution, and cache publication', async () => {
  const loader = vi.fn(({ preload }: { preload: boolean }) => preload)
  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const targetRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/target',
    loader,
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([indexRoute, targetRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    isServer: true,
  })

  const matches = await router.preloadRoute({ to: '/target' })

  expect(loader).toHaveBeenCalledTimes(1)
  expect(matches?.at(-1)).toMatchObject({
    routeId: targetRoute.id,
    loaderData: true,
    preload: true,
  })
  expect(router.stores.cachedMatches.get()).toContain(matches?.at(-1))
})

test('server preload false preserves ancestor work but skips its loader', async () => {
  const seen: Array<boolean> = []
  const loader = vi.fn()
  const rootLoader = vi.fn(() => 'root data')
  const rootRoute = new BaseRootRoute({ loader: rootLoader })
  const targetRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/target',
    preload: false,
    beforeLoad: ({ preload }) => {
      seen.push(preload)
    },
    loader,
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([targetRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    isServer: true,
  })

  const matches = await router.preloadRoute({ to: '/target' })

  expect(matches).toHaveLength(2)
  expect(seen).toEqual([true])
  expect(rootLoader).toHaveBeenCalledTimes(1)
  expect(loader).not.toHaveBeenCalled()
  expect(matches?.[0]).toMatchObject({
    routeId: rootRoute.id,
    loaderData: 'root data',
    preload: true,
    invalid: false,
  })
  expect(matches?.[1]).toMatchObject({
    routeId: targetRoute.id,
    preload: false,
    invalid: true,
    status: 'success',
  })
  expect(router.stores.cachedMatches.get()).toEqual(matches)
})

test('server preload stops following a redirect cycle', async () => {
  const loader = vi.fn(() => {
    throw redirect({ to: '/loop' })
  })
  const rootRoute = new BaseRootRoute({})
  const loopRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/loop',
    loader,
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([loopRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    isServer: true,
  })

  await router.preloadRoute({ to: '/loop' })

  expect(loader).toHaveBeenCalledTimes(21)
})
