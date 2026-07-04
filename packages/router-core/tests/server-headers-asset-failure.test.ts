import { createMemoryHistory } from '@tanstack/history'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

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

  await router.load()

  return router.state.matches.find((match) => match.routeId === targetRoute.id)
}

describe('server asset projection route headers', () => {
  test('keeps route headers when head throws synchronously', async () => {
    const targetMatch = await loadTargetRoute({ asyncHead: false })
    expect(targetMatch).toBeDefined()
    expect(targetMatch!.headers).toEqual(expectedHeaders)
  })

  test('keeps route headers when head rejects asynchronously', async () => {
    const targetMatch = await loadTargetRoute({ asyncHead: true })
    expect(targetMatch).toBeDefined()
    expect(targetMatch!.headers).toEqual(expectedHeaders)
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

    await router.load()

    const targetMatch = router.state.matches.find(
      (match) => match.routeId === targetRoute.id,
    )
    expect(targetMatch!.headers).toEqual(expectedHeaders)
  })
})
