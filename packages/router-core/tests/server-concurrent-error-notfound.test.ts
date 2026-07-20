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

const concurrentModes = [
  ['parent-first', false],
  ['parent-first', true],
  ['child-first', false],
  ['child-first', true],
] as const

describe('concurrent route failure ordering', () => {
  test.each(concurrentModes)(
    'commits the first loader failure across the full matched branch (%s, isServer=%s)',
    async (settlementOrder, isServer) => {
      const parentError = new Error('parent loader failed')
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
          throw parentError
        },
        errorComponent: () => null,
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
        loader: async () => {
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
        isServer,
      })

      const responsePromise = isServer
        ? loadServerResponse(router, '/parent/child')
        : router.load().then(() => undefined)
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

      const childWon = settlementOrder === 'child-first'
      if (isServer) {
        expect(response?.status).toBe(childWon ? 404 : 500)
      }
      expect(settlements).toEqual(
        settlementOrder === 'parent-first'
          ? ['parent', 'child']
          : ['child', 'parent'],
      )
      expect(router.state.matches.map((match) => match.routeId)).toEqual([
        rootRoute.id,
        parentRoute.id,
        childRoute.id,
      ])
      expect(router.state.matches[childWon ? 2 : 1]).toMatchObject(
        childWon
          ? { status: 'notFound' }
          : { status: 'error', error: parentError },
      )
    },
  )

  test.each(concurrentModes)(
    'does not replace the first loader failure with a later one (%s, isServer=%s)',
    async (settlementOrder, isServer) => {
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
        isServer,
      })

      const responsePromise = isServer
        ? loadServerResponse(router, '/parent/child')
        : router.load().then(() => undefined)
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

      const childWon = settlementOrder === 'child-first'
      if (isServer) {
        expect(response?.status).toBe(childWon ? 500 : 404)
      }
      expect(settlements).toEqual(
        settlementOrder === 'parent-first'
          ? ['parent', 'child']
          : ['child', 'parent'],
      )
      expect(router.state.matches.map((match) => match.routeId)).toEqual([
        rootRoute.id,
        parentRoute.id,
        childRoute.id,
      ])
      expect(router.state.matches[childWon ? 2 : 1]).toMatchObject({
        status: childWon ? 'error' : 'notFound',
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

  test('a started descendant can redirect after its ancestor fails', async () => {
    const childStarted = createControlledPromise<void>()
    const childRedirect = createControlledPromise<void>()
    const parentError = new Error('parent failed')
    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      loader: async () => {
        await childStarted
        throw parentError
      },
      errorComponent: () => null,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      loader: async () => {
        childStarted.resolve()
        await childRedirect
        throw redirect({ to: '/target' })
      },
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        parentRoute.addChildren([childRoute]),
        targetRoute,
      ]),
      history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
      isServer: true,
    })

    const responsePromise = loadServerResponse(router, '/parent/child')
    await childStarted
    childRedirect.resolve()
    const response = await responsePromise

    expect(response.status).toBe(307)
    expect(response.headers.get('Location')).toBe('/target')
  })

  test('a redirect does not abort a later server generation on the same router', async () => {
    let generation = 0
    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      loader: () => {
        generation++
        if (generation === 2) {
          throw redirect({ to: '/target' })
        }
        return `data ${generation}`
      },
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([pageRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
      isServer: true,
    })

    expect((await loadServerResponse(router, '/page')).status).toBe(200)
    expect((await loadServerResponse(router, '/page')).status).toBe(307)
    expect((await loadServerResponse(router, '/page')).status).toBe(200)

    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: pageRoute.id,
      status: 'success',
      loaderData: 'data 3',
    })
  })

  test.each([false, true])(
    'an aborted child does not report its cancellation through onError (isServer=%s)',
    async (isServer) => {
      const childStarted = createControlledPromise<void>()
      const childLoader = createControlledPromise<never>()
      const cancellation = new Error('discarded request aborted')
      const childOnError = vi.fn()
      let childSignal: AbortSignal | undefined
      const rootRoute = new BaseRootRoute({})
      const sourceRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/source',
        loader: async () => {
          await childStarted
          throw redirect({ to: '/target' })
        },
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => sourceRoute,
        path: '/child',
        loader: ({ abortController }) => {
          childSignal = abortController.signal
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
      const targetRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/target',
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([
          sourceRoute.addChildren([childRoute]),
          targetRoute,
        ]),
        history: createMemoryHistory({ initialEntries: ['/source/child'] }),
        isServer,
      })

      const childCancellation = expect(childLoader).rejects.toBe(cancellation)
      const loadPromise = isServer
        ? loadServerResponse(router, '/source/child')
        : router.load().then(() => undefined)
      const [response] = await Promise.all([loadPromise, childCancellation])

      expect(childSignal?.aborted).toBe(true)
      expect(childOnError).not.toHaveBeenCalled()
      if (isServer) {
        expect(response?.status).toBe(307)
        expect(response?.headers.get('Location')).toBe('/target')
      } else {
        expect(router.state.location.pathname).toBe('/target')
        expect(router.state.matches.at(-1)).toMatchObject({
          routeId: targetRoute.id,
          status: 'success',
        })
      }
    },
  )
})
