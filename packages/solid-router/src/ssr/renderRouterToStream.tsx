import * as Solid from 'solid-js/web'
import { isbot } from 'isbot'
import {
  createSsrStreamResponse,
  getSsrStatus,
  transformReadableStreamWithRouter,
  waitForRequest,
} from '@tanstack/router-core/ssr/server'
import { getSolidRenderOptions } from './renderOptions'
import { deferHydrationScripts } from './deferHydrationScripts'
import type { JSXElement } from 'solid-js'
import type { AnyRouter } from '@tanstack/router-core'

export const renderRouterToStream = async ({
  request,
  router,
  responseHeaders,
  children,
}: {
  request: Request
  router: AnyRouter
  responseHeaders: Headers
  children: () => JSXElement
}) => {
  const signal = request.signal
  if (signal.aborted) {
    router.serverSsr?.cleanup()
    throw signal.reason
  }

  try {
    const tracker = { didRun: false }
    const docType = Solid.ssr('<!DOCTYPE html>')
    const stream = Solid.renderToStream(
      () => (
        <>
          {docType}
          {children()}
        </>
      ),
      getSolidRenderOptions(router, tracker),
    )

    // Cancelling the transform's reader errors this writable, which makes
    // Solid's later writes reject and be ignored. Solid exposes no disposal
    // handle for unresolved renderer work; see router-core's STREAMING.md.
    let decoder: TextDecoder | undefined
    let encoder: TextEncoder | undefined
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>({
      transform(record, controller) {
        // Native records are the doctype-prefixed shell, <script> tasks, or
        // <template> markup. Templates cannot contain serializer tasks; avoid
        // decoding potentially large markup records (116 is the initial 't').
        if (tracker.didRun && record[1] !== 116) {
          decoder ??= new TextDecoder()
          const html = decoder.decode(record)
          const deferred = deferHydrationScripts(html)
          if (deferred !== html) {
            encoder ??= new TextEncoder()
            record = encoder.encode(deferred)
          }
        }
        controller.enqueue(record)
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
