import { beforeEach, describe, expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  BaseRoute,
  retainSearchParams,
  stripSearchParams,
} from '../src'
import { createTestRouter } from './routerTestUtils'

/**
 * A navigation used to run every matched route's `validateSearch` three times:
 * once in `matchRoutesLightweight` (to work out `buildLocation`'s `fromSearch`),
 * once in the `validate` search middleware that builds the committed URL, and
 * once in `matchRoutesInternal`. With real schemas (zod/valibot) that dominates
 * navigation cost, so these tests pin how often user validators are invoked.
 */

let counts: Record<string, number>

function countingValidator(id: string, fn: (search: any) => any) {
  return (search: Record<string, any>) => {
    counts[id] = (counts[id] ?? 0) + 1
    return fn(search)
  }
}

function total() {
  return Object.values(counts).reduce((sum, n) => sum + n, 0)
}

function makeTree() {
  const rootRoute = new BaseRootRoute({
    validateSearch: countingValidator('root', (search) => ({
      theme: search.theme ?? 'light',
    })),
  })
  const layoutRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    id: '_layout',
    validateSearch: countingValidator('layout', (search) => ({
      page: Number(search.page ?? 1),
    })),
  })
  const aRoute = new BaseRoute({
    getParentRoute: () => layoutRoute,
    path: '/a',
    validateSearch: countingValidator('a', (search) => ({
      sort: search.sort ?? 'asc',
    })),
  })
  const bRoute = new BaseRoute({
    getParentRoute: () => layoutRoute,
    path: '/b',
    validateSearch: countingValidator('b', (search) => ({
      sort: search.sort ?? 'asc',
    })),
  })
  return {
    rootRoute,
    layoutRoute,
    aRoute,
    bRoute,
    routeTree: rootRoute.addChildren([
      layoutRoute.addChildren([aRoute, bRoute]),
    ]),
  }
}

function makeRouter(initialEntry = '/a?theme=light&page=1&sort=asc') {
  const { routeTree, ...routes } = makeTree()
  const router = createTestRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  })
  return { router, ...routes }
}

beforeEach(() => {
  counts = {}
})

describe('search validation is not repeated per navigation', () => {
  test('a sibling navigation that keeps the search validates each ancestor once', async () => {
    const { router } = makeRouter()
    await router.load()
    counts = {}

    await router.navigate({ to: '/b' })

    // Down from three runs per matched route: `matchRoutesLightweight` no
    // longer re-validates the branch just to work out `buildLocation`'s
    // `fromSearch`.
    expect(counts).toEqual({ root: 2, layout: 2, b: 2 })
    expect(total()).toBe(6)
    expect(router.state.location.searchStr).toBe('?theme=light&page=1&sort=asc')
  })

  test('a navigation that changes the search validates each route at most twice', async () => {
    const { router } = makeRouter()
    await router.load()
    counts = {}

    await router.navigate({
      to: '/a',
      search: (prev: any) => ({ ...prev, page: 3 }),
    })

    expect(counts).toEqual({ root: 2, layout: 2, a: 2 })
    expect(router.state.location.searchStr).toBe('?theme=light&page=3&sort=asc')
  })

  test('re-matching the same location still re-runs every validator', async () => {
    const { router } = makeRouter()
    await router.load()
    counts = {}

    await router.load()
    expect(counts).toEqual({ root: 1, layout: 1, a: 1 })

    counts = {}
    await router.invalidate()
    expect(counts).toEqual({ root: 1, layout: 1, a: 1 })
  })

  test('a validator whose result depends on external state is re-run on reload', async () => {
    let fail = false
    const rootRoute = new BaseRootRoute({})
    const guarded = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/guarded',
      validateSearch: () => {
        if (fail) throw new Error('invalid search')
        return {}
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([guarded]),
      history: createMemoryHistory({ initialEntries: ['/guarded'] }),
    })

    await router.load()
    expect(router.state.matches.at(-1)?.searchError).toBeUndefined()

    fail = true
    await router.load()
    expect(router.state.matches.at(-1)?.searchError).toBeDefined()
  })
})

describe('reused search validation keeps its semantics', () => {
  test('accumulated and strict search stay correct across sibling navigations', async () => {
    const { router } = makeRouter()
    await router.load()

    await router.navigate({ to: '/b' })
    const matches = router.state.matches
    expect(matches.map((m) => m.routeId)).toEqual([
      '__root__',
      '/_layout',
      '/_layout/b',
    ])
    const full = { theme: 'light', page: 1, sort: 'asc' }
    // Every match sees the accumulated search; `_strictSearch` only carries
    // what this route and its ancestors actually validated.
    expect(matches[0]!.search).toEqual(full)
    expect(matches[0]!._strictSearch).toEqual({ theme: 'light' })
    expect(matches[1]!.search).toEqual(full)
    expect(matches[1]!._strictSearch).toEqual({ theme: 'light', page: 1 })
    expect(matches[2]!.search).toEqual(full)
    expect(matches[2]!._strictSearch).toEqual(full)

    await router.navigate({
      to: '/a',
      search: (prev: any) => ({ ...prev, page: 7 }),
    })
    expect(router.state.matches.at(-1)!.search).toEqual({
      theme: 'light',
      page: 7,
      sort: 'asc',
    })
    expect(router.state.matches.at(-1)!._strictSearch).toEqual({
      theme: 'light',
      page: 7,
      sort: 'asc',
    })
  })

  test('a search validation error is still reported after a clean navigation', async () => {
    const rootRoute = new BaseRootRoute({
      validateSearch: (search: Record<string, any>) => ({
        theme: search.theme ?? 'light',
      }),
    })
    const strict = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/strict',
      validateSearch: (search: Record<string, any>) => {
        if (typeof search.id !== 'number') {
          throw new Error('id must be a number')
        }
        return { id: search.id }
      },
    })
    const other = new BaseRoute({ getParentRoute: () => rootRoute, path: '/' })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([strict, other]),
      history: createMemoryHistory({ initialEntries: ['/?theme=dark'] }),
    })

    await router.load()
    expect(router.state.matches.at(-1)?.searchError).toBeUndefined()

    await router.navigate({ to: '/strict', search: { id: 'nope' } as any })
    expect(router.state.matches.at(-1)?.searchError).toBeDefined()
    // The failing route contributes nothing, so the parent's search survives.
    expect(router.state.matches.at(-1)?.search).toEqual({
      theme: 'light',
      id: 'nope',
    })

    await router.navigate({ to: '/strict', search: { id: 5 } as any })
    expect(router.state.matches.at(-1)?.searchError).toBeUndefined()
    expect(router.state.matches.at(-1)?.search).toEqual({
      theme: 'light',
      id: 5,
    })
  })

  test('throwOnError still throws for an invalid search', () => {
    const rootRoute = new BaseRootRoute({})
    const strict = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/strict',
      validateSearch: (): { ok: boolean } => {
        throw new Error('nope')
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([strict]),
      history: createMemoryHistory({ initialEntries: ['/strict'] }),
    })

    expect(() =>
      router.matchRoutes('/strict', {}, { throwOnError: true }),
    ).toThrow()
    // and again, so a memoized success can never swallow the second throw
    expect(() =>
      router.matchRoutes('/strict', {}, { throwOnError: true }),
    ).toThrow()
  })

  test('search middlewares still run on every navigation', async () => {
    const rootRoute = new BaseRootRoute({
      validateSearch: (search: Record<string, any>) => ({
        keepMe: search.keepMe ?? 'kept',
        dropMe: search.dropMe ?? 'default',
      }),
      search: {
        middlewares: [
          retainSearchParams(['keepMe']),
          stripSearchParams({ dropMe: 'default' }),
        ],
      },
    })
    const a = new BaseRoute({ getParentRoute: () => rootRoute, path: '/a' })
    const b = new BaseRoute({ getParentRoute: () => rootRoute, path: '/b' })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([a, b]),
      history: createMemoryHistory({ initialEntries: ['/a?keepMe=hello'] }),
    })

    await router.load()
    expect(router.state.location.searchStr).toBe('?keepMe=hello')

    await router.navigate({ to: '/b' })
    expect(router.state.location.searchStr).toBe('?keepMe=hello')
    expect(router.state.matches.at(-1)!.search).toEqual({
      keepMe: 'hello',
      dropMe: 'default',
    })
  })

  test('routes without validateSearch inherit the parent search unchanged', async () => {
    const rootRoute = new BaseRootRoute({
      validateSearch: (search: Record<string, any>) => ({
        theme: search.theme ?? 'light',
      }),
    })
    const layout = new BaseRoute({
      getParentRoute: () => rootRoute,
      id: '_layout',
    })
    const leaf = new BaseRoute({ getParentRoute: () => layout, path: '/leaf' })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([layout.addChildren([leaf])]),
      history: createMemoryHistory({ initialEntries: ['/leaf?theme=dark'] }),
    })

    await router.load()
    const matches = router.state.matches
    expect(matches.map((m) => m.search)).toEqual([
      { theme: 'dark' },
      { theme: 'dark' },
      { theme: 'dark' },
    ])
    expect(matches.at(-1)!._strictSearch).toEqual({ theme: 'dark' })
  })
})
