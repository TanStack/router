import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

describe('loader user-thrown abort values', () => {
  test('treats a user-thrown AbortSignal as an ordinary route error (isServer=false)', async () => {
    let matchSignal: AbortSignal | undefined
    const rootRoute = new BaseRootRoute({})
    const abortingRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/aborting',
      loader: ({ abortController }) => {
        matchSignal = abortController.signal
        throw matchSignal
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([abortingRoute]),
      history: createMemoryHistory({ initialEntries: ['/aborting'] }),
      isServer: false,
    })

    await router.load()

    const match = router.state.matches.find(
      (item) => item.routeId === abortingRoute.id,
    )
    expect(matchSignal?.aborted).toBe(false)
    expect(match?.status).toBe('error')
    expect(match?.error).toBe(matchSignal)
  })
})
