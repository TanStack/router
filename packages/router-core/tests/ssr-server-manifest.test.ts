import { createMemoryHistory } from '@tanstack/history'
import { runInNewContext } from 'node:vm'
import { BaseRootRoute, BaseRoute } from '../src'
import { attachRouterServerSsrUtils } from '../src/ssr/ssr-server'
import { GLOBAL_TSR } from '../src/ssr/constants'
import { createTestRouter } from './routerTestUtils'
import { describe, expect, test } from 'vitest'
import type {
  ManifestCssLink,
  ManifestRouteAssets,
  ServerManifest,
} from '../src/manifest'
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

function buildManifest(): ServerManifest {
  const sharedAsset: ManifestCssLink = '/assets/shared.css'

  return {
    routes: {
      __root__: {
        css: [sharedAsset],
        preloads: ['/assets/root.js'],
      },
      '/': {
        css: [sharedAsset],
        preloads: ['/assets/index.js'],
      },
      '/posts': {
        css: [sharedAsset],
        preloads: ['/assets/posts.js'],
      },
    },
  }
}

function buildInlineManifest(): ServerManifest {
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
      css: ['/assets/shared.css'],
    })
  })

  test('omits unmatched route assets when disabled', async () => {
    const manifest = await dehydrateManifest({
      includeUnmatchedRouteAssets: false,
    })

    expect(manifest.routes['/posts']).toBeUndefined()
    expect(manifest.routes['/']?.preloads).toEqual(['/assets/index.js'])
  })

  test('preserves script format when dehydrating the manifest', async () => {
    const router = buildRouter()
    const manifest: ServerManifest = {
      ...buildManifest(),
      scriptFormat: 'iife',
    }

    attachRouterServerSsrUtils({
      router,
      manifest,
    })

    await router.load()
    await router.serverSsr!.dehydrate()

    const script = router.serverSsr!.takeBufferedScripts()
    expect(script?.children).toBeTruthy()
    const dehydratedManifest = parseSerializedRouter(
      script!.children!,
    ).manifest!

    expect(dehydratedManifest.scriptFormat).toBe('iife')
  })

  test('maps request-scoped preload links into SSR manifest data', async () => {
    const router = buildRouter()
    const manifest = buildManifest()
    const requestAssets: ManifestRouteAssets = {
      preloads: [
        { href: '/assets/rsc-client.js', crossOrigin: 'anonymous' },
      ],
      scripts: [
        {
          attrs: {
            src: '/assets/request-script.js',
            type: 'module',
          },
          children: 'console.log("request")',
        },
      ],
      css: [
        { href: '/assets/rsc-client.css', crossOrigin: 'use-credentials' },
      ],
    }

    attachRouterServerSsrUtils({
      router,
      manifest,
      getRequestAssets: () => requestAssets,
    })

    await router.load()

    expect(router.ssr!.manifest?.routes.__root__).toMatchObject({
      preloads: [
        { href: '/assets/rsc-client.js', crossOrigin: 'anonymous' },
        '/assets/root.js',
      ],
      scripts: [
        {
          attrs: {
            src: '/assets/request-script.js',
            type: 'module',
          },
          children: 'console.log("request")',
        },
      ],
      css: [
        { href: '/assets/rsc-client.css', crossOrigin: 'use-credentials' },
        '/assets/shared.css',
      ],
    })
  })

  test('maps preloads-only request assets into SSR manifest data', async () => {
    const router = buildRouter()
    const manifest = buildManifest()
    const requestAssets: ManifestRouteAssets = {
      preloads: [
        { href: '/assets/rsc-client.js', crossOrigin: 'anonymous' },
      ],
    }

    attachRouterServerSsrUtils({
      router,
      manifest,
      getRequestAssets: () => requestAssets,
    })

    await router.load()

    expect(router.ssr!.manifest?.routes.__root__?.preloads).toEqual([
      { href: '/assets/rsc-client.js', crossOrigin: 'anonymous' },
      '/assets/root.js',
    ])
  })

  test('dehydrates request-scoped preload links into manifest data', async () => {
    const router = buildRouter()
    const manifest = buildManifest()

    attachRouterServerSsrUtils({
      router,
      manifest,
    })

    await router.load()
    await router.serverSsr!.dehydrate({
      requestAssets: {
        preloads: [
          { href: '/assets/rsc-client.js', crossOrigin: 'anonymous' },
        ],
        scripts: [
          {
            attrs: {
              src: '/assets/request-script.js',
              type: 'module',
            },
            children: 'console.log("request")',
          },
        ],
        css: [
          {
            href: '/assets/rsc-client.css',
            crossOrigin: 'use-credentials',
          },
        ],
      },
    })

    const script = router.serverSsr!.takeBufferedScripts()
    expect(script?.children).toBeTruthy()
    const dehydratedManifest = parseSerializedRouter(script!.children!).manifest!

    expect(dehydratedManifest.routes.__root__).toMatchObject({
      preloads: [
        { href: '/assets/rsc-client.js', crossOrigin: 'anonymous' },
        '/assets/root.js',
      ],
      scripts: [
        {
          attrs: {
            src: '/assets/request-script.js',
            type: 'module',
          },
          children: 'console.log("request")',
        },
      ],
      css: [
        { href: '/assets/rsc-client.css', crossOrigin: 'use-credentials' },
        '/assets/shared.css',
      ],
    })
    expect(Array.isArray(dehydratedManifest.routes.__root__?.css)).toBe(true)
    expect((dehydratedManifest.routes.__root__?.css as any).links).toBe(
      undefined,
    )
  })

  test('dehydrates preloads-only request assets into manifest data', async () => {
    const router = buildRouter()
    const manifest = buildManifest()

    attachRouterServerSsrUtils({
      router,
      manifest,
    })

    await router.load()
    await router.serverSsr!.dehydrate({
      requestAssets: {
        preloads: [
          { href: '/assets/rsc-client.js', crossOrigin: 'anonymous' },
        ],
      },
    })

    const script = router.serverSsr!.takeBufferedScripts()
    expect(script?.children).toBeTruthy()
    const dehydratedManifest = parseSerializedRouter(script!.children!).manifest!

    expect(dehydratedManifest.routes.__root__?.preloads).toEqual([
      { href: '/assets/rsc-client.js', crossOrigin: 'anonymous' },
      '/assets/root.js',
    ])
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

    const ssrInlineCss = router.ssr!.manifest?.inlineStyle
    expect(ssrInlineCss).toMatchObject({
      children: '.shared{color:red}',
    })

    await router.serverSsr!.dehydrate()

    const script = router.serverSsr!.takeBufferedScripts()
    expect(script?.children).toBeTruthy()
    const dehydratedRouter = parseSerializedRouter(script!.children!)
    const dehydratedManifest = dehydratedRouter.manifest!
    const rootInlineCss = dehydratedManifest.inlineStyle
    const allLinks = Object.values(dehydratedManifest.routes).flatMap(
      (route) => route.css ?? [],
    )

    expect(rootInlineCss).toEqual({
      attrs: {
        suppressHydrationWarning: true,
      },
    })
    expect('inlineCss' in dehydratedManifest).toBe(false)
    expect(
      allLinks.some((asset) =>
        typeof asset === 'string'
          ? asset === '/assets/shared.css'
          : asset.href === '/assets/shared.css',
      ),
    ).toBe(false)
    expect(dehydratedManifest.routes['/']?.preloads).toEqual([
      '/assets/index.js',
    ])
  })
})
