import { expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

const rootRoute = new BaseRootRoute({})
const indexRoute = new BaseRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: (search: { page?: number; q?: string }) => {
    return {
      page: typeof search.page === 'number' ? search.page : 1,
      q: typeof search.q === 'string' ? search.q : undefined,
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

test('same-search nav: searchStr matches emitted search object', () => {
  const router = makeRouter()
  router.buildLocation({ to: '/', search: true })
  const a = router.buildLocation({ to: '/', search: true })
  expect(a.searchStr).toBe('?page=1')
  // round-trip: re-stringifying the emitted search yields the emitted string
  expect(router.options.stringifySearch(a.search)).toBe(a.searchStr)
})

test('hash-only nav: href contains unchanged search plus hash', () => {
  const router = makeRouter()
  router.buildLocation({ to: '/', search: true })
  const h1 = router.buildLocation({ to: '/', search: true, hash: 'section' })
  expect(h1.href).toBe('/?page=1#section')
  expect(h1.searchStr).toBe('?page=1')
  const h2 = router.buildLocation({
    to: '/',
    search: true,
    hash: (prev: string) => `x-${prev.length}`,
  })
  expect(h2.href).toBe('/?page=1#x-0')
})

test('changed-search nav: fresh string computed', () => {
  const router = makeRouter()
  router.buildLocation({ to: '/', search: true })
  const b = router.buildLocation({
    to: '/',
    search: (prev: any) => ({ ...prev, page: 5 }),
  } as any)
  expect(b.searchStr).toBe('?page=5')
  expect(router.options.stringifySearch(b.search)).toBe(b.searchStr)
  // back to original search still produces the correct string
  const c = router.buildLocation({ to: '/', search: true })
  expect(c.searchStr).toBe('?page=1')
})

test('empty search serializes consistently', () => {
  const aboutRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/about',
  })
  const tree2 = new BaseRootRoute({}).addChildren([aboutRoute])
  const router = createTestRouter({
    routeTree: tree2,
    history: createMemoryHistory({ initialEntries: ['/about'] }),
  })
  router.buildLocation({ to: '/about', search: true })
  const loc = router.buildLocation({ to: '/about', search: true })
  expect(loc.searchStr).toBe('')
  expect(loc.href).toBe('/about')
})
