import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter, loadServerResponse } from './routerTestUtils'

describe('loader user-thrown abort values', () => {
  test.each(
    ([false, true] as const).flatMap((isServer) => [
      {
        isServer,
        thrownType: 'AbortSignal',
        createThrownValue: (signal: AbortSignal) => signal,
      },
      {
        isServer,
        thrownType: 'AbortError',
        createThrownValue: () =>
          new DOMException('The operation was aborted.', 'AbortError'),
      },
    ]),
  )(
    'treats a user-thrown $thrownType as an ordinary route error (isServer=$isServer)',
    async ({ isServer, createThrownValue }) => {
      let matchSignal: AbortSignal | undefined
      let thrownValue: unknown
      const rootRoute = new BaseRootRoute({})
      const abortingRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/aborting',
        loader: ({ abortController }) => {
          matchSignal = abortController.signal
          thrownValue = createThrownValue(matchSignal)
          throw thrownValue
        },
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([abortingRoute]),
        history: createMemoryHistory({ initialEntries: ['/aborting'] }),
        isServer,
      })

      if (isServer) {
        const response = await loadServerResponse(router, '/aborting')
        expect(response.status).toBe(500)
      } else {
        await router.load()
      }

      const match = router.state.matches.find(
        (item) => item.routeId === abortingRoute.id,
      )
      expect(matchSignal?.aborted).toBe(false)
      expect(match?.status).toBe('error')
      expect(match?.error).toBe(thrownValue)
    },
  )
})
