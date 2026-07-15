import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  BaseRoute,
  createControlledPromise,
  notFound,
  redirect,
} from '../src'
import { createTestRouter, loadServerResponse } from './routerTestUtils'

describe('server concurrent route failure ordering', () => {
  test.each(['parent-first', 'child-first'] as const)(
    'commits the first route-order loader failure and aborts its descendants (%s)',
    async (settlementOrder) => {
      const parentError = new Error('parent loader failed')
      const parentGate = createControlledPromise<void>()
      const childGate = createControlledPromise<void>()
      const parentStarted = createControlledPromise<void>()
      const childStarted = createControlledPromise<void>()
      const parentSettled = createControlledPromise<void>()
      const childSettled = createControlledPromise<void>()
      const settlements: Array<string> = []
      let parentSignal: AbortSignal | undefined
      let childSignal: AbortSignal | undefined

      const rootRoute = new BaseRootRoute({})
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        loader: async ({ abortController }) => {
          parentSignal = abortController.signal
          parentStarted.resolve()
          await parentGate
          settlements.push('parent')
          parentSettled.resolve()
          throw parentError
        },
        errorComponent: () => null,
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
        loader: async ({ abortController }) => {
          childSignal = abortController.signal
          childStarted.resolve()
          await childGate
          settlements.push('child')
          childSettled.resolve()
          throw notFound()
        },
        notFoundComponent: () => null,
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([
          parentRoute.addChildren([childRoute]),
        ]),
        history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
        isServer: true,
      })

      const responsePromise = loadServerResponse(router, '/parent/child')
      await Promise.all([parentStarted, childStarted])
      if (settlementOrder === 'parent-first') {
        parentGate.resolve()
        await parentSettled
        childGate.resolve()
        await childSettled
      } else {
        childGate.resolve()
        await childSettled
        parentGate.resolve()
        await parentSettled
      }
      const response = await responsePromise

      expect(response.status).toBe(500)
      expect(settlements).toEqual(
        settlementOrder === 'parent-first'
          ? ['parent', 'child']
          : ['child', 'parent'],
      )
      expect(router.state.matches.map((match) => match.routeId)).toEqual([
        rootRoute.id,
        parentRoute.id,
      ])
      expect(router.state.matches[1]).toMatchObject({
        status: 'error',
        error: parentError,
      })
      expect(parentSignal?.aborted).toBe(false)
      expect(childSignal?.aborted).toBe(true)
    },
  )

  test.each(['parent-first', 'child-first'] as const)(
    'does not replace an earlier route-order loader notFound with a later error (%s)',
    async (settlementOrder) => {
      const parentGate = createControlledPromise<void>()
      const childGate = createControlledPromise<void>()
      const parentStarted = createControlledPromise<void>()
      const childStarted = createControlledPromise<void>()
      const parentSettled = createControlledPromise<void>()
      const childSettled = createControlledPromise<void>()
      const settlements: Array<string> = []
      const rootRoute = new BaseRootRoute({})
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        loader: async () => {
          parentStarted.resolve()
          await parentGate
          settlements.push('parent')
          parentSettled.resolve()
          throw notFound()
        },
        notFoundComponent: () => null,
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
        loader: async () => {
          childStarted.resolve()
          await childGate
          settlements.push('child')
          childSettled.resolve()
          throw new Error('child loader failed')
        },
        errorComponent: () => null,
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([
          parentRoute.addChildren([childRoute]),
        ]),
        history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
        isServer: true,
      })

      const responsePromise = loadServerResponse(router, '/parent/child')
      await Promise.all([parentStarted, childStarted])
      if (settlementOrder === 'parent-first') {
        parentGate.resolve()
        await parentSettled
        childGate.resolve()
        await childSettled
      } else {
        childGate.resolve()
        await childSettled
        parentGate.resolve()
        await parentSettled
      }
      const response = await responsePromise

      expect(response.status).toBe(404)
      expect(settlements).toEqual(
        settlementOrder === 'parent-first'
          ? ['parent', 'child']
          : ['child', 'parent'],
      )
      expect(router.state.matches.map((match) => match.routeId)).toEqual([
        rootRoute.id,
        parentRoute.id,
      ])
      expect(router.state.matches[1]).toMatchObject({
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

    const response = await loadServerResponse(router, '/redirect')

    expect(response.status).toBe(307)
    expect(response.headers.get('Location')).toBe('/target')
    expect(signals).toHaveLength(2)
    expect(signals.every((signal) => signal.aborted)).toBe(true)
  })

  test('an aborted child does not report its cancellation through onError', async () => {
    const childStarted = createControlledPromise<void>()
    const childLoader = createControlledPromise<never>()
    const cancellation = new Error('discarded request aborted')
    const childOnError = vi.fn()
    const rootRoute = new BaseRootRoute({
      loader: async () => {
        await childStarted
        throw redirect({ href: '/target' })
      },
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/child',
      loader: ({ abortController }) => {
        abortController.signal.addEventListener(
          'abort',
          () => childLoader.reject(cancellation),
          { once: true },
        )
        childStarted.resolve()
        return childLoader
      },
      onError: childOnError,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([childRoute]),
      history: createMemoryHistory({ initialEntries: ['/child'] }),
      isServer: true,
    })

    const response = await loadServerResponse(router, '/child')
    await expect(childLoader).rejects.toBe(cancellation)

    expect(response.status).toBe(307)
    expect(childOnError).not.toHaveBeenCalled()
  })
})
