import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { attachRouterServerSsrUtils } from '../src/ssr/ssr-server'
import { createTestRouter } from './routerTestUtils'
import type { AnyRouter } from '../src'
import type { ServerManifest } from '../src/manifest'
import type { TsrSsrGlobal } from '../src/ssr/types'

async function dehydrateToManifest(
  router: AnyRouter,
  manifest: ServerManifest,
): Promise<NonNullable<TsrSsrGlobal['router']>['manifest']> {
  attachRouterServerSsrUtils({ router, manifest })
  try {
    await router.load()
    await router.serverSsr!.dehydrate()

    const script = router.serverSsr!.takeBufferedScripts()
    expect(script?.children).toBeTruthy()

    const context: Record<string, any> = {
      document: {
        currentScript: {
          remove() {},
        },
      },
    }
    context.self = context
    runInNewContext(script!.children!, context)

    return context.$_TSR!.router!.manifest
  } finally {
    router.serverSsr?.cleanup()
  }
}

function createServerRouter() {
  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => 'Index',
  })
  const poolRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/pool',
    component: () => 'Pool',
  })
  return {
    router: createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, poolRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      isServer: true,
    }),
    rootRoute,
  }
}

describe('issue-8224: dehydrated manifest keeps css for unmatched routes', () => {
  it('includes routes outside the SSR match set so client-side navigation can re-declare shared chunk css', async () => {
    const { router, rootRoute } = createServerRouter()
    const manifest: ServerManifest = {
      routes: {
        [rootRoute.id]: { css: ['/assets/root.css'] },
        '/': { css: ['/assets/dashboard.css'] },
        // '/pool' is never part of the SSR match set for a direct load of '/',
        // but shares the dashboard chunk's stylesheet with '/'
        '/pool': { css: ['/assets/dashboard.css'] },
      },
    }

    const dehydratedManifest = await dehydrateToManifest(router, manifest)

    expect(dehydratedManifest).toBeDefined()
    expect(Object.keys(dehydratedManifest!.routes).sort()).toEqual(
      ['/', '/pool', rootRoute.id].sort(),
    )
    expect(dehydratedManifest!.routes['/pool']!.css).toEqual([
      '/assets/dashboard.css',
    ])
  })

  it('keeps stripped entries for matched routes when inlineCss is enabled while still including unmatched routes', async () => {
    const { router, rootRoute } = createServerRouter()
    const manifest: ServerManifest = {
      inlineCss: {
        styles: {
          '/assets/root.css': 'body { margin: 0 }',
        },
      },
      routes: {
        [rootRoute.id]: { css: ['/assets/root.css'] },
        '/': { css: ['/assets/dashboard.css'] },
        '/pool': { css: ['/assets/dashboard.css'] },
      },
    }

    const dehydratedManifest = await dehydrateToManifest(router, manifest)

    // the matched root route's inlined stylesheet is stripped from its entry
    expect(dehydratedManifest!.routes[rootRoute.id]!.css).toBeUndefined()
    // and the placeholder for the inlined styles is present
    expect(dehydratedManifest!.inlineStyle).toBeDefined()
    // the unmatched route still dehydrates with its stylesheet
    expect(dehydratedManifest!.routes['/pool']!.css).toEqual([
      '/assets/dashboard.css',
    ])
  })
})
