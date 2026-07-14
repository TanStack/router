import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'

// https://github.com/TanStack/router/issues/7602
test('#7602: browser Back republishes a cached child with fresh parent beforeLoad context', async () => {
  const loaderContextNumbers: Array<number | undefined> = []
  const reloadGate = createControlledPromise<void>()
  let loaderRuns = 0

  const rootRoute = new BaseRootRoute({})
  const homeRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const reproRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/repro',
    beforeLoad: async () => {
      await Promise.resolve()
      return { number: 42 }
    },
  })
  const reproIndexRoute = new BaseRoute({
    getParentRoute: () => reproRoute,
    path: '/',
    loader: async ({ context }: { context: { number?: number } }) => {
      loaderRuns++
      loaderContextNumbers.push(context.number)
      if (loaderRuns === 2) {
        await reloadGate
      }
      return { visit: loaderRuns }
    },
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([
      homeRoute,
      reproRoute.addChildren([reproIndexRoute]),
    ]),
    history: createMemoryHistory({ initialEntries: ['/repro'] }),
  })
  const getChildMatch = () =>
    router.state.matches.find((match) => match.routeId === reproIndexRoute.id)
  // RouterProvider's Transitioner installs this subscription in applications.
  // It is what turns a browser Back history event into a router load.
  const unsubscribe = router.history.subscribe(router.load)

  try {
    await router.load()
    expect(loaderContextNumbers).toEqual([42])

    await router.navigate({ to: '/' })
    expect(getChildMatch()).toBeUndefined()

    router.history.back()
    await vi.waitFor(() => expect(loaderContextNumbers).toHaveLength(2))

    // The cached success is visible while its stale loader reloads. It must
    // never be published with the parent's context contribution missing.
    expect(router.state.location.pathname).toBe('/repro')
    expect(getChildMatch()?.status).toBe('success')
    expect(getChildMatch()?.context).toMatchObject({ number: 42 })
    expect(loaderContextNumbers).toEqual([42, 42])

    reloadGate.resolve()
    await vi.waitFor(() =>
      expect(getChildMatch()?.loaderData).toEqual({ visit: 2 }),
    )
    expect(getChildMatch()?.context).toMatchObject({ number: 42 })
  } finally {
    reloadGate.resolve()
    unsubscribe()
  }
})
