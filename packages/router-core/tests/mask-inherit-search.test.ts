import { createMemoryHistory } from '@tanstack/history'
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  BaseRootRoute,
  BaseRoute,
  defaultParseSearch,
  defaultStringifySearch,
} from '../src'
import { createTestRouter } from './routerTestUtils'
import type { SearchMiddleware } from '../src'

function setup(configuredMask = false, conflictingSearch = false) {
  const rootRoute = new BaseRootRoute()
  const mainMiddleware = vi.fn<SearchMiddleware<Record<string, unknown>>>(
    ({ search, next }) => ({
      ...next(search),
      resolved: 'main',
    }),
  )
  const maskMiddleware = vi.fn<SearchMiddleware<Record<string, unknown>>>(
    ({ search, next }) => ({
      ...next(search),
      resolved: 'mask',
    }),
  )
  const mainRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/items/$id',
    search: { middlewares: [mainMiddleware] },
  })
  const maskRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/en/items/$id',
    search: { middlewares: [maskMiddleware] },
  })
  const routeTree = rootRoute.addChildren([mainRoute, maskRoute])
  const mask = {
    to: '/en/items/$id',
    params: { id: '42' },
    hash: 'visible',
    inheritSearch: true as const,
  }
  const routeMask = { routeTree, from: '/items/$id' as const, ...mask }
  if (conflictingSearch) {
    // Simulate JavaScript configuration that cannot satisfy the public types.
    Object.assign(routeMask, { search: { unexpected: true } })
  }
  const stringifySearch = vi.fn(defaultStringifySearch)
  const history = createMemoryHistory({ initialEntries: ['/?initial=value'] })
  const router = createTestRouter({
    routeTree,
    history,
    stringifySearch,
    routeMasks: configuredMask ? [routeMask] : undefined,
  })
  stringifySearch.mockClear()
  return {
    router,
    history,
    mask,
    mainMiddleware,
    maskMiddleware,
    stringifySearch,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('route mask inheritSearch', () => {
  test.each([false, true])(
    'inherits validated defaults after the main reducer without mask validation (configured=%s)',
    (configuredMask) => {
      const rootRoute = new BaseRootRoute()
      const mainValidator = vi.fn((search: Record<string, unknown>) => ({
        ...search,
        page: Number(search.page ?? 1),
      }))
      const maskValidator = vi.fn(() => ({ maskDefault: 'must-not-appear' }))
      const mainRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/items',
        validateSearch: mainValidator,
      })
      const visibleRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/en/items',
        validateSearch: maskValidator,
      })
      const routeTree = rootRoute.addChildren([mainRoute, visibleRoute])
      const mask = { to: '/en/items', inheritSearch: true as const }
      const stringifySearch = vi.fn(defaultStringifySearch)
      const router = createTestRouter({
        routeTree,
        history: createMemoryHistory({
          initialEntries: ['/?seed=keep&initial=must-not-leak'],
        }),
        stringifySearch,
        routeMasks: configuredMask
          ? [{ routeTree, from: '/items', ...mask }]
          : undefined,
      })
      const reducer = vi.fn((previous: Record<string, unknown>) => ({
        seed: previous.seed,
      }))
      stringifySearch.mockClear()

      const location = router.buildLocation({
        to: '/items',
        search: reducer,
        _includeValidateSearch: true,
        ...(configuredMask ? {} : { mask }),
      })

      expect(reducer).toHaveBeenCalledExactlyOnceWith({
        seed: 'keep',
        initial: 'must-not-leak',
      })
      expect(mainValidator).toHaveBeenCalledExactlyOnceWith({ seed: 'keep' })
      expect(maskValidator).not.toHaveBeenCalled()
      expect(location.search).toEqual({ seed: 'keep', page: 1 })
      expect(location.maskedLocation?.search).toBe(location.search)
      expect(location.maskedLocation?.searchStr).toBe(location.searchStr)
      expect(location.maskedLocation?.href).toBe('/en/items?seed=keep&page=1')
      expect(stringifySearch).toHaveBeenCalledExactlyOnceWith(location.search)
    },
  )

  test.each([false, true])(
    'preserves empty and encoded query values without leaking current search (configured=%s)',
    (configuredMask) => {
      const rootRoute = new BaseRootRoute()
      const mainRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/items',
      })
      const visibleRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/en/items',
      })
      const routeTree = rootRoute.addChildren([mainRoute, visibleRoute])
      const mask = { to: '/en/items', inheritSearch: true as const }
      const stringifySearch = vi.fn(defaultStringifySearch)
      const router = createTestRouter({
        routeTree,
        history: createMemoryHistory({
          initialEntries: ['/?initial=must-not-leak'],
        }),
        stringifySearch,
        routeMasks: configuredMask
          ? [{ routeTree, from: '/items', ...mask }]
          : undefined,
      })
      for (const search of [
        {},
        {
          empty: '',
          zero: 0,
          disabled: false,
          text: 'žluťoučký + 100% / ? & #',
          nested: { list: ['a+b', '%20', 0, false] },
        },
      ]) {
        stringifySearch.mockClear()
        const location = router.buildLocation({
          to: '/items',
          search,
          ...(configuredMask ? {} : { mask }),
        })

        expect(location.search).toEqual(search)
        expect(defaultParseSearch(location.searchStr)).toEqual(search)
        expect(location.maskedLocation?.search).toBe(location.search)
        expect(location.maskedLocation?.searchStr).toBe(location.searchStr)
        expect(location.maskedLocation?.href).toBe(
          `/en/items${location.searchStr}`,
        )
        expect(location.searchStr).not.toContain('initial=')
        if (Object.keys(search).length === 0) {
          expect(location.maskedLocation?.href).toBe('/en/items')
          expect(location.searchStr).toBe('')
        }
        expect(stringifySearch).toHaveBeenCalledExactlyOnceWith(location.search)
      }
    },
  )

  test.each([false, true])(
    'keeps inherited search and hash through basepath and public output rewrite (configured=%s)',
    (configuredMask) => {
      const { router, mask } = setup(configuredMask)
      router.update({
        origin: 'https://internal.example',
        basepath: '/app',
        rewrite: {
          output: ({ url }) => {
            if (url.pathname === '/en/items/42') {
              const rewritten = new URL(url)
              rewritten.hostname = 'public.example'
              rewritten.pathname = '/localized/42'
              return rewritten
            }
            return url
          },
        },
      })
      const location = router.buildLocation({
        to: '/items/$id',
        params: { id: '42' },
        search: { q: 'a+b %', page: 0 },
        hash: 'internal',
        ...(configuredMask ? {} : { mask }),
      })

      expect(location.maskedLocation?.search).toBe(location.search)
      expect(location.maskedLocation?.searchStr).toBe(location.searchStr)
      expect(location.maskedLocation?.publicHref).toBe(
        `https://public.example/app/localized/42${location.searchStr}#visible`,
      )
      const publicUrl = new URL(location.maskedLocation!.publicHref)
      expect(publicUrl.searchParams.get('q')).toBe('a+b %')
      expect(publicUrl.searchParams.get('page')).toBe('0')
      expect(publicUrl.hash).toBe('#visible')
      expect(location.maskedLocation?.external).toBe(true)
    },
  )

  test.each([false, true])(
    'inherits the resolved main search without processing it as mask search (configured=%s)',
    (configuredMask) => {
      const { router, mask, mainMiddleware, maskMiddleware, stringifySearch } =
        setup(configuredMask)
      const location = router.buildLocation({
        to: '/items/$id',
        params: { id: '42' },
        search: { q: 'a b', page: 2 },
        hash: 'internal',
        ...(configuredMask ? {} : { mask }),
      })

      expect(location.search).toEqual({ q: 'a b', page: 2, resolved: 'main' })
      expect(location.maskedLocation?.pathname).toBe('/en/items/42')
      expect(location.maskedLocation?.hash).toBe('visible')
      expect(location.maskedLocation?.search).toBe(location.search)
      expect(location.maskedLocation?.searchStr).toBe(location.searchStr)
      expect(location.maskedLocation?.href).toBe(
        `/en/items/42${location.searchStr}#visible`,
      )
      expect(mainMiddleware).toHaveBeenCalledOnce()
      expect(maskMiddleware).not.toHaveBeenCalled()
      expect(stringifySearch).toHaveBeenCalledExactlyOnceWith(location.search)
    },
  )

  test('keeps ordinary mask search middleware and explicit search behavior', () => {
    const { router, maskMiddleware } = setup()
    const location = router.buildLocation({
      to: '/items/$id',
      params: { id: '42' },
      search: { page: 2 },
      mask: {
        to: '/en/items/$id',
        params: { id: '42' },
        search: { public: 'mask' },
      },
    })

    expect(location.search).toEqual({ page: 2, resolved: 'main' })
    expect(location.maskedLocation?.search).toEqual({
      public: 'mask',
      resolved: 'mask',
    })
    expect(maskMiddleware).toHaveBeenCalledOnce()
  })

  test('search true keeps its current-location meaning for ordinary masks', () => {
    const { router } = setup()
    const location = router.buildLocation({
      to: '/items/$id',
      params: { id: '42' },
      search: { page: 2 },
      mask: { to: '/en/items/$id', params: { id: '42' }, search: true },
    })

    expect(location.maskedLocation?.search).toEqual({
      initial: 'value',
      resolved: 'mask',
    })
  })

  test.each([false, true])(
    'rejects an untyped mask combining inheritSearch and search (configured=%s)',
    (configuredMask) => {
      const { router, mask } = setup(configuredMask, configuredMask)
      const conflictingMask: any = { ...mask, search: { unexpected: true } }
      expect(() =>
        router.buildLocation({
          to: '/items/$id',
          params: { id: '42' },
          search: { page: 2 },
          ...(configuredMask ? {} : { mask: conflictingMask }),
        }),
      ).toThrow('A route mask cannot combine inheritSearch with search')
    },
  )

  test.each([false, true])(
    'uses the inherited public mask for document navigation and preserves blockers (replace=%s)',
    async (replace) => {
      const { router, history, mask } = setup()
      const windowLocation = { href: '', replace: vi.fn() }
      vi.stubGlobal('window', { location: windowLocation })
      const blockerFn = vi.fn(() => true)
      const unblock = history.block({ blockerFn, enableBeforeUnload: false })
      const options = {
        to: '/items/$id',
        params: { id: '42' },
        search: { page: 2 },
        mask,
        reloadDocument: true,
        replace,
      }
      const publicHref = router.buildLocation(options).maskedLocation!.href
      try {
        await router.navigate(options)
        expect(blockerFn).toHaveBeenCalledOnce()
        expect(windowLocation.href).toBe('')
        expect(windowLocation.replace).not.toHaveBeenCalled()

        await router.navigate({ ...options, ignoreBlocker: true })
        expect(blockerFn).toHaveBeenCalledOnce()
        if (replace) {
          expect(windowLocation.replace).toHaveBeenCalledWith(publicHref)
        } else {
          expect(windowLocation.href).toBe(publicHref)
        }
        expect(publicHref).toContain('page=2')
        expect(publicHref).toContain('resolved=main')
        expect(history.location.href).toBe('/?initial=value')
      } finally {
        unblock()
        history.destroy()
      }
    },
  )
})
