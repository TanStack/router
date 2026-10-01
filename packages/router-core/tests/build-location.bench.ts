import { bench, describe, expect } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, retainSearchParams } from '../src'
import { createTestRouter } from './routerTestUtils'
import type { AnyRouter, ParsedLocation } from '../src'

// Use the same workload before and after the cache moves into the binding.
// Select the revision's implementation once, outside the measured publication.

const LINKS = 32

function createBenchRouter(withMiddleware: boolean) {
  const root = new BaseRootRoute({
    validateSearch: (search: Record<string, unknown>) => ({
      page: Number(search.page ?? 1),
    }),
  })
  const posts = new BaseRoute({
    getParentRoute: () => root,
    path: '/posts',
    // Only routes with middleware get a `search` key, like real route trees.
    ...(withMiddleware
      ? { search: { middlewares: [retainSearchParams(['page'])] } }
      : {}),
  } as any)
  const post = new BaseRoute({
    getParentRoute: () => posts,
    path: '/$postId',
  })
  const edit = new BaseRoute({
    getParentRoute: () => post,
    path: '/edit',
  })
  const history = createMemoryHistory({ initialEntries: ['/posts/1?page=2'] })
  const router = createTestRouter({
    routeTree: root.addChildren([
      posts.addChildren([post.addChildren([edit])]),
    ]),
    history,
    scrollRestoration: false,
    isServer: false,
    origin: 'http://localhost',
  })
  history.destroy()
  return router
}

type Dest = Record<string, unknown> & { _fromLocation?: ParsedLocation }

function createPublication(
  router: AnyRouter,
  dests: Array<Dest>,
  sameSource: boolean,
) {
  const internalBuild = (
    router as AnyRouter & {
      _buildLocation?: (
        dest: any,
        source: ParsedLocation,
        dependency: { sourceDependent: boolean },
      ) => ParsedLocation
    }
  )._buildLocation
  const states = dests.map((dest) => ({
    dest,
    built: undefined as ParsedLocation | undefined,
    sourceDependent: false,
    scopeLocation: undefined as ParsedLocation | undefined,
  }))
  const source = router.latestLocation
  if (internalBuild) {
    return () => {
      const location = sameSource ? source : { ...source }
      let checksum = 0
      for (const cache of states) {
        if (
          !cache.built ||
          (cache.sourceDependent && cache.scopeLocation !== location)
        ) {
          cache.built = internalBuild(cache.dest, location, cache)
          cache.scopeLocation = cache.sourceDependent ? location : undefined
        }
        checksum += cache.built.href.length
      }
      return checksum
    }
  }
  return () => {
    const location = sameSource ? source : { ...source }
    let checksum = 0
    for (const dest of dests) {
      dest._fromLocation = location
      checksum += router.buildLocation(dest as any).href.length
    }
    return checksum
  }
}

function defineCase(
  name: string,
  withMiddleware: boolean,
  makeDest: (index: number) => Dest,
  expectedHref: (index: number) => string,
  sameSource = false,
) {
  const router = createBenchRouter(withMiddleware)
  const dests = Array.from({ length: LINKS }, (_, index) => makeDest(index))
  const expected = dests.reduce(
    (sum, _dest, index) => sum + expectedHref(index).length,
    0,
  )
  const publication = createPublication(router, dests, sameSource)
  expect(publication()).toBe(expected)
  expect(publication()).toBe(expected)
  let checksum = 0
  bench(
    name,
    () => {
      checksum = publication()
    },
    {
      time: 1000,
      warmupTime: 200,
      throws: true,
      teardown: () => {
        expect(checksum).toBe(expected)
      },
    },
  )
}

describe(`buildLocation per publication (${LINKS} links)`, () => {
  defineCase(
    'absolute to + literal params (binding cache hit)',
    false,
    (index) => ({ to: '/posts/$postId', params: { postId: String(index) } }),
    (index) => `/posts/${index}`,
  )

  defineCase(
    'absolute to + search updater (reads current search)',
    false,
    (index) => ({
      to: '/posts',
      search: (prev: Record<string, unknown>) => ({ ...prev, page: index }),
    }),
    (index) => `/posts?page=${index}`,
  )

  defineCase(
    'absolute to + search updater + retainSearchParams middleware',
    true,
    (index) => ({
      to: '/posts/$postId',
      params: { postId: String(index) },
      search: () => ({ page: index }),
    }),
    (index) => `/posts/${index}?page=${index}`,
  )

  defineCase(
    'relative to from the current match',
    false,
    (index) => ({
      to: './edit',
      search: (prev: unknown) => prev,
      hash: `h${index}`,
    }),
    (index) => `/posts/1/edit?page=2#h${index}`,
  )

  defineCase(
    'params: true (inherits current params)',
    false,
    (index) => ({ to: '/posts/$postId/edit', params: true, hash: `h${index}` }),
    (index) => `/posts/1/edit#h${index}`,
  )

  defineCase(
    'masked destination',
    false,
    (index) => ({
      to: '/posts/$postId',
      params: { postId: String(index) },
      search: () => ({ page: index }),
      mask: { to: '/posts' },
    }),
    (index) => `/posts/${index}?page=${index}`,
  )
  defineCase(
    'mixed static and inherited destinations (24 static, 8 inherited)',
    false,
    (index) =>
      index < 24
        ? { to: '/posts/$postId', params: { postId: String(index) } }
        : { to: '/posts/$postId', params: true },
    (index) => `/posts/${index < 24 ? index : 1}`,
  )
  defineCase(
    'fixed masked destination (binding cache hit)',
    false,
    (index) => ({
      to: '/posts/$postId',
      params: { postId: String(index) },
      mask: { to: '/posts' },
    }),
    (index) => `/posts/${index}`,
  )
  defineCase(
    'only the mask inherits source search',
    false,
    (index) => ({
      to: '/posts/$postId',
      params: { postId: String(index) },
      mask: { to: '/posts', search: true },
    }),
    (index) => `/posts/${index}`,
  )
  defineCase(
    'unchanged source identity with search updater',
    false,
    (index) => ({
      to: '/posts',
      search: (prev: Record<string, unknown>) => ({ ...prev, page: index }),
    }),
    (index) => `/posts?page=${index}`,
    true,
  )
})
