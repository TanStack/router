import { bench, describe, expect } from 'vitest'
import { createMemoryHistory, parseHref } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, defaultParseSearch } from '../src'
import { getNormalizedURL } from '../src/ssr/server'
import { createTestRouter } from './routerTestUtils'

const canonical = ['?q=a*b', '?q=two+words', '?a=1&b=2']
const noncanonical = ['?q=a%2Ab', '?q=two%20words', '?a=1&&b=2']
const workloads = [
  { name: 'no query', queries: [''] },
  { name: 'canonical query', queries: canonical },
  { name: 'noncanonical query', queries: noncanonical },
  { name: 'mixed queries', queries: ['', ...canonical, ...noncanonical] },
]
const iterations = 256
const options = { time: 1500, warmupTime: 500, throws: true }
let checksum = 0

describe.each(workloads)('$name', ({ queries }) => {
  const urls = queries.map((query) => `http://localhost/work${query}`)
  for (const [index, url] of urls.entries()) {
    const normalized = getNormalizedURL(url)
    expect(normalized.url.pathname).toBe('/work')
    expect(defaultParseSearch(normalized.url.search)).toEqual(
      defaultParseSearch(queries[index]!),
    )
  }

  bench(
    'normalize 256 request URLs',
    () => {
      let size = 0
      for (let index = 0; index < iterations; index++) {
        size += getNormalizedURL(urls[index % urls.length]!).url.pathname.length
      }
      checksum = size
    },
    options,
  )

  for (const rewrite of [false, true]) {
    const router = createTestRouter({
      routeTree: new BaseRootRoute({}),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      rewrite: rewrite
        ? { input: ({ url }) => url, output: ({ url }) => url }
        : undefined,
    })
    const locations = queries.map((query) =>
      parseHref(`/work${query}`, undefined),
    )
    for (const [index, location] of locations.entries()) {
      expect(router.parseLocation(location).search).toEqual(
        defaultParseSearch(queries[index]!),
      )
    }
    router.history.destroy()

    bench(
      `parse 256 locations (rewrite=${rewrite})`,
      () => {
        let size = 0
        for (let index = 0; index < iterations; index++) {
          size += router.parseLocation(locations[index % locations.length]!)
            .pathname.length
        }
        checksum = size
      },
      options,
    )
  }
})

describe.each([false, true])('query commits (rewrite=%s)', async (rewrite) => {
  const root = new BaseRootRoute({})
  const route = new BaseRoute({ getParentRoute: () => root, path: '/work' })
  const history = createMemoryHistory({ initialEntries: ['/work'] })
  const router = createTestRouter({
    routeTree: root.addChildren([route]),
    history,
    rewrite: rewrite
      ? { input: ({ url }) => url, output: ({ url }) => url }
      : undefined,
  })
  await router.load()

  const navigate = async () => {
    for (let index = 0; index < 8; index++) {
      const q = index % 4 < 2 ? 'two words' : 'a*b'
      await router.navigate({ to: '/work', search: { q }, replace: true })
    }
  }
  await navigate()
  expect(router.state.location.search).toEqual({ q: 'a*b' })
  expect(history.length).toBe(1)

  bench('8 changed and same-location navigations', navigate, {
    ...options,
    teardown: () => {
      expect(router.state.location.search).toEqual({ q: 'a*b' })
      expect(history.length).toBe(1)
    },
  })
})

void checksum
