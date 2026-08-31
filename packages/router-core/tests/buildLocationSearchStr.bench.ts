import { bench, describe, expect } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

const rootRoute = new BaseRootRoute({})
const indexRoute = new BaseRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: (search: { page?: number }) => {
    return {
      page: typeof search.page === 'number' ? search.page : 1,
    }
  },
})
const routeTree = rootRoute.addChildren([indexRoute])

function makeRouter() {
  return createTestRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
}

let benchmarkSink = 0
const iterations = 2_000

// Warm up and correctness check
const warm = makeRouter()
const loc = warm.buildLocation({ to: '/', search: true })
expect(loc.searchStr).toBe('?page=1')
const hashLoc = warm.buildLocation({
  to: '/',
  search: true,
  hash: (prev: string) => prev,
})
expect(hashLoc.href.startsWith('/?page=1')).toBe(true)

describe('router.buildLocation - repeated same-search navigations', () => {
  bench(
    'validateSearch route, same-search nav',
    () => {
      const router = makeRouter()
      let size = 0
      for (let i = 0; i < iterations; i++) {
        size += router.buildLocation({ to: '/', search: true }).searchStr
          .length
      }
      benchmarkSink = size
    },
    { time: 2000 },
  )
})

void benchmarkSink
