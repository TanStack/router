// @vitest-environment node

import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { createMiddleware } from '@tanstack/start-client-core'
import {
  BaseRootRoute,
  BaseRoute,
  RouterCore,
  redirect,
  type AnyRouter,
} from '@tanstack/router-core'
import {
  createNonReactiveMutableStore,
  createNonReactiveReadonlyStore,
} from '@tanstack/router-core'
import {
  attachRouterServerSsrUtils,
  createSsrStreamResponse,
} from '@tanstack/router-core/ssr/server'
import { createStartHandler } from '../src/createStartHandler'
import {
  getStaticHandlerInlineCssDefault,
  resolveInlineCssForRequest,
} from '../src/inlineCss'

const startMocks = vi.hoisted(() => {
  const previousServerFnBase = process.env.TSS_SERVER_FN_BASE
  process.env.TSS_SERVER_FN_BASE = '/_serverFn/'
  return {
    previousServerFnBase,
    requestMiddleware: [] as Array<any>,
    serverFnResult: undefined as undefined | Response | object,
    router: undefined as undefined | AnyRouter,
  }
})

vi.mock('#tanstack-start-entry', () => ({
  startInstance: {
    getOptions: () => ({
      requestMiddleware: startMocks.requestMiddleware,
      serializationAdapters: [],
    }),
  },
}))

vi.mock('#tanstack-router-entry', () => ({
  getRouter: () => startMocks.router,
}))

vi.mock('../src/server-functions-handler', () => ({
  handleServerAction: () => startMocks.serverFnResult,
}))

const getStoreConfig = () => ({
  createMutableStore: createNonReactiveMutableStore,
  createReadonlyStore: createNonReactiveReadonlyStore,
  batch: (fn: () => void) => fn(),
})

function makeRouter() {
  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null,
  })
  const router = new RouterCore(
    {
      history: createMemoryHistory({ initialEntries: ['/'] }),
      routeTree: rootRoute.addChildren([indexRoute]),
    },
    getStoreConfig,
  )
  router.isServer = true
  return router
}

function makeRouterWithRouteWork(routeWork: {
  beforeLoad?: (ctx: { abortController: AbortController }) => unknown
  loader?: (ctx: { abortController: AbortController }) => unknown
}) {
  const rootRoute = new BaseRootRoute({})
  const workRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/work',
    component: () => null,
    ...routeWork,
  })
  const router = new RouterCore(
    {
      history: createMemoryHistory({ initialEntries: ['/work'] }),
      routeTree: rootRoute.addChildren([workRoute]),
    },
    getStoreConfig,
  )
  router.isServer = true
  return router
}

function waitForAbortOrRelease(signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const release = () => {
      signal.removeEventListener('abort', release)
      resolve()
    }
    signal.addEventListener('abort', release, { once: true })
  })
}

function makeStreamResponse(
  router: ReturnType<typeof makeRouter>,
  onCancel?: (reason: unknown) => void,
) {
  attachRouterServerSsrUtils({ router: router as any, manifest: undefined })
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('stream'))
    },
    cancel(reason) {
      onCancel?.(reason)
      router.serverSsr?.cleanup()
    },
  })
  return createSsrStreamResponse(router as any, new Response(stream))
}

afterEach(() => {
  startMocks.requestMiddleware = []
  startMocks.serverFnResult = undefined
  startMocks.router = undefined
  vi.unstubAllEnvs()
})

afterAll(() => {
  if (startMocks.previousServerFnBase === undefined) {
    delete (process.env as Partial<NodeJS.ProcessEnv>).TSS_SERVER_FN_BASE
  } else {
    process.env.TSS_SERVER_FN_BASE = startMocks.previousServerFnBase
  }
})

describe('createStartHandler SSR cleanup ownership', () => {
  it('preserves serverFn stream cleanup ownership through early return', async () => {
    startMocks.requestMiddleware = []
    const router = makeRouter()
    startMocks.router = router
    const ssrResponse = makeStreamResponse(router)
    startMocks.serverFnResult = ssrResponse
    const dispose = vi.spyOn(ssrResponse as any, 'dispose')

    const handler = createStartHandler(() => new Response('unused'))
    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    expect(response).toBe(ssrResponse.response)
    expect(dispose).not.toHaveBeenCalled()
    expect(router.serverSsr).toBeDefined()

    await response.body!.cancel('done')
    expect(router.serverSsr).toBeUndefined()
  })

  it('disposes stream response replaced by middleware result', async () => {
    const router = makeRouter()
    startMocks.router = router
    const ssrResponse = makeStreamResponse(router)
    startMocks.serverFnResult = ssrResponse
    const dispose = vi.spyOn(ssrResponse as any, 'dispose')
    const replacement = new Response('replacement')
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        await next()
        return replacement
      }),
    ]

    const handler = createStartHandler(() => new Response('unused'))
    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    expect(await response.text()).toBe('replacement')
    expect(dispose).toHaveBeenCalledOnce()
    expect(router.serverSsr).toBeUndefined()
  })

  it('cancels a plain response body replaced by middleware', async () => {
    const router = makeRouter()
    startMocks.router = router
    const cancel = vi.fn()
    startMocks.serverFnResult = new Response(
      new ReadableStream({ cancel }),
    )
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        await next()
        return new Response('replacement')
      }),
    ]

    const handler = createStartHandler(() => new Response('unused'))
    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    expect(await response.text()).toBe('replacement')
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('does not await a replaced stream owner', async () => {
    const router = makeRouter()
    startMocks.router = router
    const dispose = vi.fn(() => new Promise<void>(() => {}))
    startMocks.serverFnResult = {
      response: new Response('stream'),
      serverSsrCleanup: 'stream',
      dispose,
    }
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        await next()
        return new Response('replacement')
      }),
    ]

    const handler = createStartHandler(() => new Response('unused'))
    const response = handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )
    const outcome = await Promise.race([
      Promise.resolve(response).then(() => 'settled'),
      new Promise<'pending'>((resolve) => {
        setTimeout(() => resolve('pending'), 20)
      }),
    ])

    expect(outcome).toBe('settled')
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('exposes Response to middleware while preserving stream ownership', async () => {
    startMocks.requestMiddleware = []
    const router = makeRouter()
    startMocks.router = router
    const ssrResponse = makeStreamResponse(router)
    startMocks.serverFnResult = ssrResponse
    const seenHeaders = [] as Array<Headers | undefined>
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        seenHeaders.push(result.response.headers)
        result.response.headers.set('x-test', 'true')
        return result
      }),
    ]

    const handler = createStartHandler(() => new Response('unused'))
    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    expect(response).toBe(ssrResponse.response)
    expect(seenHeaders).toEqual([ssrResponse.response.headers])
    expect(response.headers.get('x-test')).toBe('true')
    expect(router.serverSsr).toBeDefined()

    await response.body!.cancel('done')
    expect(router.serverSsr).toBeUndefined()
  })

  it('preserves stream ownership through return next', async () => {
    const router = makeRouter()
    startMocks.router = router
    const ssrResponse = makeStreamResponse(router)
    startMocks.serverFnResult = ssrResponse
    const dispose = vi.spyOn(ssrResponse as any, 'dispose')
    startMocks.requestMiddleware = [
      createMiddleware().server(({ next }) => {
        return next()
      }),
    ]

    const handler = createStartHandler(() => new Response('unused'))
    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    expect(response).toBe(ssrResponse.response)
    expect(dispose).not.toHaveBeenCalled()
    expect(router.serverSsr).toBeDefined()

    await response.body!.cancel('done')
    expect(router.serverSsr).toBeUndefined()
  })

  it('preserves stream ownership when middleware wraps same body', async () => {
    const router = makeRouter()
    startMocks.router = router
    const ssrResponse = makeStreamResponse(router)
    startMocks.serverFnResult = ssrResponse
    const dispose = vi.spyOn(ssrResponse as any, 'dispose')
    let wrappedResponse: Response | undefined
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        wrappedResponse = new Response(result.response.body, result.response)
        wrappedResponse.headers.set('x-wrapped', 'true')
        return wrappedResponse
      }),
    ]

    const handler = createStartHandler(() => new Response('unused'))
    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    expect(response).toBe(wrappedResponse)
    expect(response).not.toBe(ssrResponse.response)
    expect(response.headers.get('x-wrapped')).toBe('true')
    expect(dispose).not.toHaveBeenCalled()
    expect(router.serverSsr).toBeDefined()

    await response.body!.cancel('done')
    expect(router.serverSsr).toBeUndefined()
  })

  it.each(['pipeThrough', 'clone'] as const)(
    'preserves stream ownership when middleware returns a %s response',
    async (operation) => {
      const router = makeRouter()
      startMocks.router = router
      let release!: () => void
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      attachRouterServerSsrUtils({ router: router as any, manifest: undefined })
      const ssrResponse = createSsrStreamResponse(
        router as any,
        new Response(
          new ReadableStream({
            async pull(controller) {
              await gate
              controller.enqueue(new TextEncoder().encode('stream'))
              controller.close()
            },
          }),
        ),
      )
      const dispose = vi.spyOn(ssrResponse as any, 'dispose')
      startMocks.serverFnResult = ssrResponse
      startMocks.requestMiddleware = [
        createMiddleware().server(async ({ next }) => {
          const result = await next()
          return operation === 'clone'
            ? result.response.clone()
            : new Response(
                result.response.body!.pipeThrough(new TransformStream()),
                result.response,
              )
        }),
      ]

      const handler = createStartHandler(() => new Response('unused'))
      const response = await handler(
        new Request('http://localhost/_serverFn/test', {
          headers: { 'x-tsr-serverFn': 'true' },
        }),
        {},
      )
      release()

      expect(dispose).not.toHaveBeenCalled()
      await expect(response.text()).resolves.toBe('stream')
      expect(router.serverSsr).toBeUndefined()
    },
  )

  it.each(['pipeThrough', 'clone'] as const)(
    'request abort cancels a locked %s response and its SSR source',
    async (operation) => {
      const router = makeRouter()
      startMocks.router = router
      attachRouterServerSsrUtils({ router: router as any, manifest: undefined })
      const cleanup = router.serverSsr!.cleanup
      const cleanupSpy = vi.fn(() => cleanup())
      router.serverSsr!.cleanup = cleanupSpy
      const sourceCancel = vi.fn()
      startMocks.serverFnResult = createSsrStreamResponse(
        router as any,
        new Response(new ReadableStream({ cancel: sourceCancel })),
      )
      startMocks.requestMiddleware = [
        createMiddleware().server(async ({ next }) => {
          const result = await next()
          return operation === 'clone'
            ? result.response.clone()
            : new Response(
                result.response.body!.pipeThrough(new TransformStream()),
                result.response,
              )
        }),
      ]
      const requestController = new AbortController()
      const cancellation = new Error('request disconnected')
      const response = await createStartHandler(() =>
        new Response('unused'),
      )(
        new Request('http://localhost/_serverFn/test', {
          headers: { 'x-tsr-serverFn': 'true' },
          signal: requestController.signal,
        }),
        {},
      )
      const reader = response.body!.getReader()
      const read = reader.read()

      expect(response.body!.locked).toBe(true)
      requestController.abort(cancellation)

      try {
        await expect(read).rejects.toBe(cancellation)
        await vi.waitFor(() => expect(sourceCancel).toHaveBeenCalledOnce())
        expect(cleanupSpy).toHaveBeenCalledOnce()
        expect(router.serverSsr).toBeUndefined()
      } finally {
        reader.releaseLock()
      }
    },
  )

  it('cancels a replacement stream after middleware buffers the SSR response', async () => {
    const router = makeRouter()
    startMocks.router = router
    attachRouterServerSsrUtils({ router: router as any, manifest: undefined })
    startMocks.serverFnResult = createSsrStreamResponse(
      router as any,
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('stream'))
            controller.close()
          },
        }),
      ),
    )
    const requestController = new AbortController()
    const cancellation = new Error('request disconnected')
    const cancel = vi.fn()
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        await expect(result.response.text()).resolves.toBe('stream')
        return new Response(new ReadableStream({ cancel }))
      }),
    ]

    const response = await createStartHandler(() => new Response('unused'))(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
        signal: requestController.signal,
      }),
      {},
    )
    try {
      requestController.abort(cancellation)
      await vi.waitFor(() => {
        expect(cancel).toHaveBeenCalledOnce()
      })
    } finally {
      void response.body!.cancel('test cleanup').catch(() => {})
    }
  })

  it('does not report a cleanup error for a transformed plain response', async () => {
    const router = makeRouter()
    startMocks.router = router
    startMocks.serverFnResult = new Response('plain')
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        return new Response(
          result.response.body!.pipeThrough(new TransformStream()),
          result.response,
        )
      }),
    ]
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)

    try {
      const response = await createStartHandler(() => new Response('unused'))(
        new Request('http://localhost/_serverFn/test', {
          headers: { 'x-tsr-serverFn': 'true' },
        }),
        {},
      )

      await expect(response.text()).resolves.toBe('plain')
      expect(consoleError).not.toHaveBeenCalled()
    } finally {
      consoleError.mockRestore()
    }
  })

  it('retires a locked stream owner replaced by a bodyless response', async () => {
    const router = makeRouter()
    startMocks.router = router
    const cancel = vi.fn()
    attachRouterServerSsrUtils({ router: router as any, manifest: undefined })
    const ssrResponse = createSsrStreamResponse(
      router as any,
      new Response(new ReadableStream({ cancel })),
    )
    const dispose = vi.spyOn(ssrResponse as any, 'dispose')
    startMocks.serverFnResult = ssrResponse
    let lockedReader: ReadableStreamDefaultReader<Uint8Array> | undefined
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        lockedReader = result.response.body!.getReader()
        void lockedReader.closed.catch(() => {})
        return new Response(null, { status: 204 })
      }),
    ]

    try {
      const response = await createStartHandler(() => new Response('unused'))(
        new Request('http://localhost/_serverFn/test', {
          headers: { 'x-tsr-serverFn': 'true' },
        }),
        {},
      )

      expect(response.status).toBe(204)
      expect(response.body).toBeNull()
      expect(dispose).toHaveBeenCalledOnce()
      expect(cancel).toHaveBeenCalledOnce()
      expect(router.serverSsr).toBeUndefined()
    } finally {
      lockedReader?.releaseLock()
      if (router.serverSsr) {
        await ssrResponse.dispose('test cleanup')
      }
    }
  })

  it('disposes stream response on middleware error after next', async () => {
    const router = makeRouter()
    startMocks.router = router
    const ssrResponse = makeStreamResponse(router)
    startMocks.serverFnResult = ssrResponse
    const dispose = vi.spyOn(ssrResponse as any, 'dispose')
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        await next()
        throw new Error('middleware failed')
      }),
    ]

    const handler = createStartHandler(() => new Response('unused'))
    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    expect(response.status).toBe(500)
    expect(dispose).toHaveBeenCalledOnce()
    expect(router.serverSsr).toBeUndefined()
  })

  it('disposes stream response replaced by thrown response', async () => {
    const router = makeRouter()
    startMocks.router = router
    const ssrResponse = makeStreamResponse(router)
    startMocks.serverFnResult = ssrResponse
    const dispose = vi.spyOn(ssrResponse as any, 'dispose')
    const replacement = new Response('handled', { status: 418 })
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        await next()
        throw replacement
      }),
    ]

    const handler = createStartHandler(() => new Response('unused'))
    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    expect(response.status).toBe(418)
    expect(await response.text()).toBe('handled')
    expect(dispose).toHaveBeenCalledOnce()
    expect(router.serverSsr).toBeUndefined()
  })

  it('honors in-place response assignment on returned context', async () => {
    const router = makeRouter()
    startMocks.router = router
    const ssrResponse = makeStreamResponse(router)
    startMocks.serverFnResult = ssrResponse
    const dispose = vi.spyOn(ssrResponse as any, 'dispose')
    const replacement = new Response('replacement')
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        result.response = replacement
        return result
      }),
    ]

    const handler = createStartHandler(() => new Response('unused'))
    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    expect(await response.text()).toBe('replacement')
    expect(dispose).toHaveBeenCalledOnce()
    expect(router.serverSsr).toBeUndefined()
  })
})

describe('createStartHandler HEAD responses', () => {
  it('strips and cancels an application document body', async () => {
    const router = makeRouter()
    startMocks.router = router
    const cancel = vi.fn()
    const render = vi.fn(
      () =>
        new Response(new ReadableStream({ cancel }), {
          headers: { 'x-rendered': 'true' },
        }),
    )
    const handler = createStartHandler(render)

    const response = await handler(
      new Request('http://localhost/', { method: 'HEAD' }),
      {},
    )

    expect(render).toHaveBeenCalledOnce()
    expect(response.headers.get('x-rendered')).toBe('true')
    expect(response.body).toBeNull()
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('strips and cancels a body returned by an explicit HEAD handler', async () => {
    const rootRoute = new BaseRootRoute({})
    const cancel = vi.fn()
    const headHandler = vi.fn(
      () =>
        new Response(new ReadableStream({ cancel }), {
          status: 202,
          headers: { 'x-handler': 'HEAD' },
        }),
    )
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      server: { handlers: { HEAD: headHandler } },
    })
    const router = new RouterCore(
      {
        history: createMemoryHistory({ initialEntries: ['/target'] }),
        routeTree: rootRoute.addChildren([targetRoute]),
      },
      getStoreConfig,
    )
    router.isServer = true
    startMocks.router = router
    const render = vi.fn(() => new Response('must not render'))
    const handler = createStartHandler(render)

    const response = await handler(
      new Request('http://localhost/target', { method: 'HEAD' }),
      {},
    )

    expect(headHandler).toHaveBeenCalledOnce()
    expect(render).not.toHaveBeenCalled()
    expect(response.status).toBe(202)
    expect(response.headers.get('x-handler')).toBe('HEAD')
    expect(response.body).toBeNull()
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('resolves a redirect before stripping its HEAD body', async () => {
    const rootRoute = new BaseRootRoute({})
    const sourceRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/source',
      server: {
        handlers: {
          HEAD: () => redirect({ to: '/target' }),
        },
      },
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
    })
    const router = new RouterCore(
      {
        history: createMemoryHistory({ initialEntries: ['/source'] }),
        routeTree: rootRoute.addChildren([sourceRoute, targetRoute]),
      },
      getStoreConfig,
    )
    router.isServer = true
    startMocks.router = router

    const response = await createStartHandler(() =>
      new Response('must not render'),
    )(new Request('http://localhost/source', { method: 'HEAD' }), {})

    expect(response.status).toBe(307)
    expect(response.headers.get('Location')).toBe('/target')
    expect(response.body).toBeNull()
  })

  it('strips and cancels a body returned early by request middleware', async () => {
    const router = makeRouter()
    startMocks.router = router
    const cancel = vi.fn()
    startMocks.requestMiddleware = [
      createMiddleware().server(
        () =>
          new Response(new ReadableStream({ cancel }), {
            status: 202,
            headers: { 'x-middleware': 'true' },
          }),
      ),
    ]
    const render = vi.fn(() => new Response('must not render'))

    const response = await createStartHandler(render)(
      new Request('http://localhost/', { method: 'HEAD' }),
      {},
    )

    expect(render).not.toHaveBeenCalled()
    expect(response.status).toBe(202)
    expect(response.headers.get('x-middleware')).toBe('true')
    expect(response.body).toBeNull()
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('strips a server-function HEAD error body', async () => {
    const router = makeRouter()
    startMocks.router = router
    startMocks.serverFnResult = new Response('method not allowed', {
      status: 405,
      headers: { Allow: 'POST' },
    })

    const response = await createStartHandler(() =>
      new Response('must not render'),
    )(
      new Request('http://localhost/_serverFn/test', {
        method: 'HEAD',
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    expect(response.status).toBe(405)
    expect(response.headers.get('Allow')).toBe('POST')
    expect(response.body).toBeNull()
  })
})

describe('createStartHandler request cancellation', () => {
  it.each(['beforeLoad', 'loader'] as const)(
    'aborts route %s work and does not render HTML',
    async (hook) => {
      let routeSignal: AbortSignal | undefined
      let notifyStarted: (() => void) | undefined
      const started = new Promise<void>((resolve) => {
        notifyStarted = resolve
      })
      const routeWork = ({
        abortController,
      }: {
        abortController: AbortController
      }) => {
        routeSignal = abortController.signal
        notifyStarted?.()
        return waitForAbortOrRelease(abortController.signal)
      }
      const router = makeRouterWithRouteWork({ [hook]: routeWork })
      startMocks.router = router
      const requestController = new AbortController()
      const render = vi.fn(() => new Response('must not render'))
      const handler = createStartHandler(render)
      const response = handler(
        new Request('http://localhost/work', {
          signal: requestController.signal,
        }),
        {},
      )

      await started
      const cancellation = new Error('request disconnected')
      requestController.abort(cancellation)

      expect((await response).status).toBe(500)
      expect(routeSignal?.aborted).toBe(true)
      expect(routeSignal?.reason).toBe(cancellation)
      expect(render).not.toHaveBeenCalled()
    },
  )

  it('settles and cleans up while the render callback is still pending', async () => {
    const router = makeRouter()
    startMocks.router = router
    const requestController = new AbortController()
    let notifyRenderStarted!: () => void
    const renderStarted = new Promise<void>((resolve) => {
      notifyRenderStarted = resolve
    })
    let resolveRender!: (
      value: ReturnType<typeof createSsrStreamResponse>,
    ) => void
    const renderResult = new Promise<
      ReturnType<typeof createSsrStreamResponse>
    >((resolve) => {
      resolveRender = resolve
    })
    let cleanupCalls = 0
    let cancelCalls = 0
    let lateStreamResponse!: ReturnType<typeof createSsrStreamResponse>
    const handler = createStartHandler(({ router: requestRouter }) => {
      const serverSsr = requestRouter.serverSsr!
      const cleanup = serverSsr.cleanup
      serverSsr.cleanup = () => {
        cleanupCalls++
        cleanup()
      }
      lateStreamResponse = createSsrStreamResponse(
        requestRouter,
        new Response(
          new ReadableStream({
            cancel() {
              cancelCalls++
              return new Promise<void>(() => {})
            },
          }),
        ),
      )
      notifyRenderStarted()
      return renderResult
    })
    const response = handler(
      new Request('http://localhost/', {
        signal: requestController.signal,
      }),
      {},
    )

    await renderStarted
    requestController.abort(new Error('request disconnected'))

    expect((await response).status).toBe(500)
    expect(cleanupCalls).toBe(1)
    expect(router.serverSsr).toBeUndefined()

    resolveRender(lateStreamResponse)
    await vi.waitFor(() => expect(cancelCalls).toBe(1))
    expect(cleanupCalls).toBe(1)
    expect(router.serverSsr).toBeUndefined()
  })

  it('cancels a plain response resolved by the render callback later', async () => {
    const router = makeRouter()
    startMocks.router = router
    const requestController = new AbortController()
    let notifyRenderStarted!: () => void
    const renderStarted = new Promise<void>((resolve) => {
      notifyRenderStarted = resolve
    })
    let resolveRender!: (value: Response) => void
    const renderResult = new Promise<Response>((resolve) => {
      resolveRender = resolve
    })
    const cancel = vi.fn((_reason: unknown) => new Promise<void>(() => {}))
    const handler = createStartHandler(() => {
      notifyRenderStarted()
      return renderResult
    })
    const response = handler(
      new Request('http://localhost/', {
        signal: requestController.signal,
      }),
      {},
    )

    await renderStarted
    const cancellation = new Error('request disconnected')
    requestController.abort(cancellation)

    expect((await response).status).toBe(500)
    resolveRender(new Response(new ReadableStream({ cancel })))
    await vi.waitFor(() => {
      expect(cancel).toHaveBeenCalledTimes(1)
      expect(cancel).toHaveBeenCalledWith(cancellation)
    })
  })

  it('cancels a plain response resolved by request middleware later', async () => {
    const router = makeRouter()
    startMocks.router = router
    const requestController = new AbortController()
    let notifyMiddlewareStarted!: () => void
    const middlewareStarted = new Promise<void>((resolve) => {
      notifyMiddlewareStarted = resolve
    })
    let resolveMiddleware!: (value: Response) => void
    const middlewareResult = new Promise<Response>((resolve) => {
      resolveMiddleware = resolve
    })
    const cancel = vi.fn((_reason: unknown) => new Promise<void>(() => {}))
    startMocks.requestMiddleware = [
      createMiddleware().server(() => {
        notifyMiddlewareStarted()
        return middlewareResult
      }),
    ]
    const handler = createStartHandler(() => new Response('must not render'))
    const response = handler(
      new Request('http://localhost/', {
        signal: requestController.signal,
      }),
      {},
    )

    await middlewareStarted
    const cancellation = new Error('request disconnected')
    requestController.abort(cancellation)

    expect((await response).status).toBe(500)
    resolveMiddleware(new Response(new ReadableStream({ cancel })))
    await vi.waitFor(() => {
      expect(cancel).toHaveBeenCalledTimes(1)
      expect(cancel).toHaveBeenCalledWith(cancellation)
    })
  })

  it.each(['throw', 'reject'] as const)(
    'reports a %s from disposal of a late render response',
    async (failureMode) => {
      const router = makeRouter()
      startMocks.router = router
      const requestController = new AbortController()
      const cleanupError = new Error('late stream cleanup failed')
      const dispose = vi.fn(() => {
        if (failureMode === 'throw') {
          throw cleanupError
        }
        return Promise.reject(cleanupError)
      })
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined)
      let notifyRenderStarted!: () => void
      const renderStarted = new Promise<void>((resolve) => {
        notifyRenderStarted = resolve
      })
      let resolveRender!: (value: any) => void
      const renderResult = new Promise<any>((resolve) => {
        resolveRender = resolve
      })

      try {
        const handler = createStartHandler(() => {
          notifyRenderStarted()
          return renderResult
        })
        const response = handler(
          new Request('http://localhost/', {
            signal: requestController.signal,
          }),
          {},
        )

        await renderStarted
        requestController.abort(new Error('request disconnected'))
        expect((await response).status).toBe(500)

        resolveRender({
          response: new Response('stream'),
          serverSsrCleanup: 'stream',
          dispose,
        })
        await vi.waitFor(() => {
          expect(consoleError).toHaveBeenCalledWith(cleanupError)
        })
        expect(dispose).toHaveBeenCalledOnce()
      } finally {
        router.serverSsr?.cleanup()
        consoleError.mockRestore()
      }
    },
  )

  it.each(['throw', 'reject'] as const)(
    'reports a stream disposal %s when middleware is aborted',
    async (failureMode) => {
      const router = makeRouter()
      startMocks.router = router
      const requestController = new AbortController()
      const cleanupError = new Error('custom stream cleanup failed')
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined)
      const ssrResponse = makeStreamResponse(router)
      const dispose = vi.fn(() => {
        if (failureMode === 'throw') {
          throw cleanupError
        }
        return Promise.reject(cleanupError)
      })
      ;(ssrResponse as any).dispose = dispose
      startMocks.serverFnResult = ssrResponse
      let notifyMiddlewareStarted!: () => void
      const middlewareStarted = new Promise<void>((resolve) => {
        notifyMiddlewareStarted = resolve
      })
      startMocks.requestMiddleware = [
        createMiddleware().server(async ({ next }) => {
          await next()
          notifyMiddlewareStarted()
          return new Promise<Response>(() => {})
        }),
      ]

      try {
        const handler = createStartHandler(() => new Response('unused'))
        const response = handler(
          new Request('http://localhost/_serverFn/test', {
            headers: { 'x-tsr-serverFn': 'true' },
            signal: requestController.signal,
          }),
          {},
        )

        await middlewareStarted
        requestController.abort(new Error('request disconnected'))

        expect((await response).status).toBe(500)
        await vi.waitFor(() => {
          expect(consoleError).toHaveBeenCalledWith(cleanupError)
        })
        expect(dispose).toHaveBeenCalledOnce()
      } finally {
        router.serverSsr?.cleanup()
        consoleError.mockRestore()
      }
    },
  )

  it('cancels a locked tagged stream when the request aborts after handoff', async () => {
    const router = makeRouter()
    startMocks.router = router
    const requestController = new AbortController()
    const cancellation = new Error('request disconnected')
    const cancel = vi.fn(() => new Promise<void>(() => {}))
    const handler = createStartHandler(({ router: requestRouter }) =>
      createSsrStreamResponse(
        requestRouter,
        new Response(
          new ReadableStream({
            cancel,
          }),
        ),
      ),
    )

    const response = await handler(
      new Request('http://localhost/', {
        signal: requestController.signal,
      }),
      {},
    )
    const reader = response.body!.getReader()
    const read = expect(reader.read()).rejects.toBe(cancellation)
    expect(router.serverSsr).toBeDefined()

    requestController.abort(cancellation)

    try {
      await vi.waitFor(() => {
        expect(cancel).toHaveBeenCalledWith(cancellation)
      })
      await read
      expect(router.serverSsr).toBeUndefined()
    } finally {
      reader.releaseLock()
    }
  })

  it.each(['router', 'serverFn'] as const)(
    'cancels a locked plain %s response after handoff',
    async (handlerType) => {
      const router = makeRouter()
      startMocks.router = router
      const requestController = new AbortController()
      const cancellation = new Error('request disconnected')
      const cancel = vi.fn()
      const plainResponse = new Response(new ReadableStream({ cancel }))
      if (handlerType === 'serverFn') {
        startMocks.serverFnResult = plainResponse
      }
      const handler = createStartHandler(() => plainResponse)
      const response = await handler(
        new Request(
          handlerType === 'serverFn'
            ? 'http://localhost/_serverFn/test'
            : 'http://localhost/',
          {
            headers:
              handlerType === 'serverFn'
                ? { 'x-tsr-serverFn': 'true' }
                : undefined,
            signal: requestController.signal,
          },
        ),
        {},
      )
      const reader = response.body!.getReader()

      requestController.abort(cancellation)

      try {
        await vi.waitFor(() => {
          expect(cancel).toHaveBeenCalledWith(cancellation)
        })
        await expect(reader.read()).rejects.toBe(cancellation)
      } finally {
        reader.releaseLock()
      }
    },
  )

  it('settles when request middleware ignores cancellation', async () => {
    const router = makeRouter()
    startMocks.router = router
    const requestController = new AbortController()
    let notifyMiddlewareStarted!: () => void
    const middlewareStarted = new Promise<void>((resolve) => {
      notifyMiddlewareStarted = resolve
    })
    const dispose = vi.fn(() => Promise.resolve())
    let releaseMiddleware!: (response: any) => void
    const middlewareResult = new Promise<any>((resolve) => {
      releaseMiddleware = resolve
    })
    startMocks.requestMiddleware = [
      createMiddleware().server(() => {
        notifyMiddlewareStarted()
        return middlewareResult
      }),
    ]
    const render = vi.fn(() => new Response('must not render'))
    const handler = createStartHandler(render)
    const response = handler(
      new Request('http://localhost/', {
        signal: requestController.signal,
      }),
      {},
    )

    await middlewareStarted
    requestController.abort(new Error('request disconnected'))

    expect((await response).status).toBe(500)
    expect(render).not.toHaveBeenCalled()

    releaseMiddleware({
      response: new Response('late'),
      serverSsrCleanup: 'stream',
      dispose,
    })
    await vi.waitFor(() => expect(dispose).toHaveBeenCalledOnce())
    expect(render).not.toHaveBeenCalled()
  })

  it('unwinds nested middleware when an inner operation ignores cancellation', async () => {
    const router = makeRouter()
    startMocks.router = router
    const requestController = new AbortController()
    const outerFinally = vi.fn()
    let notifyInnerStarted!: () => void
    const innerStarted = new Promise<void>((resolve) => {
      notifyInnerStarted = resolve
    })
    const pending = new Promise<Response>(() => {})
    startMocks.requestMiddleware = [
      createMiddleware().server(({ next }) => next()),
      createMiddleware().server(async ({ next }) => {
        try {
          return await next()
        } finally {
          outerFinally()
        }
      }),
      createMiddleware().server(() => {
        notifyInnerStarted()
        return pending
      }),
    ]
    const render = vi.fn(() => new Response('must not render'))
    const handler = createStartHandler(render)
    const response = handler(
      new Request('http://localhost/', {
        signal: requestController.signal,
      }),
      {},
    )

    await innerStarted
    requestController.abort(new Error('request disconnected'))

    expect((await response).status).toBe(500)
    expect(outerFinally).toHaveBeenCalledOnce()
    expect(render).not.toHaveBeenCalled()
  })

  it('cancels an all-synchronous direct next chain', async () => {
    const router = makeRouter()
    startMocks.router = router
    const requestController = new AbortController()
    let notifyInnerStarted!: () => void
    const innerStarted = new Promise<void>((resolve) => {
      notifyInnerStarted = resolve
    })
    startMocks.requestMiddleware = [
      createMiddleware().server(({ next }) => next()),
      createMiddleware().server(({ next }) => next()),
      createMiddleware().server(() => {
        notifyInnerStarted()
        return new Promise<Response>(() => {})
      }),
    ]
    const render = vi.fn(() => new Response('must not render'))
    const handler = createStartHandler(render)
    const response = handler(
      new Request('http://localhost/', {
        signal: requestController.signal,
      }),
      {},
    )

    await innerStarted
    requestController.abort(new Error('request disconnected'))

    expect((await response).status).toBe(500)
    expect(render).not.toHaveBeenCalled()
  })

  it('preserves the abort reason when direct next rejects during abort', async () => {
    const router = makeRouter()
    startMocks.router = router
    const requestController = new AbortController()
    const reason = new Error('request disconnected')
    startMocks.requestMiddleware = [
      createMiddleware().server(({ next }) => next()),
      createMiddleware().server(() => {
        requestController.abort(reason)
        throw new Response('must not escape', { status: 418 })
      }),
    ]
    const render = vi.fn(() => new Response('must not render'))
    const handler = createStartHandler(render)

    const response = await handler(
      new Request('http://localhost/', {
        signal: requestController.signal,
      }),
      {},
    )

    expect(response.status).toBe(500)
    expect(render).not.toHaveBeenCalled()
  })

  it('preserves aborts that race with a fulfilled direct next promise', async () => {
    const router = makeRouter()
    startMocks.router = router
    const requestController = new AbortController()
    const reason = new Error('request disconnected')
    const observedErrors: Array<unknown> = []
    const afterNext = vi.fn()
    const cancel = vi.fn()
    const ssrResponse = makeStreamResponse(router, cancel)
    const dispose = vi.spyOn(ssrResponse as any, 'dispose')
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        try {
          const result = await next()
          afterNext()
          return result
        } catch (error) {
          observedErrors.push(error)
          throw error
        }
      }),
      createMiddleware().server(({ next }) => {
        const pending = next()
        void Promise.resolve(pending).then(() =>
          requestController.abort(reason),
        )
        return pending
      }),
    ]
    const render = vi.fn(() => ssrResponse)
    const handler = createStartHandler(render)

    const response = await handler(
      new Request('http://localhost/', {
        signal: requestController.signal,
      }),
      {},
    )

    expect(response.status).toBe(500)
    await vi.waitFor(() => expect(observedErrors).toEqual([reason]))
    await vi.waitFor(() => {
      expect(dispose).toHaveBeenCalledOnce()
      expect(dispose).toHaveBeenCalledWith(reason)
      expect(cancel).toHaveBeenCalledOnce()
      expect(cancel).toHaveBeenCalledWith(reason)
    })
    expect(afterNext).not.toHaveBeenCalled()
    expect(render).toHaveBeenCalledOnce()
  })

  it('ignores a late same-body alias after catch disposes its owner', async () => {
    const router = makeRouter()
    startMocks.router = router
    const requestController = new AbortController()
    const reason = new Error('request disconnected')
    let notifyResponseCaptured!: () => void
    const responseCaptured = new Promise<void>((resolve) => {
      notifyResponseCaptured = resolve
    })
    let releaseMiddleware!: () => void
    const middlewareRelease = new Promise<void>((resolve) => {
      releaseMiddleware = resolve
    })
    let notifyLateResultDelivered!: () => void
    const lateResultDelivered = new Promise<void>((resolve) => {
      notifyLateResultDelivered = resolve
    })
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        const wrapped = new Response(result.response.body, result.response)
        notifyResponseCaptured()
        await middlewareRelease
        queueMicrotask(() => {
          queueMicrotask(notifyLateResultDelivered)
        })
        return wrapped
      }),
    ]
    const cancel = vi.fn()
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('stream'))
        },
        cancel,
      }),
    )
    let ssrResponse!: ReturnType<typeof createSsrStreamResponse>
    const render = vi.fn(({ router: requestRouter }) => {
      ssrResponse = createSsrStreamResponse(requestRouter, response)
      return ssrResponse
    })
    const handler = createStartHandler(render)
    const result = handler(
      new Request('http://localhost/', {
        signal: requestController.signal,
      }),
      {},
    )

    await responseCaptured
    const dispose = vi.spyOn(ssrResponse as any, 'dispose')
    requestController.abort(reason)

    expect((await result).status).toBe(500)
    releaseMiddleware()
    await lateResultDelivered
    await vi.waitFor(() => {
      expect(dispose).toHaveBeenCalledOnce()
      expect(dispose).toHaveBeenCalledWith(reason)
      expect(cancel).toHaveBeenCalledOnce()
      expect(cancel).toHaveBeenCalledWith(reason)
    })
    expect(router.serverSsr).toBeUndefined()
  })
})

describe('createStartHandler inlineCss option', () => {
  const request = new Request('https://example.com/')

  it('defaults to true', async () => {
    await expect(
      resolveInlineCssForRequest({
        request,
        handlerInlineCss: undefined,
        requestInlineCss: undefined,
      }),
    ).resolves.toBe(true)
  })

  it('uses the handler-level boolean default', async () => {
    await expect(
      resolveInlineCssForRequest({
        request,
        handlerInlineCss: false,
        requestInlineCss: undefined,
      }),
    ).resolves.toBe(false)
  })

  it('uses the handler-level callback default', async () => {
    const handlerInlineCss = vi.fn(({ request: req }) => {
      return req.headers.get('x-inline-css') !== 'false'
    })
    const callbackRequest = new Request('https://example.com/', {
      headers: { 'x-inline-css': 'false' },
    })

    await expect(
      resolveInlineCssForRequest({
        request: callbackRequest,
        handlerInlineCss,
        requestInlineCss: undefined,
      }),
    ).resolves.toBe(false)
    expect(handlerInlineCss).toHaveBeenCalledWith({ request: callbackRequest })
  })

  it('lets request options override handler-level options', async () => {
    const handlerInlineCss = vi.fn(() => false)

    await expect(
      resolveInlineCssForRequest({
        request,
        handlerInlineCss,
        requestInlineCss: true,
      }),
    ).resolves.toBe(true)

    expect(handlerInlineCss).not.toHaveBeenCalled()
  })

  it('returns a static inline CSS default only for non-callback options', () => {
    expect(getStaticHandlerInlineCssDefault(undefined)).toBe(true)
    expect(getStaticHandlerInlineCssDefault(true)).toBe(true)
    expect(getStaticHandlerInlineCssDefault(false)).toBe(false)
    expect(getStaticHandlerInlineCssDefault(() => true)).toBe(undefined)
  })
})
