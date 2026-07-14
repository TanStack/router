import { createMemoryHistory } from '@tanstack/history'
import { describe, expect, test, vi } from 'vitest'
import { BaseRootRoute, BaseRoute } from '../src'
import { hydrate } from '../src/ssr/client'
import { dehydrateMatch } from '../src/ssr/ssr-server'
import { createTestRouter } from './routerTestUtils'
import type { TsrSsrGlobal } from '../src/ssr/types'

function createRouter(initialEntry: string, isServer: boolean) {
  const rootRoute = new BaseRootRoute({
    notFoundComponent: () => 'Root not found',
  })
  const notFoundRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/404',
    component: () => 'Not found route',
  })

  const router = createTestRouter({
    routeTree: rootRoute.addChildren([notFoundRoute]),
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
    isServer,
  })

  return { rootRoute, router }
}

// https://github.com/TanStack/router/issues/5427
describe('issue #5427: root-only global not-found hydration', () => {
  test('resolves the client URL when the dehydrated /404 lane has a child match', async () => {
    const { router: bootstrapRouter } = createRouter('/404', true)
    await bootstrapRouter.load()

    const dehydratedMatches = bootstrapRouter.state.matches.map(dehydrateMatch)
    const lastMatchId = dehydratedMatches.at(-1)?.i
    const bootstrap: TsrSsrGlobal = {
      router: {
        manifest: { routes: {} },
        dehydratedData: {},
        matches: dehydratedMatches,
        lastMatchId,
      },
      h: () => {},
      e: () => {},
      c: () => {},
      p: () => {},
      buffer: [],
      initialized: false,
    }

    const hadBootstrap = Object.prototype.hasOwnProperty.call(window, '$_TSR')
    const previousBootstrap = window.$_TSR
    window.$_TSR = bootstrap

    try {
      const { rootRoute, router } = createRouter('/missing', false)

      await hydrate(router)
      await vi.waitFor(() => {
        expect(router.state.resolvedLocation?.pathname).toBe('/missing')
      })

      expect(router.state.matches).toHaveLength(1)
      expect(router.state.matches[0]).toMatchObject({
        routeId: rootRoute.id,
        globalNotFound: true,
      })
    } finally {
      if (hadBootstrap) {
        window.$_TSR = previousBootstrap
      } else {
        delete window.$_TSR
      }
    }
  })
})
