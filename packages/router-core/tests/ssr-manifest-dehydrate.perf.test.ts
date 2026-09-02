import { createMemoryHistory } from '@tanstack/history'
import { describe, expect, test } from 'vitest'
import { BaseRootRoute, BaseRoute } from '../src'
import { attachRouterServerSsrUtils } from '../src/ssr/ssr-server'
import { createTestRouter } from './routerTestUtils'
import type { ServerManifest } from '../src/manifest'

const ROUTE_COUNT = 50
const ASSETS_PER_ROUTE = 10
const ITERATIONS = 200

function buildRouteTree() {
  const rootRoute = new BaseRootRoute({})
  let parent: any = rootRoute
  for (let i = 0; i < ROUTE_COUNT; i++) {
    const currentParent = parent
    const route = new BaseRoute({
      getParentRoute: () => currentParent,
      path: `segment-${i}`,
      component: () => null,
    })
    currentParent.addChildren([route])
    parent = route
  }
  return rootRoute
}

function buildManifest(): ServerManifest {
  const entries: Record<string, ServerManifest['routes'][string]> = {
    __root__: {
      preloads: ['/assets/root-BQx3nLmP.js'],
      scripts: [
        {
          attrs: { src: '/assets/root-BQx3nLmP.js', type: 'module' },
          children: '',
        },
      ],
      css: [
        {
          href: '/assets/root-Dk2s9fQw.css',
          crossOrigin: 'anonymous',
        },
      ],
    },
  }
  // Nested route IDs are cumulative: /segment-0, /segment-0/segment-1, ...
  let routeId = ''
  for (let i = 0; i < ROUTE_COUNT; i++) {
    routeId += `/segment-${i}`
    entries[routeId] = {
      preloads: Array.from(
        { length: ASSETS_PER_ROUTE },
        (_, j) => `/assets/chunk-${i}-segment-${j}-a1B2c3D4.js`,
      ),
      scripts: [
        {
          attrs: {
            src: `/assets/route-${i}-entry-Zz9Yy8Xx.js`,
            type: 'module',
          },
          children: '',
        },
      ],
      css: [
        {
          href: `/assets/route-${i}-styles-Qq7Ww6Ee.css`,
          crossOrigin: 'anonymous',
        },
      ],
    }
  }
  return { routes: entries }
}

const DEEPEST_PATH =
  '/' + Array.from({ length: ROUTE_COUNT }, (_, i) => `segment-${i}`).join('/')

async function measureOnce(manifest: ServerManifest) {
  const router = createTestRouter({
    routeTree: buildRouteTree(),
    history: createMemoryHistory({ initialEntries: [DEEPEST_PATH] }),
    isServer: true,
  })
  attachRouterServerSsrUtils({ router, manifest })

  await router.load()
  expect(router.stores.matches.get().length).toBe(ROUTE_COUNT + 1)
  const start = performance.now()
  await router.serverSsr!.dehydrate()
  const children = router.serverSsr!.takeBufferedScripts()!.children!
  const end = performance.now()
  router.serverSsr!.cleanup()
  return { ms: end - start, bytes: children.length }
}

function summarize(name: string, samples: Array<number>) {
  const sorted = samples.slice().sort((a, b) => a - b)
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length
  const median = sorted[Math.floor(sorted.length / 2)]!
  const p95 = sorted[Math.floor(sorted.length * 0.95)]!
  console.log(
    `[perf] ${name}: mean=${mean.toFixed(3)}ms median=${median.toFixed(3)}ms p95=${p95.toFixed(3)}ms n=${samples.length}`,
  )
}

describe('SSR manifest dehydration throughput', () => {
  test('measures uncached vs cached-miss vs cached-hit', async () => {
    const uncached: Array<number> = []
    const cachedMiss: Array<number> = []
    const cachedHit: Array<number> = []

    // Warmup
    for (let i = 0; i < 20; i++) {
      await measureOnce(buildManifest())
    }

    const previousEnv = process.env.NODE_ENV

    process.env.NODE_ENV = 'test'
    for (let i = 0; i < ITERATIONS; i++) {
      const result = await measureOnce(buildManifest())
      uncached.push(result.ms)
    }

    process.env.NODE_ENV = 'production'
    // Fresh manifest object per request -> WeakMap miss every time
    for (let i = 0; i < ITERATIONS; i++) {
      const result = await measureOnce(buildManifest())
      cachedMiss.push(result.ms)
    }

    // Shared manifest object -> serialization LRU hit after first request
    const sharedManifest = buildManifest()
    await measureOnce(sharedManifest)
    for (let i = 0; i < ITERATIONS; i++) {
      const result = await measureOnce(sharedManifest)
      cachedHit.push(result.ms)
    }

    process.env.NODE_ENV = previousEnv

    const bytes = await measureOnce(buildManifest())
    console.log(
      `[perf] emitted script size: ${bytes.bytes} bytes (${ROUTE_COUNT} routes x ${ASSETS_PER_ROUTE} preloads)`,
    )
    summarize(
      `uncached dehydrate+serialize (${ROUTE_COUNT} routes x ${ASSETS_PER_ROUTE} assets)`,
      uncached,
    )
    summarize('cached - first request (cache miss)', cachedMiss)
    summarize('cached - subsequent requests (cache hit)', cachedHit)

    expect(cachedHit.length).toBe(ITERATIONS)
  }, 120_000)
})
