import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { attachRouterServerSsrUtils } from '../src/ssr/ssr-server'
import { createTestRouter } from './routerTestUtils'
import { describe, expect, test } from 'vitest'
import type { Manifest } from '../src/manifest'

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
  expect(script?.children).toContain('router=')

  return script!.children!
}

describe('attachRouterServerSsrUtils manifest dehydration', () => {
  test('includes unmatched route assets by default', async () => {
    const serialized = await dehydrateManifest()

    expect(serialized).toContain('"/posts":$R[')
    expect(serialized).toContain('assets:$R[')
    expect(serialized).not.toContain('"/assets/posts.js"')
  })

  test('omits unmatched route assets when disabled', async () => {
    const serialized = await dehydrateManifest({
      includeUnmatchedRouteAssets: false,
    })

    expect(serialized).not.toContain('"/posts":$R[')
    expect(serialized).toContain('"/":$R[')
    expect(serialized).toContain('"/assets/index.js"')
  })
})
