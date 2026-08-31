import { PassThrough, Readable } from 'node:stream'
import ReactDOMServer from 'react-dom/server'
import { isbot } from 'isbot'
import {
  createSsrStreamResponse,
  transformReadableStreamWithRouter,
  waitForReason,
} from '@tanstack/router-core/ssr/server'
import type { AnyRouter } from '@tanstack/router-core'
import type { ReadableStream } from 'node:stream/web'
import type { ReactNode } from 'react'

export const renderRouterToStream = async ({
  request,
  router,
  responseHeaders,
  children,
}: {
  request: Request
  router: AnyRouter
  responseHeaders: Headers
  children: ReactNode
}) => {
  const signal = request.signal
  if (signal.aborted) {
    router.serverSsr?.cleanup()
    throw signal.reason
  }
  let rendererTeardown = false
  const status =
    router._serverResult?.type === 'render' ? router._serverResult.status : 200

  if (typeof ReactDOMServer.renderToReadableStream === 'function') {
    let stream: Awaited<
      ReturnType<typeof ReactDOMServer.renderToReadableStream>
    >
    try {
      stream = await ReactDOMServer.renderToReadableStream(children, {
        signal,
        nonce: router.options.ssr?.nonce,
        progressiveChunkSize: Number.POSITIVE_INFINITY,
        onError: (error, info) => {
          if (!rendererTeardown && !signal.aborted) {
            console.error('Error in renderToReadableStream:', error, info)
          }
        },
      })
    } catch (error) {
      router.serverSsr?.cleanup()
      throw error
    }

    if (isbot(request.headers.get('User-Agent'))) {
      try {
        await waitForReason(stream.allReady, signal)
      } catch (error) {
        rendererTeardown = true
        router.serverSsr?.cleanup()
        await stream.cancel(error).catch(() => {})
        throw error
      }
    }

    const responseStream = transformReadableStreamWithRouter(
      router,
      stream as unknown as ReadableStream,
      {
        rendererSafePoint: 'script-close',
        signal,
        onAbort: () => {
          rendererTeardown = true
        },
      },
    )
    return createSsrStreamResponse(
      router,
      new Response(responseStream as any, {
        status,
        headers: responseHeaders,
      }),
    )
  }

  if (typeof ReactDOMServer.renderToPipeableStream === 'function') {
    const reactAppPassthrough = new PassThrough()

    let pipeable:
      | ReturnType<typeof ReactDOMServer.renderToPipeableStream>
      | undefined
    let resolveReady!: () => void
    let rejectReady!: (reason?: unknown) => void
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve
      rejectReady = reject
    })
    const rendererAbort = new AbortController()
    const readySignal = AbortSignal.any([signal, rendererAbort.signal])
    const abortPipeable = (reason?: unknown) => {
      if (rendererTeardown) {
        return
      }
      rendererTeardown = true
      rendererAbort.abort(reason)
      try {
        pipeable?.abort(reason)
      } catch {
        // ignore — React may throw if already aborted/finished
      }
    }
    try {
      pipeable = ReactDOMServer.renderToPipeableStream(children, {
        nonce: router.options.ssr?.nonce,
        progressiveChunkSize: Number.POSITIVE_INFINITY,
        ...(isbot(request.headers.get('User-Agent'))
          ? { onAllReady: resolveReady }
          : { onShellReady: resolveReady }),
        onError: (error, info) => {
          if (!rendererTeardown && !signal.aborted) {
            console.error('Error in renderToPipeableStream:', error, info)
          }
        },
        onShellError: rejectReady,
      })
      const responseStream = transformReadableStreamWithRouter(
        router,
        Readable.toWeb(reactAppPassthrough),
        {
          rendererSafePoint: 'script-close',
          signal,
          onAbort: abortPipeable,
        },
      )

      await waitForReason(ready, readySignal)
      pipeable.pipe(reactAppPassthrough)

      return createSsrStreamResponse(
        router,
        new Response(responseStream as any, {
          status,
          headers: responseHeaders,
        }),
      )
    } catch (error) {
      abortPipeable(error)
      router.serverSsr?.cleanup()
      throw error
    }
  }

  const error = new Error(
    'No renderToReadableStream or renderToPipeableStream found in react-dom/server. Ensure you are using a version of react-dom that supports streaming.',
  )
  router.serverSsr?.cleanup()
  throw error
}
