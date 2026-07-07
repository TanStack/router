import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, notFound } from '../src'
import { createTestRouter } from './routerTestUtils'

/**
 * A notFound thrown from a route's ssr() option happens during the serial
 * phase, before beforeLoad has run for that route and its descendants. It
 * must cap the loader prefix like a beforeLoad notFound: the throwing route
 * and its descendants must not run their loaders (their context is
 * incomplete and their ssr status unresolved), and the response must be a
 * 404 — a descendant loader failure must not be able to turn the outcome
 * into a 200/500.
 */

function setupRouter(childLoader: () => unknown) {
  const loaderCalls: Array<string> = []

  const rootRoute = new BaseRootRoute({})
  const parentRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    notFoundComponent: () => null,
    ssr: () => {
      throw notFound()
    },
    loader: () => {
      loaderCalls.push('parent')
    },
  })
  const childRoute = new BaseRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    loader: () => {
      loaderCalls.push('child')
      return childLoader()
    },
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
    history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
    isServer: true,
  })

  return { router, parentRoute, loaderCalls }
}

describe('server serial ssr() notFound', () => {
  test('caps the loader prefix at the boundary and sets 404', async () => {
    const { router, parentRoute, loaderCalls } = setupRouter(() => 'child')

    await router.load()

    const parentMatch = router.state.matches.find(
      (item) => item.routeId === parentRoute.id,
    )
    expect(loaderCalls).toEqual([])
    expect(router.statusCode).toBe(404)
    expect(router.redirect).toBeUndefined()
    expect(parentMatch?.status).toBe('notFound')
    expect(parentMatch?.error).toEqual(
      expect.objectContaining({ isNotFound: true }),
    )
    // The lane is trimmed to the notFound boundary.
    expect(router.state.matches.at(-1)?.routeId).toBe(parentRoute.id)
  })

  test('a descendant loader that would reject fatally cannot displace the 404', async () => {
    const { router, loaderCalls } = setupRouter(() => {
      throw new Error('child loader failed')
    })

    await router.load()

    expect(loaderCalls).toEqual([])
    expect(router.statusCode).toBe(404)
  })
})
