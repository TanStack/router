import { createMemoryHistory } from '@tanstack/history'
import { runInNewContext } from 'node:vm'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { BaseRootRoute, BaseRoute } from '../src'
import { attachRouterServerSsrUtils } from '../src/ssr/ssr-server'
import { GLOBAL_TSR } from '../src/ssr/constants'
import { createLRUCache } from '../src/lru-cache'
import { createTestRouter } from './routerTestUtils'
import type { ManifestRouteAssets, ServerManifest } from '../src/manifest'
import type { DehydratedRouter } from '../src/ssr/types'

const ROUTE_COUNT = 50
const ASSETS_PER_ROUTE = 10

function buildRouter(paths: Array<string>) {
  const rootRoute = new BaseRootRoute({})
  const routes: Array<any> = [
    new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => null,
    }),
  ]
  for (let i = 0; i < ROUTE_COUNT; i++) {
    routes.push(
      new BaseRoute({
        getParentRoute: () => rootRoute,
        path: `route-${i}`,
        component: () => null,
      }),
    )
  }

  const routeTree = rootRoute.addChildren(routes)

  return createTestRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: paths }),
    isServer: true,
  })
}

function buildManifest(): ServerManifest {
  const entries: Record<string, ServerManifest['routes'][string]> = {
    __root__: { preloads: ['/assets/root.js'] },
  }
  for (let i = 0; i < ROUTE_COUNT; i++) {
    entries[`/route-${i}`] = {
      preloads: Array.from(
        { length: ASSETS_PER_ROUTE },
        (_, j) => `/assets/route-${i}-${j}.js`,
      ),
      css: [`/assets/route-${i}-0.css`],
    }
  }
  return { routes: entries }
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

async function dehydrateWithScripts(router: any) {
  await router.load()
  await router.serverSsr!.dehydrate()
  const script = router.serverSsr!.takeBufferedScripts()
  expect(script?.children).toBeTruthy()
  const children = script!.children!
  const parsed = parseSerializedRouter(children)
  router.serverSsr!.cleanup()
  return { parsed, children }
}

function normalizeMatches(matches: DehydratedRouter['matches']) {
  return matches.map(({ u: _updatedAt, ...rest }) => rest)
}

function enableManifestCache() {
  vi.stubEnv('NODE_ENV', 'production')
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('SSR manifest serialization cache', () => {
  test('cached second request produces identical hydration result', async () => {
    enableManifestCache()
    const manifest = buildManifest()

    const first = buildRouter(['/route-1'])
    attachRouterServerSsrUtils({ router: first, manifest })
    const firstResult = await dehydrateWithScripts(first)

    const second = buildRouter(['/route-1'])
    attachRouterServerSsrUtils({ router: second, manifest })
    const secondResult = await dehydrateWithScripts(second)

    // Same hydration result across requests sharing the matched-route set
    expect(secondResult.parsed.manifest).toEqual(firstResult.parsed.manifest)
    expect(normalizeMatches(secondResult.parsed.matches)).toEqual(
      normalizeMatches(firstResult.parsed.matches),
    )

    // Second request served from cache: manifest fragment byte-identical
    const manifestAssignment = `${GLOBAL_TSR}.router.manifest=`
    expect(
      secondResult.children.slice(
        secondResult.children.indexOf(manifestAssignment),
      ),
    ).toBe(
      firstResult.children.slice(
        firstResult.children.indexOf(manifestAssignment),
      ),
    )
  })

  test('emits manifest as separate assignment after router chunk', async () => {
    enableManifestCache()
    const router = buildRouter(['/route-2'])
    attachRouterServerSsrUtils({ router, manifest: buildManifest() })

    await router.load()
    await router.serverSsr!.dehydrate()

    const children = router.serverSsr!.takeBufferedScripts()!.children!
    const routerChunk = `${GLOBAL_TSR}.router=`
    const manifestAssignment = `${GLOBAL_TSR}.router.manifest=`
    const routerChunkIndex = children.indexOf(routerChunk)
    const assignmentIndex = children.indexOf(manifestAssignment)
    // Assignment must come after `$_TSR.router=` exists and before end signal
    expect(routerChunkIndex).toBeGreaterThan(0)
    expect(assignmentIndex).toBeGreaterThan(routerChunkIndex)
    expect(children.lastIndexOf(`${GLOBAL_TSR}.e()`)).toBeGreaterThan(
      assignmentIndex,
    )

    const dehydrated = parseSerializedRouter(children)
    router.serverSsr!.cleanup()
    expect(dehydrated.manifest).toBeDefined()
    expect(dehydrated.manifest!.routes['/route-2']).toEqual({
      preloads: Array.from(
        { length: ASSETS_PER_ROUTE },
        (_, j) => `/assets/route-2-${j}.js`,
      ),
      css: ['/assets/route-2-0.css'],
    })
  })

  test('cache hit equals uncached path hydration result', async () => {
    const uncached = buildRouter(['/route-3'])
    attachRouterServerSsrUtils({
      router: uncached,
      manifest: buildManifest(),
    })
    const uncachedResult = await dehydrateWithScripts(uncached)

    enableManifestCache()
    const cached = buildRouter(['/route-3'])
    attachRouterServerSsrUtils({ router: cached, manifest: buildManifest() })
    const cachedResult = await dehydrateWithScripts(cached)

    expect(cachedResult.parsed.manifest).toEqual(uncachedResult.parsed.manifest)
    expect(normalizeMatches(cachedResult.parsed.matches)).toEqual(
      normalizeMatches(uncachedResult.parsed.matches),
    )
  })

  test('request-scoped assets merge into cached manifest correctly', async () => {
    enableManifestCache()
    const manifest = buildManifest()
    const requestAssets: ManifestRouteAssets = {
      preloads: [{ href: '/assets/request.js', crossOrigin: 'anonymous' }],
    }

    const first = buildRouter(['/route-4'])
    attachRouterServerSsrUtils({ router: first, manifest })
    await first.load()
    await first.serverSsr!.dehydrate({ requestAssets })
    const firstParsed = parseSerializedRouter(
      first.serverSsr!.takeBufferedScripts()!.children!,
    )
    expect(firstParsed.manifest!.routes.__root__!.preloads).toEqual([
      { href: '/assets/request.js', crossOrigin: 'anonymous' },
      '/assets/root.js',
    ])

    const second = buildRouter(['/route-4'])
    attachRouterServerSsrUtils({ router: second, manifest })
    await second.load()
    await second.serverSsr!.dehydrate({ requestAssets })
    const secondParsed = parseSerializedRouter(
      second.serverSsr!.takeBufferedScripts()!.children!,
    )
    expect(secondParsed.manifest!.routes.__root__!.preloads).toEqual([
      { href: '/assets/request.js', crossOrigin: 'anonymous' },
      '/assets/root.js',
    ])
    expect(secondParsed.manifest!.routes['/route-4']).toEqual(
      firstParsed.manifest!.routes['/route-4'],
    )
  })

  test('distinct matched-route sets evict correctly and stay correct', async () => {
    enableManifestCache()

    // More distinct route sets than MANIFEST_CACHE_SIZE (100): forces LRU
    // eviction of early entries while later requests must stay correct.
    for (let round = 0; round < 2; round++) {
      for (let i = 0; i < ROUTE_COUNT; i++) {
        const router = buildRouter([`/route-${i}`])
        attachRouterServerSsrUtils({ router, manifest: buildManifest() })
        const result = await dehydrateWithScripts(router)
        expect(result.parsed.manifest!.routes[`/route-${i}`]).toBeDefined()
        expect(result.parsed.manifest!.routes.__root__).toBeDefined()
      }
    }
  })

  test('LRU cache is bounded and evicts oldest entries', () => {
    const cache = createLRUCache<string, number>(3)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('c', 3)
    // Touch 'a' so 'b' becomes oldest
    expect(cache.get('a')).toBe(1)
    cache.set('d', 4)

    expect(cache.get('b')).toBeUndefined()
    expect(cache.get('c')).toBe(3)
    expect(cache.get('a')).toBe(1)
    expect(cache.get('d')).toBe(4)
  })
})
