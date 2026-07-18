import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'

test('N10: navigation does not join loader work from a different beforeLoad generation', async () => {
  const preloadLoaderStarted = createControlledPromise<void>()
  const preloadLoaderMayFinish = createControlledPromise<void>()
  let beforeLoadRevision = 0

  const beforeLoad = vi.fn(({ preload }: { preload: boolean }) => ({
    revision: ++beforeLoadRevision,
    source: preload ? 'preload' : 'navigation',
  }))
  const loader = vi.fn(
    async ({
      context,
      preload,
    }: {
      context: { revision: number; source: string }
      preload: boolean
    }) => {
      const observed = { ...context, preload }
      if (loader.mock.calls.length === 1) {
        preloadLoaderStarted.resolve()
        await preloadLoaderMayFinish
      }
      return observed
    },
  )

  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const guardedRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/guarded',
    preloadStaleTime: Infinity,
    beforeLoad,
    loader,
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([indexRoute, guardedRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  const preload = router.preloadRoute({ to: '/guarded' })
  let navigation: Promise<void> | undefined
  try {
    await preloadLoaderStarted
    expect(beforeLoad).toHaveBeenCalledTimes(1)
    expect(loader).toHaveBeenCalledTimes(1)

    navigation = router.navigate({ to: '/guarded' })
    await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledTimes(2))

    expect(beforeLoad.mock.calls.map(([context]) => context.preload)).toEqual([
      true,
      false,
    ])

    preloadLoaderMayFinish.resolve()
    await Promise.all([preload, navigation])

    const match = router.state.matches.find(
      (candidate) => candidate.routeId === guardedRoute.id,
    )
    expect(match?.context).toEqual({
      revision: 2,
      source: 'navigation',
    })
    expect.soft(loader).toHaveBeenCalledTimes(2)
    expect.soft(loader.mock.calls.map(([context]) => context.context)).toEqual([
      { revision: 1, source: 'preload' },
      { revision: 2, source: 'navigation' },
    ])
    expect(match?.loaderData).toEqual({
      revision: 2,
      source: 'navigation',
      preload: false,
    })
  } finally {
    preloadLoaderMayFinish.resolve()
    await Promise.allSettled([preload, navigation ?? Promise.resolve()])
  }
})
