import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  BaseRoute,
  createControlledPromise,
  notFound,
  redirect,
} from '../src'
import { createTestRouter } from './routerTestUtils'

describe('server concurrent route failure ordering', () => {
  test.each(['parent-first', 'child-first'] as const)(
    'a shallow regular error wins over a deeper notFound (%s)',
    async (settleOrder) => {
      const parentGate = createControlledPromise<void>()
      const childGate = createControlledPromise<void>()
      const parentError = new Error('parent loader failed')
      let parentSignal: AbortSignal | undefined
      let childSignal: AbortSignal | undefined

      const rootRoute = new BaseRootRoute({})
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        loader: async ({ abortController }) => {
          parentSignal = abortController.signal
          await parentGate
          throw parentError
        },
        errorComponent: () => null,
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
        loader: async ({ abortController }) => {
          childSignal = abortController.signal
          await childGate
          throw notFound()
        },
        notFoundComponent: () => null,
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([
          parentRoute.addChildren([childRoute]),
        ]),
        history: createMemoryHistory({
          initialEntries: ['/parent/child'],
        }),
        isServer: true,
      })

      const load = router.load()
      if (settleOrder === 'parent-first') {
        parentGate.resolve()
        await Promise.resolve()
        childGate.resolve()
      } else {
        childGate.resolve()
        await Promise.resolve()
        parentGate.resolve()
      }
      await load

      expect(router.statusCode).toBe(500)
      expect(router.stores.matches.get().map((match) => match.routeId)).toEqual(
        [rootRoute.id, parentRoute.id],
      )
      expect(router.stores.matches.get()[1]).toMatchObject({
        status: 'error',
        error: parentError,
      })
      expect(parentSignal?.aborted).toBe(false)
      expect(childSignal?.aborted).toBe(true)
    },
  )

  test.each(['parent-first', 'child-first'] as const)(
    'a shallower notFound boundary wins over a deeper regular error (%s)',
    async (settleOrder) => {
      const parentGate = createControlledPromise<void>()
      const childGate = createControlledPromise<void>()

      const rootRoute = new BaseRootRoute({})
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        loader: async () => {
          await parentGate
          throw notFound()
        },
        notFoundComponent: () => null,
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
        loader: async () => {
          await childGate
          throw new Error('child loader failed')
        },
        errorComponent: () => null,
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([
          parentRoute.addChildren([childRoute]),
        ]),
        history: createMemoryHistory({
          initialEntries: ['/parent/child'],
        }),
        isServer: true,
      })

      const load = router.load()
      if (settleOrder === 'parent-first') {
        parentGate.resolve()
        await Promise.resolve()
        childGate.resolve()
      } else {
        childGate.resolve()
        await Promise.resolve()
        parentGate.resolve()
      }
      await load

      expect(router.statusCode).toBe(404)
      expect(router.stores.matches.get().map((match) => match.routeId)).toEqual(
        [rootRoute.id, parentRoute.id],
      )
      expect(router.stores.matches.get()[1]).toMatchObject({
        status: 'notFound',
      })
    },
  )

  test('a redirect aborts every generation in its discarded server lane', async () => {
    const signals: Array<AbortSignal> = []
    const rootRoute = new BaseRootRoute({
      loader: ({ abortController }) => {
        signals.push(abortController.signal)
        return 'root data'
      },
    })
    const redirectRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/redirect',
      loader: ({ abortController }) => {
        signals.push(abortController.signal)
        throw redirect({ to: '/target' })
      },
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([redirectRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/redirect'] }),
      isServer: true,
    })

    await router.load()

    expect(router.redirect).toBeDefined()
    expect(signals).toHaveLength(2)
    expect(signals.every((signal) => signal.aborted)).toBe(true)
  })
})
