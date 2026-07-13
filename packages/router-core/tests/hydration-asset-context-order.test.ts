import { afterEach, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { hydrate } from '../src/ssr/client'
import { createTestRouter } from './routerTestUtils'
import type { TsrSsrGlobal } from '../src/ssr/types'

afterEach(() => {
  delete (globalThis as any).window
})

test('hydration reconstructs every match context before ancestor head reads the lane', async () => {
  let childContextSeenByRootHead: unknown
  const rootRoute = new BaseRootRoute({
    head: ({ matches }) => {
      childContextSeenByRootHead = matches[1]?.context
      return { meta: [{ title: 'hydrated' }] }
    },
  })
  const childRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/child',
    beforeLoad: () => ({ user: 'client fallback' }),
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([childRoute]),
    history: createMemoryHistory({ initialEntries: ['/child'] }),
    isServer: false,
  })
  const matches = router.matchRoutes(router.stores.location.get())

  ;(globalThis as any).window = {
    $_TSR: {
      router: {
        manifest: { routes: {} },
        dehydratedData: {},
        matches: matches.map((match) => ({
          i: match.id,
          s: 'success' as const,
          ssr: true,
          u: Date.now(),
          b:
            match.routeId === childRoute.id
              ? { user: 'server authenticated user' }
              : undefined,
        })),
      },
      h: vi.fn(),
      e: vi.fn(),
      c: vi.fn(),
      p: vi.fn(),
      buffer: [],
      initialized: false,
    } satisfies TsrSsrGlobal,
  }

  await hydrate(router)

  expect(childContextSeenByRootHead).toMatchObject({
    user: 'server authenticated user',
  })
})
