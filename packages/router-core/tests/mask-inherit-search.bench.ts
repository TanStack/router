import { createMemoryHistory } from '@tanstack/history'
import { bench, describe, expect } from 'vitest'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

const BATCH_SIZE = 32
const QUERY_SIZES = [0, 4, 64] as const

type MaskMode = 'unmasked' | 'explicit' | 'configured'

function createFixture(mode: MaskMode, inheritSearch: boolean, querySize: number) {
  const search = Object.fromEntries(
    Array.from({ length: querySize }, (_, index) => [
      `field${index}`,
      `value ${index} / 日本語 & ${'x'.repeat(32)}`,
    ]),
  )
  const root = new BaseRootRoute({})
  const item = new BaseRoute({
    getParentRoute: () => root,
    path: '/items/$id',
  })
  const publicItem = new BaseRoute({
    getParentRoute: () => root,
    path: '/en/items/$id',
  })
  const routeTree = root.addChildren([item, publicItem])
  const mask = {
    to: '/en/items/$id' as const,
    params: { id: '42' },
    ...(inheritSearch ? { inheritSearch: true as const } : { search }),
  }
  const history = createMemoryHistory({ initialEntries: ['/'] })
  const router = createTestRouter({
    routeTree,
    history,
    isServer: false,
    // Location construction uses an explicit public origin rather than reading
    // a browser global; rendering and browser-history work are not measured.
    origin: 'https://example.com',
    scrollRestoration: false,
    routeMasks:
      mode === 'configured'
        ? [{ routeTree, from: '/items/$id', ...mask }]
        : undefined,
  })
  history.destroy()

  return () =>
    router.buildLocation({
      to: '/items/$id',
      params: { id: '42' },
      search,
      // Fresh public inputs keep the workload on location construction rather
      // than a previously cached Link destination.
      ...(mode === 'explicit' ? { mask } : {}),
    })
}

const variants = [
  { name: 'unmasked ordinary', mode: 'unmasked' as const, inheritSearch: false },
  ...(['explicit', 'configured'] as const).flatMap((mode) =>
    [false, true].map((inheritSearch) => ({
      name: `${mode} ${inheritSearch ? 'inheritSearch' : 'ordinary'}`,
      mode,
      inheritSearch,
    })),
  ),
]

const distributions = [
  { name: 'empty query (best case)', indices: Array(BATCH_SIZE).fill(0) },
  {
    name: '64-field encoded query (largest tested)',
    indices: Array(BATCH_SIZE).fill(2),
  },
  {
    name: 'mixed queries (20 empty, 8 small, 4 large)',
    indices: Array.from({ length: BATCH_SIZE }, (_, index) =>
      index % 8 < 5 ? 0 : index % 8 < 7 ? 1 : 2,
    ),
  },
]

for (const distribution of distributions) {
  describe(`${distribution.name}: ${BATCH_SIZE} locations`, () => {
    for (const variant of variants) {
      let builds: Array<ReturnType<typeof createFixture>> = []
      let expected = 0
      let checksum = 0
      bench(
        variant.name,
        () => {
          checksum = 0
          for (const build of builds) {
            const location = build()
            checksum +=
              location.href.length +
              (location.maskedLocation ?? location).href.length
          }
        },
        {
          setup: () => {
            const fixtures = QUERY_SIZES.map((querySize) => {
              const build = createFixture(
                variant.mode,
                variant.inheritSearch,
                querySize,
              )
              const location = build()
              const ordinary = createFixture('explicit', false, querySize)()
              expect(ordinary.pathname).toBe('/items/42')
              expect(ordinary.maskedLocation?.pathname).toBe('/en/items/42')
              expect(location.href).toBe(ordinary.href)
              expect(location.publicHref).toBe(ordinary.publicHref)
              expect(location.search).toEqual(ordinary.search)
              if (variant.mode === 'unmasked') {
                expect(location.maskedLocation).toBeUndefined()
              } else {
                expect(location.maskedLocation?.href).toBe(
                  ordinary.maskedLocation?.href,
                )
                expect(location.maskedLocation?.publicHref).toBe(
                  ordinary.maskedLocation?.publicHref,
                )
                expect(location.maskedLocation?.search).toEqual(location.search)
                expect(location.maskedLocation?.searchStr).toBe(location.searchStr)
                if (variant.inheritSearch) {
                  expect(location.maskedLocation?.search).toBe(location.search)
                }
              }
              return build
            })
            // Only selected benchmarks run setup, so ordinary controls also run
            // against the parent without evaluating an inheritSearch oracle.
            builds = distribution.indices.map((index) => fixtures[index]!)
            expected = builds.reduce((sum, build) => {
              const location = build()
              return (
                sum +
                location.href.length +
                (location.maskedLocation ?? location).href.length
              )
            }, 0)
          },
          time: 1000,
          warmupTime: 200,
          throws: true,
          teardown: () => {
            expect(checksum).toBe(expected)
          },
        },
      )
    }
  })
}
