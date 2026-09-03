import * as Vue from 'vue'
import { renderToString, renderToWebStream } from 'vue/server-renderer'
import { isbot } from 'isbot'
import {
  createSsrStreamResponse,
  transformHtmlStringWithRouter,
  transformReadableStreamWithRouter,
  waitForReason,
} from '@tanstack/router-core/ssr/server'
import type { AnyRouter } from '@tanstack/router-core'
import type { Component } from 'vue'
import type { ReadableStream } from 'node:stream/web'

export const renderRouterToStream = async ({
  request,
  router,
  responseHeaders,
  App,
}: {
  request: Request
  router: AnyRouter
  responseHeaders: Headers
  App: Component
}) => {
  const signal = request.signal
  if (signal.aborted) {
    router.serverSsr?.cleanup()
    throw signal.reason
  }

  let app: ReturnType<typeof Vue.createSSRApp>
  try {
    app = Vue.createSSRApp(App, { router })
  } catch (error) {
    router.serverSsr?.cleanup()
    throw error
  }
  const status =
    router._serverResult?.type === 'render' ? router._serverResult.status : 200

  if (isbot(request.headers.get('User-Agent'))) {
    try {
      let fullHtml = await waitForReason(renderToString(app), signal)

      fullHtml = await transformHtmlStringWithRouter(router, fullHtml, {
        signal,
      })

      return new Response(fullHtml, {
        status,
        headers: responseHeaders,
      })
    } finally {
      router.serverSsr?.cleanup()
    }
  }

  let readable: ReturnType<typeof renderToWebStream>
  try {
    readable = renderToWebStream(app).pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('<!DOCTYPE html>'))
        },
      }),
    )
  } catch (err) {
    router.serverSsr?.cleanup()
    throw err
  }

  const responseStream = transformReadableStreamWithRouter(
    router,
    readable as unknown as ReadableStream,
    { signal },
  )

  return createSsrStreamResponse(
    router,
    new Response(responseStream as any, {
      status,
      headers: responseHeaders,
    }),
  )
}
