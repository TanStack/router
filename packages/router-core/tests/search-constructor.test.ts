import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

describe('search parameters with constructor data', () => {
  test.each([
    ['null', null],
    ['zero', 0],
    ['string', 'model'],
    ['object', { prototype: { hasOwnProperty: null } }],
  ])('initializes and loads with a %s constructor field', async (_, value) => {
    const rootRoute = new BaseRootRoute({})
    const loader = vi.fn(() => 'loaded')
    const validateSearch = vi.fn(() => ({}))
    const route = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      validateSearch,
      loader,
    })
    const history = createMemoryHistory({
      initialEntries: [
        `/?constructor=${encodeURIComponent(JSON.stringify(value))}`,
      ],
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([route]),
      history,
      isServer: false,
      search: { strict: true },
    })

    await router.load()

    expect(loader).toHaveBeenCalledOnce()
    expect(validateSearch).toHaveBeenCalled()
    expect(router.state.matches.at(-1)?.loaderData).toBe('loaded')
  })

  test('preserves constructor data during client navigation', async () => {
    const rootRoute = new BaseRootRoute({})
    const route = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      validateSearch: (search: Record<string, unknown>) => search,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([route]),
      history: createMemoryHistory(),
      isServer: false,
    })
    await router.load()

    await router.navigate({ to: '/', search: { constructor: null } })

    expect(router.state.location.search.constructor).toBeNull()
    expect(router.state.location.href).toBe('/?constructor=null')
    await router.navigate({ to: '/', search: { constructor: 'model' } })
    expect(router.state.location.search.constructor).toBe('model')
  })
})
