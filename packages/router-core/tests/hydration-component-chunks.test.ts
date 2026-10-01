import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { hydrate } from '../src/ssr/client'
import { createTestRouter, dehydrateToBootstrap } from './routerTestUtils'
import type { TsrSsrGlobal } from '../src/ssr/types'

function settleWithin(promise: Promise<void>, ms: number) {
  return Promise.race([
    promise.then(() => 'hydrated' as const),
    new Promise<'waiting'>((resolve) =>
      setTimeout(() => resolve('waiting'), ms),
    ),
  ])
}

describe('hydration component chunks', () => {
  let mockWindow: { $_TSR?: TsrSsrGlobal }

  beforeEach(() => {
    mockWindow = {}
    vi.stubGlobal('window', mockWindow)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test.each([
    { withoutChunks: undefined, before: 'waiting' },
    { withoutChunks: true, before: 'hydrated' },
  ] as const)(
    'with _hydrateWithoutComponentChunks=$withoutChunks a pending component chunk leaves hydrate() $before',
    async ({ withoutChunks, before }) => {
      const makeRouteTree = (component?: unknown) => {
        const rootRoute = new BaseRootRoute({})
        const pageRoute = new BaseRoute({
          getParentRoute: () => rootRoute,
          path: '/page',
          component,
        })
        return rootRoute.addChildren([pageRoute])
      }
      const serverRouter = createTestRouter({
        routeTree: makeRouteTree(),
        history: createMemoryHistory({ initialEntries: ['/page'] }),
        isServer: true,
      })
      mockWindow.$_TSR = await dehydrateToBootstrap(serverRouter, {
        routes: {},
      })

      let resolveChunk!: () => void
      const chunk = new Promise<void>((resolve) => {
        resolveChunk = resolve
      })
      const router = createTestRouter({
        routeTree: makeRouteTree(
          Object.assign(() => null, { preload: () => chunk }),
        ),
        history: createMemoryHistory({ initialEntries: ['/page'] }),
        isServer: false,
      })
      router._hydrateWithoutComponentChunks = withoutChunks

      const hydration = hydrate(router)
      expect(await settleWithin(hydration, 50)).toBe(before)

      resolveChunk()
      expect(await settleWithin(hydration, 50)).toBe('hydrated')
      expect(router.state.matches.map((match) => match.routeId)).toEqual([
        '__root__',
        '/page',
      ])
    },
  )
})
