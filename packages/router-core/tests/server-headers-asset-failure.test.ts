import { createMemoryHistory } from '@tanstack/history'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter, loadServerResponse } from './routerTestUtils'

/**
 * route headers are response behavior and should not be dropped just
 * because decorative server assets fail. Server route asset projection currently
 * commits head, scripts, and headers as one unit.
 *
 * This test uses a real server router load. The route's headers option succeeds
 * while head fails, and the loaded route match should still expose the header
 * that Start later merges into the HTTP response.
 */

const expectedHeaders = { 'x-route-header': 'kept' }

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function loadTargetRoute(options: { asyncHead: boolean }) {
  const rootRoute = new BaseRootRoute({})
  const targetRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/target',
    head: options.asyncHead
      ? async () => {
          throw new Error('head failed')
        }
      : () => {
          throw new Error('head failed')
        },
    headers: () => expectedHeaders,
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([targetRoute]),
    history: createMemoryHistory({ initialEntries: ['/target'] }),
    isServer: true,
  })

  return loadServerResponse(router, '/target')
}

describe('server asset projection route headers', () => {
  test('keeps route headers when head throws synchronously', async () => {
    const response = await loadTargetRoute({ asyncHead: false })
    expect(response.headers.get('x-route-header')).toBe('kept')
  })

  test('keeps route headers when head rejects asynchronously', async () => {
    const response = await loadTargetRoute({ asyncHead: true })
    expect(response.headers.get('x-route-header')).toBe('kept')
  })

  test('commits async head alongside async headers when scripts throws synchronously', async () => {
    const rootRoute = new BaseRootRoute({})
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      head: async () => ({ meta: [{ title: 'kept title' }] }),
      scripts: () => {
        throw new Error('scripts failed')
      },
      headers: async () => expectedHeaders,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/target'] }),
      isServer: true,
    })

    const response = await loadServerResponse(router, '/target')

    const targetMatch = router.state.matches.find(
      (match) => match.routeId === targetRoute.id,
    )
    // The response waits on async headers regardless, so the pending head
    // must be committed rather than abandoned.
    expect(response.headers.get('x-route-header')).toBe('kept')
    expect(targetMatch!.meta).toEqual([{ title: 'kept title' }])
  })

  test('awaits async route headers when head throws synchronously', async () => {
    const rootRoute = new BaseRootRoute({})
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      head: () => {
        throw new Error('head failed')
      },
      headers: async () => expectedHeaders,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/target'] }),
      isServer: true,
    })

    const response = await loadServerResponse(router, '/target')
    expect(response.headers.get('x-route-header')).toBe('kept')
  })
})
