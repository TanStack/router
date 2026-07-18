import { expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, redirect } from '../src'
import { createTestRouter } from './routerTestUtils'
import { findMatch } from './pr-7805-review-client-transaction-utils'

test('N02: planning redirects participate in the same twenty-hop cycle budget', async () => {
  const boundedBailout = new Error('bounded planning redirect sentinel')
  let contextCalls = 0
  let boundedBailoutReached = false

  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const planningRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/planning-cycle',
    context: () => {
      contextCalls++
      if (contextCalls <= 21) {
        throw redirect({ to: '/planning-cycle' })
      }

      // This is deliberately an ordinary planning error. It makes a missing
      // redirect cap terminate deterministically rather than exhausting the
      // worker, while remaining unreachable with the twenty-hop contract.
      boundedBailoutReached = true
      throw boundedBailout
    },
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([indexRoute, planningRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  // Match mounted framework behavior so a same-URL redirect performs one
  // explicit reload instead of the no-subscriber test fallback's second load.
  const unsubscribe = router.history.subscribe(router.load)
  try {
    await router.navigate({ to: '/planning-cycle' })

    expect.soft(boundedBailoutReached).toBe(false)
    expect.soft(contextCalls).toBe(21)
    expect(findMatch(router, planningRoute.id)).toBeUndefined()
  } finally {
    unsubscribe()
  }
})
