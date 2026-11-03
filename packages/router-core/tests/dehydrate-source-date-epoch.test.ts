import { afterEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { dehydrateMatch } from '../src/ssr/ssr-server'
import { createTestRouter, dehydrateToBootstrap } from './routerTestUtils'
import type { ServerManifest } from '../src/manifest'

const testManifest: ServerManifest = { routes: {} }

// 2023-11-14T22:13:20Z; the payload carries milliseconds.
const EPOCH_SECONDS = '1700000000'
const EPOCH_MILLIS = 1_700_000_000_000

function createServerRouter() {
  const rootRoute = new BaseRootRoute({})
  const postsRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/posts',
    loader: () => ({ posts: ['a', 'b'] }),
  })
  return createTestRouter({
    routeTree: rootRoute.addChildren([postsRoute]),
    history: createMemoryHistory({ initialEntries: ['/posts'] }),
    isServer: true,
  })
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe('dehydrated match updatedAt under SOURCE_DATE_EPOCH', () => {
  test('pins every match to SOURCE_DATE_EPOCH when it is set', async () => {
    vi.stubEnv('SOURCE_DATE_EPOCH', EPOCH_SECONDS)
    const router = createServerRouter()

    const bootstrap = await dehydrateToBootstrap(router, testManifest)

    expect(bootstrap.router?.matches).toHaveLength(2)
    expect(bootstrap.router?.matches.map((match) => match.u)).toEqual([
      EPOCH_MILLIS,
      EPOCH_MILLIS,
    ])
    // Only the timestamp is pinned; the rest of the payload is untouched.
    expect(bootstrap.router?.matches[1]!.l).toEqual({ posts: ['a', 'b'] })
    expect(bootstrap.router?.matches.map((match) => match.s)).toEqual([
      'success',
      'success',
    ])
  })

  test('dehydrates the same payload across two renders under the same SOURCE_DATE_EPOCH', async () => {
    vi.stubEnv('SOURCE_DATE_EPOCH', EPOCH_SECONDS)

    const first = await dehydrateToBootstrap(createServerRouter(), testManifest)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-06-07T08:09:10Z'))
    const second = await dehydrateToBootstrap(
      createServerRouter(),
      testManifest,
    )

    expect(second.router?.matches).toEqual(first.router?.matches)
  })

  test("uses the match's own updatedAt without SOURCE_DATE_EPOCH", async () => {
    vi.stubEnv('SOURCE_DATE_EPOCH', undefined)
    const router = createServerRouter()

    const bootstrap = await dehydrateToBootstrap(router, testManifest)

    expect(bootstrap.router?.matches.map((match) => match.u)).toEqual(
      router.state.matches.map((match) => match.updatedAt),
    )
    expect(bootstrap.router?.matches.map((match) => match.u)).not.toContain(
      EPOCH_MILLIS,
    )
  })

  test.each([
    ['not a whole number of seconds', 'yesterday'],
    ['negative', '-1'],
    ['fractional', '1700000000.5'],
    ['beyond safe integer millisecond precision', '9007199254740992'],
  ])('ignores a SOURCE_DATE_EPOCH that is %s', async (_, value) => {
    vi.stubEnv('SOURCE_DATE_EPOCH', value)
    const router = createServerRouter()
    await router.load()
    const match = { ...router.state.matches[0]!, updatedAt: 12_345 }

    expect(dehydrateMatch(match).u).toBe(12_345)
  })
})
