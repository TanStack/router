import { createMemoryHistory } from '@tanstack/history'
import { afterEach, describe, expect, expectTypeOf, test, vi } from 'vitest'
import { BaseRootRoute, BaseRoute } from '../src'
import { createRequestHandler } from '../src/ssr/createRequestHandler'
import {
  bindSsrResponseToRequest,
  createSsrStreamResponse,
  replaceSsrResponse,
  stripSsrResponseBody,
  type SsrResponse,
} from '../src/ssr/handlerCallback'
import { attachRouterServerSsrUtils } from '../src/ssr/ssr-server'
import { transformStreamWithRouter } from '../src/ssr/transformStreamWithRouter'
import { createTestRouter } from './routerTestUtils'

/**
 * CI-stable tests for the SSR cleanup contract. These do not rely on GC
 * timing; they exercise the observable behavior:
 *   - onCleanup listeners run exactly once
 *   - cleanup is reentrancy-safe (listener calling cleanup again is a no-op)
 *   - cleanup is idempotent (second cleanup() call is a no-op)
 */

function buildRouter(dehydratedData?: Record<string, any>) {
  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null,
  })
  return createTestRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    isServer: true,
    dehydrate: dehydratedData ? () => dehydratedData : undefined,
  })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('serverSsr.cleanup', () => {
  test('onCleanup listeners run exactly once', () => {
    const router = buildRouter()
    attachRouterServerSsrUtils({ router, manifest: undefined })

    let calls = 0
    router.serverSsr!.onCleanup(() => {
      calls++
    })

    router.serverSsr!.cleanup()
    // Second call: serverSsr is undefined now, must short-circuit safely.
    router.serverSsr?.cleanup()
    expect(calls).toBe(1)
  })

  test('listener that re-enters cleanup() does not re-fire siblings', () => {
    const router = buildRouter()
    attachRouterServerSsrUtils({ router, manifest: undefined })

    const order: Array<string> = []
    router.serverSsr!.onCleanup(() => {
      order.push('a')
      // Reentry: must be a no-op.
      router.serverSsr?.cleanup()
    })
    router.serverSsr!.onCleanup(() => {
      order.push('b')
    })

    router.serverSsr!.cleanup()
    expect(order).toEqual(['a', 'b'])
  })

  test('listener errors are swallowed and do not stop subsequent listeners', () => {
    const router = buildRouter()
    attachRouterServerSsrUtils({ router, manifest: undefined })

    const order: Array<string> = []
    router.serverSsr!.onCleanup(() => {
      order.push('a')
      throw new Error('boom')
    })
    router.serverSsr!.onCleanup(() => {
      order.push('b')
    })

    // Should not throw.
    router.serverSsr!.cleanup()
    expect(order).toEqual(['a', 'b'])
  })

  test('cleanup before pending serialization resolves drops late scripts safely', async () => {
    const value = deferred<string>()
    const router = buildRouter({ value: value.promise })
    attachRouterServerSsrUtils({ router, manifest: undefined })

    await router.load()
    await router.serverSsr!.dehydrate()
    router.serverSsr!.cleanup()

    value.resolve('done')
    await Promise.resolve()
    await Promise.resolve()

    expect(router.serverSsr).toBeUndefined()
  })

  test('serialization completion does not clear render-finished listeners', async () => {
    const value = deferred<string>()
    const router = buildRouter({ value: value.promise })
    attachRouterServerSsrUtils({ router, manifest: undefined })

    await router.load()
    await router.serverSsr!.dehydrate()

    let renderFinishedCalls = 0
    router.serverSsr!.onRenderFinished(() => {
      renderFinishedCalls++
    })

    const serializationDone = new Promise<void>((resolve) => {
      router.serverSsr!.onSerializationFinished(resolve)
    })

    value.resolve('done')
    await serializationDone

    expect(renderFinishedCalls).toBe(0)
    router.serverSsr!.setRenderFinished()
    expect(renderFinishedCalls).toBe(1)

    router.serverSsr?.cleanup()
  })

  test('render-finished listeners can synchronously finish serialization', async () => {
    const value = deferred<string>()
    const router = buildRouter({ value: value.promise })
    attachRouterServerSsrUtils({ router, manifest: undefined })

    await router.load()
    await router.serverSsr!.dehydrate()
    router.serverSsr!.takeBufferedScripts()

    router.serverSsr!.onRenderFinished(() => {
      value.resolve('done')
    })

    const serializationDone = new Promise<void>((resolve) => {
      router.serverSsr!.onSerializationFinished(resolve)
    })
    router.serverSsr!.setRenderFinished()
    await serializationDone

    expect(router.serverSsr!.takeBufferedHtml()).toContain('$_TSR.e()')

    router.serverSsr?.cleanup()
  })

  test('late serialization listener runs safely and returns unsubscribe', async () => {
    const router = buildRouter()
    attachRouterServerSsrUtils({ router, manifest: undefined })

    await router.load()
    await router.serverSsr!.dehydrate()

    let calls = 0
    const unsubscribe = router.serverSsr!.onSerializationFinished(() => {
      calls++
    })

    expect(calls).toBe(1)
    expect(() => unsubscribe()).not.toThrow()
    router.serverSsr?.cleanup()
  })

  test('stream fast path only reserves when no SSR work is pending', async () => {
    const router = buildRouter()
    attachRouterServerSsrUtils({ router, manifest: undefined })

    await router.load()
    await router.serverSsr!.dehydrate()
    const barrierScript = router.serverSsr!.takeBufferedScripts()
    expect(barrierScript).toBeDefined()

    router.serverSsr!.setRenderFinished()
    expect(router.serverSsr!.reserveStreamFastPath()).toBe(true)
    expect(router.serverSsr!.reserveStreamFastPath()).toBe(false)

    router.serverSsr?.cleanup()
  })

  test('stream fast path rejects while SSR work is pending', async () => {
    const value = deferred<string>()
    const router = buildRouter({ value: value.promise })
    attachRouterServerSsrUtils({ router, manifest: undefined })

    await router.load()
    await router.serverSsr!.dehydrate()

    expect(router.serverSsr!.reserveStreamFastPath()).toBe(false)
    const barrierScript = router.serverSsr!.takeBufferedScripts()
    expect(barrierScript).toBeDefined()
    expect(router.serverSsr!.reserveStreamFastPath()).toBe(false)

    const serializationDone = new Promise<void>((resolve) => {
      router.serverSsr!.onSerializationFinished(resolve)
    })
    value.resolve('done')
    await serializationDone

    expect(router.serverSsr!.reserveStreamFastPath()).toBe(false)
    router.serverSsr!.setRenderFinished()
    expect(router.serverSsr!.reserveStreamFastPath()).toBe(false)
    expect(router.serverSsr!.takeBufferedHtml()).toContain('<script')

    router.serverSsr?.cleanup()
  })

  test('throwing injected listener does not skip later listeners', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const router = buildRouter()
    try {
      attachRouterServerSsrUtils({ router, manifest: undefined })

      const calls: Array<string> = []
      router.serverSsr!.onInjectedHtml(() => {
        calls.push('a')
        throw new Error('boom')
      })
      router.serverSsr!.onInjectedHtml(() => {
        calls.push('b')
      })

      router.serverSsr!.injectHtml('<script>1</script>')

      expect(calls).toEqual(['a', 'b'])
    } finally {
      router.serverSsr?.cleanup()
      errorSpy.mockRestore()
    }
  })

  test('server SSR attach lifecycle runs listeners at attach time', () => {
    const router = buildRouter()
    const calls: Array<string> = []
    router.serverSsrLifecycle = {
      onServerSsrAttach: [
        (serverSsr) => {
          calls.push('attach')
          serverSsr.onCleanup(() => calls.push('cleanup'))
        },
      ],
    }

    attachRouterServerSsrUtils({ router, manifest: undefined })
    expect(calls).toEqual(['attach'])

    router.serverSsr!.cleanup()
    expect(calls).toEqual(['attach', 'cleanup'])
  })

  test('request handler cleans plain response body after drain', async () => {
    const router = buildRouter()
    let cleanupCalls = 0
    const handler = createRequestHandler({
      createRouter: () => router,
      request: new Request('http://localhost/'),
    })

    const response = await handler(({ router: requestRouter }) => {
      const serverSsr = requestRouter.serverSsr!
      const cleanup = serverSsr.cleanup
      serverSsr.cleanup = () => {
        cleanupCalls++
        cleanup()
      }
      return Promise.resolve(new Response('plain'))
    })

    expect(cleanupCalls).toBe(1)
    await response.text()
    expect(cleanupCalls).toBe(1)
    expect(router.serverSsr).toBeUndefined()
  })

  test('request handler cleans plain response body on cancel', async () => {
    const router = buildRouter()
    let cleanupCalls = 0
    const handler = createRequestHandler({
      createRouter: () => router,
      request: new Request('http://localhost/'),
    })

    const response = await handler(({ router: requestRouter }) => {
      const serverSsr = requestRouter.serverSsr!
      const cleanup = serverSsr.cleanup
      serverSsr.cleanup = () => {
        cleanupCalls++
        cleanup()
      }
      return Promise.resolve(
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('plain'))
            },
          }),
        ),
      )
    })

    expect(cleanupCalls).toBe(1)
    await response.body!.cancel('done')
    expect(cleanupCalls).toBe(1)
    expect(router.serverSsr).toBeUndefined()
  })

  test('request handler cleans bodyless response immediately', async () => {
    const router = buildRouter()
    let cleanupCalls = 0
    const handler = createRequestHandler({
      createRouter: () => router,
      request: new Request('http://localhost/'),
    })

    await handler(({ router: requestRouter }) => {
      const serverSsr = requestRouter.serverSsr!
      const cleanup = serverSsr.cleanup
      serverSsr.cleanup = () => {
        cleanupCalls++
        cleanup()
      }
      return Promise.resolve(new Response(null, { status: 204 }))
    })

    expect(cleanupCalls).toBe(1)
    expect(router.serverSsr).toBeUndefined()
  })

  test('request abort settles while the render callback is still pending', async () => {
    const router = buildRouter()
    const requestController = new AbortController()
    const renderStarted = deferred<void>()
    const renderResult = deferred<ReturnType<typeof createSsrStreamResponse>>()
    let cleanupCalls = 0
    let cancelCalls = 0
    let lateStreamResponse!: ReturnType<typeof createSsrStreamResponse>
    const handler = createRequestHandler({
      createRouter: () => router,
      request: new Request('http://localhost/', {
        signal: requestController.signal,
      }),
    })

    const response = handler(({ router: requestRouter }) => {
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
      renderStarted.resolve()
      return renderResult.promise
    })

    await renderStarted.promise
    const cancellation = new Error('request disconnected')
    requestController.abort(cancellation)

    await expect(response).rejects.toBe(cancellation)
    expect(cleanupCalls).toBe(1)
    expect(router.serverSsr).toBeUndefined()

    renderResult.resolve(lateStreamResponse)
    await vi.waitFor(() => expect(cancelCalls).toBe(1))
    expect(cleanupCalls).toBe(1)
    expect(router.serverSsr).toBeUndefined()
  })

  test('request abort cancels a plain response resolved by the callback later', async () => {
    const router = buildRouter()
    const requestController = new AbortController()
    const callbackStarted = deferred<void>()
    const callbackResult = deferred<Response>()
    const cancel = vi.fn((_reason: unknown) => new Promise<void>(() => {}))
    const handler = createRequestHandler({
      createRouter: () => router,
      request: new Request('http://localhost/', {
        signal: requestController.signal,
      }),
    })

    const response = handler(() => {
      callbackStarted.resolve()
      return callbackResult.promise
    })

    await callbackStarted.promise
    const cancellation = new Error('request disconnected')
    requestController.abort(cancellation)

    await expect(response).rejects.toBe(cancellation)
    callbackResult.resolve(new Response(new ReadableStream({ cancel })))
    await vi.waitFor(() => {
      expect(cancel).toHaveBeenCalledTimes(1)
      expect(cancel).toHaveBeenCalledWith(cancellation)
    })
  })

  test.each(['throw', 'reject'] as const)(
    'reports a %s from disposal of a late render response',
    async (failureMode) => {
      const router = buildRouter()
      const requestController = new AbortController()
      const renderStarted = deferred<void>()
      const renderResult = deferred<any>()
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
      const handler = createRequestHandler({
        createRouter: () => router,
        request: new Request('http://localhost/', {
          signal: requestController.signal,
        }),
      })

      try {
        const response = handler(() => {
          renderStarted.resolve()
          return renderResult.promise
        })

        await renderStarted.promise
        const cancellation = new Error('request disconnected')
        requestController.abort(cancellation)
        await expect(response).rejects.toBe(cancellation)

        renderResult.resolve({
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

  test('request abort cancels a locked tagged stream after response handoff', async () => {
    const router = buildRouter()
    const requestController = new AbortController()
    const cancellation = new Error('request disconnected')
    let cleanupCalls = 0
    const cancel = vi.fn(() => new Promise<void>(() => {}))
    const handler = createRequestHandler({
      createRouter: () => router,
      request: new Request('http://localhost/', {
        signal: requestController.signal,
      }),
    })

    const response = await handler(({ router: requestRouter }) => {
      const serverSsr = requestRouter.serverSsr!
      const cleanup = serverSsr.cleanup
      serverSsr.cleanup = () => {
        cleanupCalls++
        cleanup()
      }
      return createSsrStreamResponse(
        requestRouter,
        new Response(
          new ReadableStream({
            cancel,
          }),
        ),
      )
    })

    const reader = response.body!.getReader()
    const read = expect(reader.read()).rejects.toBe(cancellation)
    expect(cleanupCalls).toBe(0)
    requestController.abort(cancellation)

    try {
      await vi.waitFor(() => {
        expect(cancel).toHaveBeenCalledWith(cancellation)
      })
      await read
      expect(cleanupCalls).toBe(1)
      expect(router.serverSsr).toBeUndefined()
    } finally {
      reader.releaseLock()
    }
  })

  test('request abort cancels a pre-enqueued plain stream after response handoff', async () => {
    const router = buildRouter()
    const requestController = new AbortController()
    const cancellation = new Error('request disconnected')
    const cancel = vi.fn()
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    const handler = createRequestHandler({
      createRouter: () => router,
      request: new Request('http://localhost/', {
        signal: requestController.signal,
      }),
    })

    const response = await handler(() =>
      Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array([1]))
            },
            cancel,
          }),
        ),
      ),
    )
    const reader = response.body!.getReader()
    requestController.abort(cancellation)

    try {
      await vi.waitFor(() => {
        expect(cancel).toHaveBeenCalledWith(cancellation)
      })
      await expect(reader.read()).rejects.toBe(cancellation)
      expect(consoleError).not.toHaveBeenCalled()
    } finally {
      reader.releaseLock()
      consoleError.mockRestore()
    }
  })

  test.each(['replace', 'strip'] as const)(
    '%s remains Promise-returning without awaiting body cancellation',
    async (operation) => {
      const router = buildRouter()
      attachRouterServerSsrUtils({ router, manifest: undefined })
      const cancel = vi.fn(() => new Promise<void>(() => {}))
      const result = createSsrStreamResponse(
        router,
        new Response(new ReadableStream({ cancel })),
      )

      const replacementPromise =
        operation === 'replace'
          ? replaceSsrResponse(result, new Response('replacement'), 'replaced')
          : stripSsrResponseBody(result, 'stripped')

      expectTypeOf(replacementPromise).toEqualTypeOf<Promise<SsrResponse>>()
      expect(replacementPromise).toBeInstanceOf(Promise)
      const replacement = await replacementPromise
      expect(replacement.serverSsrCleanup).toBe('none')
      expect(router.serverSsr).toBeUndefined()
      await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce())
    },
  )

  test('stream response disposal remains Promise-returning', async () => {
    const router = buildRouter()
    attachRouterServerSsrUtils({ router, manifest: undefined })
    const result = createSsrStreamResponse(
      router,
      new Response(new ReadableStream()),
    )

    if (result.serverSsrCleanup !== 'stream') {
      throw new Error('Expected a stream response')
    }

    const disposal = result.dispose()

    expectTypeOf(disposal).toEqualTypeOf<Promise<void>>()
    expect(disposal).toBeInstanceOf(Promise)
    await disposal
  })

  test('response body cancellation awaits upstream cancellation', async () => {
    const router = buildRouter()
    attachRouterServerSsrUtils({ router, manifest: undefined })
    const cancellation = deferred<void>()
    const cancel = vi.fn(() => cancellation.promise)
    const result = createSsrStreamResponse(
      router,
      new Response(new ReadableStream({ cancel })),
    )

    const cancelled = result.response.body!.cancel('consumer cancelled')
    expect(cancel).toHaveBeenCalledWith('consumer cancelled')
    let settled = false
    void cancelled.then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    cancellation.resolve()
    await cancelled
  })

  test('an SSR source error propagates and cleans router state', async () => {
    const router = buildRouter()
    attachRouterServerSsrUtils({ router, manifest: undefined })
    const cleanup = router.serverSsr!.cleanup
    const cleanupSpy = vi.fn(() => cleanup())
    router.serverSsr!.cleanup = cleanupSpy
    let source!: ReadableStreamDefaultController<Uint8Array>
    const failure = new Error('renderer stream failed')
    const result = createSsrStreamResponse(
      router,
      new Response(
        new ReadableStream({
          start(controller) {
            source = controller
          },
        }),
      ),
    )
    const reader = result.response.body!.getReader()
    const read = reader.read()

    source.error(failure)

    try {
      await expect(read).rejects.toBe(failure)
      expect(cleanupSpy).toHaveBeenCalledOnce()
      expect(router.serverSsr).toBeUndefined()
    } finally {
      reader.releaseLock()
    }
  })

  test.each(['replace', 'strip'] as const)(
    '%s awaits custom asynchronous disposal',
    async (operation) => {
      const disposal = deferred<void>()
      const result = {
        response: new Response('stream'),
        serverSsrCleanup: 'stream' as const,
        dispose: vi.fn(() => disposal.promise),
      }
      const replacementPromise =
        operation === 'replace'
          ? replaceSsrResponse(result, new Response('replacement'), 'replaced')
          : stripSsrResponseBody(result, 'stripped')

      expect(replacementPromise).toBeInstanceOf(Promise)
      await Promise.resolve()
      expect(result.dispose).toHaveBeenCalledWith(
        operation === 'replace' ? 'replaced' : 'stripped',
      )

      let settled = false
      void replacementPromise.then(() => {
        settled = true
      })
      await Promise.resolve()
      expect(settled).toBe(false)

      disposal.resolve()
      const replacement = await replacementPromise
      expect(replacement.serverSsrCleanup).toBe('none')
    },
  )

  test.each(['replace', 'strip'] as const)(
    '%s cancels an abandoned plain response body',
    async (operation) => {
      const cancel = vi.fn()
      const result = new Response(new ReadableStream({ cancel }))

      if (operation === 'replace') {
        await replaceSsrResponse(
          result,
          new Response('replacement'),
          'replaced',
        )
      } else {
        await stripSsrResponseBody(result, 'stripped')
      }

      expect(cancel).toHaveBeenCalledOnce()
    },
  )

  test.each(['throw', 'reject'] as const)(
    'reports a custom stream disposal %s after request abort',
    async (failureMode) => {
      const router = buildRouter()
      attachRouterServerSsrUtils({ router, manifest: undefined })
      let cleanupCalls = 0
      const cleanup = router.serverSsr!.cleanup
      router.serverSsr!.cleanup = () => {
        cleanupCalls++
        cleanup()
      }
      const cleanupError = new Error('custom stream cleanup failed')
      const dispose = vi.fn(() => {
        if (failureMode === 'throw') {
          throw cleanupError
        }
        return Promise.reject(cleanupError)
      })
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined)
      const requestController = new AbortController()

      bindSsrResponseToRequest(
        router,
        {
          response: new Response('stream'),
          serverSsrCleanup: 'stream',
          dispose,
        },
        requestController.signal,
      )
      requestController.abort(new Error('request disconnected'))

      await vi.waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith(cleanupError)
      })
      expect(dispose).toHaveBeenCalledOnce()
      expect(cleanupCalls).toBe(1)
      expect(router.serverSsr).toBeUndefined()
    },
  )

  test('immediately disposes a bodyless custom stream response', async () => {
    const dispose = vi.fn(() => Promise.resolve())
    const result = bindSsrResponseToRequest(
      undefined,
      {
        response: new Response(null, { status: 204 }),
        serverSsrCleanup: 'stream',
        dispose,
      },
      new AbortController().signal,
    )

    expect(result).toMatchObject({ serverSsrCleanup: 'none' })
    expect(result.response.status).toBe(204)
    await vi.waitFor(() => {
      expect(dispose).toHaveBeenCalledWith(undefined)
    })
  })

  test('passes an existing request abort reason to a bodyless custom stream response', async () => {
    const dispose = vi.fn(() => Promise.resolve())
    const request = new AbortController()
    const reason = new Error('request disconnected')
    request.abort(reason)

    bindSsrResponseToRequest(
      undefined,
      {
        response: new Response(null, { status: 204 }),
        serverSsrCleanup: 'stream',
        dispose,
      },
      request.signal,
    )

    await vi.waitFor(() => {
      expect(dispose).toHaveBeenCalledWith(reason)
    })
  })

  test('request handler defers cleanup for stream response metadata', async () => {
    const router = buildRouter()
    let cleanupCalls = 0
    let controller!: ReadableStreamDefaultController<Uint8Array>
    const handler = createRequestHandler({
      createRouter: () => router,
      request: new Request('http://localhost/'),
    })

    const response = await handler(({ router: requestRouter }) => {
      const serverSsr = requestRouter.serverSsr!
      const cleanup = serverSsr.cleanup
      serverSsr.cleanup = () => {
        cleanupCalls++
        cleanup()
      }
      const appStream = new ReadableStream<Uint8Array>({
        start(c) {
          controller = c
        },
      })
      const responseStream = transformStreamWithRouter(
        requestRouter,
        appStream as any,
      )

      return createSsrStreamResponse(
        requestRouter,
        new Response(responseStream as any),
      )
    })

    expect(cleanupCalls).toBe(0)
    controller.enqueue(new TextEncoder().encode('<html><body>ok</body></html>'))
    controller.close()
    await response.text()
    expect(cleanupCalls).toBe(1)
    expect(router.serverSsr).toBeUndefined()
  })
})
