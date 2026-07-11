import { afterEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { projectClientRouteAssets } from '../src/route-assets.client'
import { createTestRouter } from './routerTestUtils'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('client route asset aggregate result', () => {
  test.each(['sync throw', 'async rejection'] as const)(
    'keeps a %s failure after a later async head succeeds',
    async (failureMode) => {
      const failure = new Error('parent head failed')
      const childHeadGate = createControlledPromise<{
        meta: Array<{ title: string }>
      }>()
      const parentHead = vi.fn(() => {
        if (failureMode === 'sync throw') {
          throw failure
        }
        return Promise.reject(failure)
      })
      const childHead = vi.fn(() => childHeadGate)
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined)

      const rootRoute = new BaseRootRoute({})
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        head: parentHead,
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
        head: childHead,
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([
          parentRoute.addChildren([childRoute]),
        ]),
        history: createMemoryHistory({
          initialEntries: ['/parent/child'],
        }),
      })
      const matches = router.matchRoutes(router.stores.location.get())

      const projection = projectClientRouteAssets(router, matches)

      await vi.waitFor(() => expect(childHead).toHaveBeenCalledTimes(1))
      expect(parentHead).toHaveBeenCalledTimes(1)

      childHeadGate.resolve({ meta: [{ title: 'child assets' }] })

      await expect(projection).resolves.toBe(false)
      expect(
        matches.find((match) => match.routeId === childRoute.id)?.meta,
      ).toEqual([{ title: 'child assets' }])
      expect(consoleError).toHaveBeenCalledWith(
        `Error executing head for route ${parentRoute.id}:`,
        failure,
      )
    },
  )
})
