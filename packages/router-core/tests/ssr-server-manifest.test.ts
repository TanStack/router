import { createMemoryHistory } from '@tanstack/history'
import { runInNewContext } from 'node:vm'
import { BaseRootRoute, BaseRoute } from '../src'
import { attachRouterServerSsrUtils } from '../src/ssr/ssr-server'
import { GLOBAL_TSR } from '../src/ssr/constants'
import { createTestRouter } from './routerTestUtils'
import { describe, expect, test } from 'vitest'
import type { Manifest } from '../src/manifest'
import type { DehydratedRouter } from '../src/ssr/types'

function buildRouter() {
  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null,
  })
  const postsRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/posts',
    component: () => null,
  })

  const routeTree = rootRoute.addChildren([indexRoute, postsRoute])

  return createTestRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
    isServer: true,
  })
}

function buildManifest(): Manifest {
  const sharedAsset = {
    tag: 'link' as const,
    attrs: {
      rel: 'stylesheet',
      href: '/assets/shared.css',
      type: 'text/css',
    },
  }

  return {
    routes: {
      __root__: {
        assets: [sharedAsset],
        preloads: ['/assets/root.js'],
      },
      '/': {
        assets: [sharedAsset],
        preloads: ['/assets/index.js'],
      },
      '/posts': {
        assets: [sharedAsset],
        preloads: ['/assets/posts.js'],
      },
    },
  }
}

function buildInlineManifest(): Manifest {
  const manifest = buildManifest()
  return {
    ...manifest,
    inlineCss: {
      styles: {
        '/assets/shared.css': '.shared{color:red}',
      },
    },
  }
}

async function dehydrateManifest(options?: {
  includeUnmatchedRouteAssets?: boolean
}) {
  const router = buildRouter()
  const manifest = buildManifest()

  attachRouterServerSsrUtils({
    router,
    manifest,
    includeUnmatchedRouteAssets: options?.includeUnmatchedRouteAssets,
  })

  await router.load()
  await router.serverSsr!.dehydrate()

  const script = router.serverSsr!.takeBufferedScripts()
  expect(script?.tag).toBe('script')
  expect(script?.children).toBeTruthy()

  return parseSerializedRouter(script!.children!).manifest!
}

function parseSerializedRouter(serialized: string): DehydratedRouter {
  const context: Record<string, any> = {
    document: {
      currentScript: {
        remove() {},
      },
    },
  }
  context.self = context

  runInNewContext(serialized, context)

  const router = context[GLOBAL_TSR]?.router
  expect(router).toBeDefined()
  return router
}

describe('attachRouterServerSsrUtils manifest dehydration', () => {
  test('includes unmatched route assets by default', async () => {
    const manifest = await dehydrateManifest()

    expect(manifest.routes['/posts']).toEqual({
      assets: [
        {
          tag: 'link',
          attrs: {
            rel: 'stylesheet',
            href: '/assets/shared.css',
            type: 'text/css',
          },
        },
      ],
    })
  })

  test('omits unmatched route assets when disabled', async () => {
    const manifest = await dehydrateManifest({
      includeUnmatchedRouteAssets: false,
    })

    expect(manifest.routes['/posts']).toBeUndefined()
    expect(manifest.routes['/']?.preloads).toEqual(['/assets/index.js'])
  })

  test('inlines stylesheet assets for SSR and strips stylesheet links from dehydration', async () => {
    const router = buildRouter()
    const manifest = buildInlineManifest()

    attachRouterServerSsrUtils({
      router,
      manifest,
      includeUnmatchedRouteAssets: false,
    })

    await router.load()

    const ssrRootAssets = router.ssr!.manifest?.routes.__root__?.assets ?? []
    expect(
      ssrRootAssets.find(
        (asset) =>
          asset.tag === 'style' &&
          asset.inlineCss &&
          asset.children === '.shared{color:red}',
      ),
    ).toBeTruthy()

    await router.serverSsr!.dehydrate()

    const script = router.serverSsr!.takeBufferedScripts()
    expect(script?.children).toBeTruthy()
    const dehydratedRouter = parseSerializedRouter(script!.children!)
    const dehydratedManifest = dehydratedRouter.manifest!
    const rootAssets = dehydratedManifest.routes.__root__?.assets ?? []
    const allAssets = Object.values(dehydratedManifest.routes).flatMap(
      (route) => route.assets ?? [],
    )

    expect(rootAssets).toEqual([
      {
        tag: 'style',
        attrs: {
          suppressHydrationWarning: true,
        },
        inlineCss: true,
      },
    ])
    expect(
      allAssets.some(
        (asset) =>
          asset.tag === 'link' && asset.attrs?.href === '/assets/shared.css',
      ),
    ).toBe(false)
    expect(dehydratedManifest.routes['/']?.preloads).toEqual([
      '/assets/index.js',
    ])
  })
})
