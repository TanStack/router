import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createRequestHandler } from '../src/ssr/server'
import { createTestRouter, loadServerResponse } from './routerTestUtils'

describe('loader user-thrown abort values', () => {
  test.each(
    ([false, true] as const).flatMap((isServer) => [
      {
        isServer,
        thrownType: 'AbortSignal',
        createThrownValue: (signal: AbortSignal) => signal,
      },
      {
        isServer,
        thrownType: 'AbortError',
        createThrownValue: () =>
          new DOMException('The operation was aborted.', 'AbortError'),
      },
    ]),
  )(
    'treats a user-thrown $thrownType as an ordinary route error (isServer=$isServer)',
    async ({ isServer, createThrownValue }) => {
      let matchSignal: AbortSignal | undefined
      let thrownValue: unknown
      const rootRoute = new BaseRootRoute({})
      const abortingRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/aborting',
        loader: ({ abortController }) => {
          matchSignal = abortController.signal
          thrownValue = createThrownValue(matchSignal)
          throw thrownValue
        },
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([abortingRoute]),
        history: createMemoryHistory({ initialEntries: ['/aborting'] }),
        isServer,
      })

      if (isServer) {
        const response = await loadServerResponse(router, '/aborting')
        expect(response.status).toBe(500)
      } else {
        await router.load()
      }

      const match = router.state.matches.find(
        (item) => item.routeId === abortingRoute.id,
      )
      // A server match remains ordinary route failure during reduction, then
      // its controller is retired when the request response is cleaned up.
      expect(matchSignal?.aborted).toBe(isServer)
      expect(match?.status).toBe('error')
      expect(match?.error).toBe(thrownValue)
    },
  )

  test('request cancellation reaches the controller shared by route hooks', async () => {
    const loaderStarted = createControlledPromise<void>()
    const controllers: Array<AbortController> = []
    const onError = vi.fn()
    const rootRoute = new BaseRootRoute({})
    const route = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/work',
      context: ({ abortController }) => {
        controllers.push(abortController)
      },
      beforeLoad: ({ abortController }) => {
        controllers.push(abortController)
      },
      loader: ({ abortController }) => {
        controllers.push(abortController)
        loaderStarted.resolve()
        return new Promise((_, reject) => {
          abortController.signal.addEventListener(
            'abort',
            () => reject(abortController.signal.reason),
            { once: true },
          )
        })
      },
      onError,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([route]),
      history: createMemoryHistory({ initialEntries: ['/work'] }),
      isServer: true,
    })
    const requestController = new AbortController()
    const render = vi.fn(() => new Response('must not render'))
    const handler = createRequestHandler({
      createRouter: () => router,
      request: new Request('http://localhost/work', {
        signal: requestController.signal,
      }),
    })
    const response = handler(render)
    await loaderStarted

    const cancellation = new Error('request disconnected')
    requestController.abort(cancellation)

    await expect(response).rejects.toBe(cancellation)
    expect(controllers).toHaveLength(3)
    expect(
      controllers.every((controller) => controller === controllers[0]),
    ).toBe(true)
    expect(controllers[0]?.signal.aborted).toBe(true)
    expect(controllers[0]?.signal.reason).toBe(cancellation)
    expect(onError).not.toHaveBeenCalled()
    expect(render).not.toHaveBeenCalled()
  })

  test('response cleanup aborts the controller retained by deferred loader data', async () => {
    const deferred = createControlledPromise<string>()
    let loaderSignal: AbortSignal | undefined
    const rootRoute = new BaseRootRoute({})
    const route = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/work',
      loader: ({ abortController }) => {
        loaderSignal = abortController.signal
        return { deferred }
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([route]),
      history: createMemoryHistory({ initialEntries: ['/work'] }),
      isServer: true,
    })

    const response = await loadServerResponse(router, '/work')

    expect(response.status).toBe(200)
    expect(loaderSignal?.aborted).toBe(true)
    deferred.resolve('late data')
  })

  test('request cancellation thrown from route context does not call onError', async () => {
    const cancellation = new Error('request disconnected in context')
    const requestController = new AbortController()
    const beforeLoad = vi.fn()
    const loader = vi.fn()
    const onError = vi.fn()
    const rootRoute = new BaseRootRoute({})
    const route = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/work',
      context: ({ abortController }) => {
        requestController.abort(cancellation)
        abortController.signal.throwIfAborted()
      },
      beforeLoad,
      loader,
      onError,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([route]),
      history: createMemoryHistory({ initialEntries: ['/work'] }),
      isServer: true,
    })
    const render = vi.fn(() => new Response('must not render'))
    const handler = createRequestHandler({
      createRouter: () => router,
      request: new Request('http://localhost/work', {
        signal: requestController.signal,
      }),
    })

    await expect(handler(render)).rejects.toBe(cancellation)

    expect(onError).not.toHaveBeenCalled()
    expect(beforeLoad).not.toHaveBeenCalled()
    expect(loader).not.toHaveBeenCalled()
    expect(render).not.toHaveBeenCalled()
  })

  test('request cancellation during beforeLoad does not start loaders', async () => {
    const beforeLoadStarted = createControlledPromise<void>()
    const loader = vi.fn()
    const rootRoute = new BaseRootRoute({})
    const route = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/work',
      beforeLoad: ({ abortController }) => {
        beforeLoadStarted.resolve()
        return new Promise<void>((resolve) => {
          abortController.signal.addEventListener('abort', () => resolve(), {
            once: true,
          })
        })
      },
      loader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([route]),
      history: createMemoryHistory({ initialEntries: ['/work'] }),
      isServer: true,
    })
    const requestController = new AbortController()
    const handler = createRequestHandler({
      createRouter: () => router,
      request: new Request('http://localhost/work', {
        signal: requestController.signal,
      }),
    })
    const response = handler(() => new Response('must not render'))
    await beforeLoadStarted

    const cancellation = new Error('request disconnected')
    requestController.abort(cancellation)

    await expect(response).rejects.toBe(cancellation)
    expect(loader).not.toHaveBeenCalled()
  })

  test('request cancellation does not wait for manifest lookup', async () => {
    const manifestStarted = createControlledPromise<void>()
    const manifest = createControlledPromise<never>()
    const rootRoute = new BaseRootRoute({})
    const loader = vi.fn()
    const route = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/work',
      loader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([route]),
      history: createMemoryHistory({ initialEntries: ['/work'] }),
      isServer: true,
    })
    const requestController = new AbortController()
    const render = vi.fn(() => new Response('must not render'))
    const handler = createRequestHandler({
      createRouter: () => router,
      request: new Request('http://localhost/work', {
        signal: requestController.signal,
      }),
      getRouterManifest: () => {
        manifestStarted.resolve()
        return manifest
      },
    })

    const response = handler(render)
    await manifestStarted
    const cancellation = new Error('request disconnected')
    requestController.abort(cancellation)

    await expect(response).rejects.toBe(cancellation)
    expect(loader).not.toHaveBeenCalled()
    expect(render).not.toHaveBeenCalled()
  })

  test('request cancellation does not wait for custom dehydration', async () => {
    const dehydrateStarted = createControlledPromise<void>()
    const dehydrate = createControlledPromise<never>()
    const rootRoute = new BaseRootRoute({})
    const router = createTestRouter({
      routeTree: rootRoute,
      history: createMemoryHistory({ initialEntries: ['/'] }),
      isServer: true,
      dehydrate: () => {
        dehydrateStarted.resolve()
        return dehydrate
      },
    })
    const requestController = new AbortController()
    const render = vi.fn(() => new Response('must not render'))
    const handler = createRequestHandler({
      createRouter: () => router,
      request: new Request('http://localhost/', {
        signal: requestController.signal,
      }),
    })

    const response = handler(render)
    await dehydrateStarted
    const cancellation = new Error('request disconnected')
    requestController.abort(cancellation)

    await expect(response).rejects.toBe(cancellation)
    expect(render).not.toHaveBeenCalled()
  })
})
