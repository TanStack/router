import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'

test('a late preload releases its lease without aborting a cache donor adopted by navigation', async () => {
  const secondHeadStarted = createControlledPromise<void>()
  const secondHeadGate = createControlledPromise<{
    meta: Array<{ title: string }>
  }>()
  let headCalls = 0
  let loaderSignal: AbortSignal | undefined
  let aborts = 0

  const loader = vi.fn(
    ({ abortController }: { abortController: AbortController }) => {
      loaderSignal = abortController.signal
      loaderSignal.addEventListener('abort', () => aborts++)
      return 'target data'
    },
  )
  const rootRoute = new BaseRootRoute({})
  const homeRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const targetRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/target',
    staleTime: Infinity,
    preloadStaleTime: Infinity,
    loader,
    head: () => {
      headCalls++
      if (headCalls === 2) {
        secondHeadStarted.resolve()
        return secondHeadGate
      }
      return { meta: [{ title: `target ${headCalls}` }] }
    },
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([homeRoute, targetRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  await router.preloadRoute({ to: '/target' })

  const cachedDonor = router.stores.cachedMatches
    .get()
    .find((match) => match.routeId === targetRoute.id)
  expect(cachedDonor).toBeDefined()
  expect(loader).toHaveBeenCalledTimes(1)
  expect(loaderSignal?.aborted).toBe(false)
  expect(aborts).toBe(0)

  const latePreload = router.preloadRoute({ to: '/target' })
  await secondHeadStarted

  try {
    // This navigation clones and adopts the cached donor while the second
    // preload still owns another lease and is blocked in asset projection.
    await router.navigate({ to: '/target' })

    const activeTarget = router.state.matches.find(
      (match) => match.routeId === targetRoute.id,
    )
    expect(activeTarget).toBeDefined()
    expect(activeTarget).not.toBe(cachedDonor)
    expect(
      router.stores.cachedMatches
        .get()
        .some((match) => match.id === cachedDonor!.id),
    ).toBe(false)
    expect(loader).toHaveBeenCalledTimes(1)
    expect(loaderSignal?.aborted).toBe(false)
    expect(aborts).toBe(0)

    secondHeadGate.resolve({ meta: [{ title: 'late preload' }] })
    await latePreload

    // Finalizing the now-obsolete preload releases its own borrowed lease;
    // the navigation-owned match must keep the loader signal alive.
    expect(loader).toHaveBeenCalledTimes(1)
    expect(loaderSignal?.aborted).toBe(false)
    expect(aborts).toBe(0)

    await router.navigate({ to: '/' })
    expect(loaderSignal?.aborted).toBe(true)
    expect(aborts).toBe(1)
  } finally {
    secondHeadGate.resolve({ meta: [{ title: 'cleanup' }] })
    await Promise.allSettled([latePreload])
  }
})
