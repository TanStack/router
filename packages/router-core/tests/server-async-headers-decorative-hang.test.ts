import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter, loadServerResponse } from './routerTestUtils'

test('a rejected projection hook is logged without failing the response', async () => {
  const projectionError = new Error('scripts failed')
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const head = vi.fn(() => ({ meta: [{ title: 'discarded' }] }))
  const scripts = vi.fn(async () => {
    throw projectionError
  })
  const headers = vi.fn(() => ({ 'x-response-header': 'discarded' }))

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

  const response = await loadServerResponse(router, '/target')

  expect(response.status).toBe(200)
  expect(response.headers.get('x-response-header')).toBeNull()
  expect(head).toHaveBeenCalledTimes(1)
  expect(scripts).toHaveBeenCalledTimes(1)
  expect(headers).toHaveBeenCalledTimes(1)
  expect(log).toHaveBeenCalledWith(projectionError)
})
