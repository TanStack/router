import * as Solid from '@solidjs/web'
import { isbot } from 'isbot'
import {
  createSsrStreamResponse,
  getSsrStatus,
  transformReadableStreamWithRouter,
  waitForRequest,
} from '@tanstack/router-core/ssr/server'
import { getSolidRenderOptions } from './renderOptions'
import type { AnyRouter } from '@tanstack/router-core'
import type { JSX } from '@solidjs/web'

const doctype = new TextEncoder().encode('<!DOCTYPE html>')

export const renderRouterToStream = async ({
  request,
  router,
  responseHeaders,
  children,
  manifest,
}: {
  request: Request
  router: AnyRouter
  responseHeaders: Headers
  children: () => JSX.Element
  manifest?: unknown
}) => {
  const signal = request.signal
  if (signal.aborted) {
    router.serverSsr?.cleanup()
    throw signal.reason
  }

  try {
    const stream = Solid.renderToStream(
      () => children,
      getSolidRenderOptions(router, manifest),
    )

    // Cancelling the transform's reader errors this writable, which makes
    // Solid's later writes reject and be ignored. Solid exposes no disposal
    // handle for unresolved renderer work; see router-core's STREAMING.md.
    let doctypeWritten = false
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>({
      // The doctype joins the shell so it stays one renderer record.
      transform(chunk, controller) {
        if (doctypeWritten) {
          controller.enqueue(chunk)
          return
        }
        doctypeWritten = true
        const out = new Uint8Array(doctype.length + chunk.length)
        out.set(doctype, 0)
        out.set(chunk, doctype.length)
        controller.enqueue(out)
      },
    })
    const rendererAbort = isbot(request.headers.get('User-Agent'))
      ? new AbortController()
      : undefined
    const responseStream = transformReadableStreamWithRouter(router, readable, {
      rendererSafePoint: 'record-end',
      signal,
      onAbort: rendererAbort
        ? (reason) => rendererAbort.abort(reason)
        : undefined,
    })

    if (rendererAbort) {
      await waitForRequest(stream as unknown, rendererAbort.signal)
    }

    // The server export returns Promise<void>. Solid's client declaration
    // returns void, and this file is also checked under that export condition.
    void Promise.resolve(stream.pipeTo(writable)).catch((error: unknown) => {
      console.error('Error in Solid render stream:', error)
      void writable.abort(error).catch(() => {})
    })

    return createSsrStreamResponse(
      router,
      new Response(responseStream, {
        status: getSsrStatus(router),
        headers: responseHeaders,
      }),
    )
  } catch (error) {
    router.serverSsr?.cleanup()
    throw error
  }
}
