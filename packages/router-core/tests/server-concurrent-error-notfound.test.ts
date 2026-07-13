import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, notFound, redirect } from '../src'
import { createTestRouter, loadServerResponse } from './routerTestUtils'

describe('server concurrent route failure ordering', () => {
  test('commits the first failing route loader and aborts its descendants', async () => {
    const parentError = new Error('parent loader failed')
    let parentSignal: AbortSignal | undefined
    let childSignal: AbortSignal | undefined

    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      loader: ({ abortController }) => {
        parentSignal = abortController.signal
        throw parentError
      },
      errorComponent: () => null,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      loader: ({ abortController }) => {
        childSignal = abortController.signal
        throw notFound()
      },
      notFoundComponent: () => null,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
      isServer: true,
    })

    const response = await loadServerResponse(router, '/parent/child')

    expect(response.status).toBe(500)
    expect(router.stores.matches.get().map((match) => match.routeId)).toEqual([
      rootRoute.id,
      parentRoute.id,
    ])
    expect(router.stores.matches.get()[1]).toMatchObject({
      status: 'error',
      error: parentError,
    })
    expect(parentSignal?.aborted).toBe(false)
    expect(childSignal?.aborted).toBe(true)
  })

  test('does not replace an earlier loader notFound with a later error', async () => {
    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      loader: () => {
        throw notFound()
      },
      notFoundComponent: () => null,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      loader: () => {
        throw new Error('child loader failed')
      },
      errorComponent: () => null,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
      isServer: true,
    })

    const response = await loadServerResponse(router, '/parent/child')

    expect(response.status).toBe(404)
    expect(router.stores.matches.get().map((match) => match.routeId)).toEqual([
      rootRoute.id,
      parentRoute.id,
    ])
    expect(router.stores.matches.get()[1]).toMatchObject({
      status: 'notFound',
    })
  })

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
})
