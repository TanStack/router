import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter, loadServerResponse } from './routerTestUtils'

/**
 * Headers affect the HTTP response, so server loading must await them even
 * after another asset hook fails synchronously. That does not make an
 * unrelated decorative head promise response-significant: once headers have
 * settled, a never-ending head must not hold the response open.
 */
describe('server async headers after a decorative asset failure', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  test('commits async headers without waiting for a pending head', async () => {
    const expectedHeaders = { 'x-response-header': 'kept' }
    const headGate = createControlledPromise<{
      meta: Array<{ title: string }>
    }>()
    const headersGate = createControlledPromise<typeof expectedHeaders>()
    const head = vi.fn(() => headGate)
    const scripts = vi.fn(() => {
      throw new Error('scripts failed synchronously')
    })
    const headers = vi.fn(() => headersGate)

    const rootRoute = new BaseRootRoute({})
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      head,
      scripts,
      headers,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/target'] }),
      isServer: true,
    })

    const loadPromise = loadServerResponse(router, '/target')
    await vi.waitFor(() => {
      expect(head).toHaveBeenCalledTimes(1)
      expect(scripts).toHaveBeenCalledTimes(1)
      expect(headers).toHaveBeenCalledTimes(1)
    })

    headersGate.resolve(expectedHeaders)

    const winnerPromise = Promise.race([
      loadPromise.then(() => 'loaded' as const),
      new Promise<'timed-out'>((resolve) => {
        setTimeout(() => resolve('timed-out'), 50)
      }),
    ])
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(50)
    const winner = await winnerPromise

    // Cleanup happens only after recording the bounded result. On the broken
    // path this releases router.load(), but cannot change `winner`.
    headGate.resolve({ meta: [{ title: 'late decorative title' }] })
    await loadPromise

    const response = await loadPromise
    expect({
      winner,
      header: response.headers.get('x-response-header'),
    }).toEqual({
      winner: 'loaded',
      header: 'kept',
    })
  })
})
