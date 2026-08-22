import { createMemoryHistory } from '@tanstack/history'
import { describe, expect, test, vi } from 'vitest'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter, loadServerResponse } from './routerTestUtils'

describe.each([false, true])(
  'route asset projection (server: %s)',
  (isServer) => {
    test('starts child assets before parent assets settle', async () => {
      const parentStarted = createControlledPromise<void>()
      const parentHead = createControlledPromise<{
        meta: Array<{ title: string }>
      }>()
      const parentScripts =
        createControlledPromise<Array<{ children: string }>>()
      const childHead = vi.fn(() => ({
        meta: [{ title: 'child' }],
      }))
      const childScripts = vi.fn(() => [{ children: 'window.child = true' }])

      const rootRoute = new BaseRootRoute({})
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        head: () => {
          parentStarted.resolve()
          return parentHead
        },
        scripts: () => parentScripts,
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
        head: childHead,
        scripts: childScripts,
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([
          parentRoute.addChildren([childRoute]),
        ]),
        history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
        isServer,
      })

      const loading = isServer
        ? loadServerResponse(router, '/parent/child')
        : router.load()
      try {
        await parentStarted

        expect(parentScripts.status).toBe('pending')
        expect(childHead).toHaveBeenCalledTimes(1)
        expect(childScripts).toHaveBeenCalledTimes(1)
      } finally {
        parentHead.resolve({ meta: [{ title: 'parent' }] })
        parentScripts.resolve([{ children: 'window.parent = true' }])
        await loading
      }

      expect(router.state.matches.at(-1)).toMatchObject({
        meta: [{ title: 'child' }],
        scripts: [{ children: 'window.child = true' }],
      })
    })
  },
)
