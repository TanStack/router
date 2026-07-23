import { expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'

test('N05: superseding before commit releases a settled background candidate lease', async () => {
  const blockedViewTransition = createControlledPromise<void>()
  const blockedViewTransitionStarted = createControlledPromise<void>()
  let dataLoaderCalls = 0
  let backgroundSignal: AbortSignal | undefined

  const rootRoute = new BaseRootRoute({})
  const dataRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/data',
    staleTime: 0,
    loader: ({ abortController }) => {
      dataLoaderCalls++
      if (dataLoaderCalls > 1) {
        backgroundSignal = abortController.signal
        return { revision: 2 }
      }
      return { revision: 1 }
    },
  })
  const otherRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/other',
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([dataRoute, otherRoute]),
    history: createMemoryHistory({ initialEntries: ['/data'] }),
  })

  await router.load()
  let blockNextTransition = true
  router.startViewTransition = async (publish) => {
    if (blockNextTransition) {
      blockNextTransition = false
      blockedViewTransitionStarted.resolve()
      await blockedViewTransition
    }
    await publish()
  }

  const staleReload = router.load()
  let successorNavigation: Promise<void> | undefined
  try {
    await blockedViewTransitionStarted
    expect(dataLoaderCalls).toBe(2)
    expect(backgroundSignal?.aborted).toBe(false)

    successorNavigation = router.navigate({ to: '/other' })
    await successorNavigation
    blockedViewTransition.resolve()
    await staleReload

    // A settled loader flight still owns a public signal until its lease is
    // released. The losing foreground lane stores background candidates outside
    // result.matches, so cleanup must explicitly include them.
    expect(backgroundSignal?.aborted).toBe(true)
  } finally {
    blockedViewTransition.resolve()
    await Promise.allSettled([
      staleReload,
      successorNavigation ?? Promise.resolve(),
    ])
  }
})
