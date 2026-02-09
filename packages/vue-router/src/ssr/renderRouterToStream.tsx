import { ReadableStream as NodeReadableStream } from 'node:stream/web'
import * as Vue from 'vue'
import { pipeToWebWritable, renderToString } from 'vue/server-renderer'
import { isbot } from 'isbot'
import { transformReadableStreamWithRouter } from '@tanstack/router-core/ssr/server'
import type { AnyRouter } from '@tanstack/router-core'
import type { Component } from 'vue'
import type { ReadableStream } from 'node:stream/web'

function prependDoctype(
  readable: globalThis.ReadableStream,
): NodeReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let sentDoctype = false

  return new NodeReadableStream<Uint8Array>({
    start(controller) {
      const reader = readable.getReader()

      async function pump(): Promise<void> {
        const { done, value } = await reader.read()
        if (done) {
          controller.close()
          return
        }

        if (!sentDoctype) {
          sentDoctype = true
          controller.enqueue(encoder.encode('<!DOCTYPE html>'))
        }
        controller.enqueue(value)
        return pump()
      }

      pump().catch((err) => controller.error(err))
    },
  })
}

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
  const app = Vue.createSSRApp(App, { router })

  if (isbot(request.headers.get('User-Agent'))) {
    let fullHtml = await renderToString(app)

    const htmlOpenIndex = fullHtml.indexOf('<html')
    const htmlCloseIndex = fullHtml.indexOf('</html>')

    if (htmlOpenIndex !== -1 && htmlCloseIndex !== -1) {
      fullHtml = fullHtml.slice(htmlOpenIndex, htmlCloseIndex + 7)
    } else if (htmlOpenIndex !== -1) {
      fullHtml = fullHtml.slice(htmlOpenIndex)
    }

    return new Response(`<!DOCTYPE html>${fullHtml}`, {
      status: router.state.statusCode,
      headers: responseHeaders,
    })
  }

  const { writable, readable } = new TransformStream()

  pipeToWebWritable(app, {}, writable)

  const doctypedStream = prependDoctype(readable)
  const responseStream = transformReadableStreamWithRouter(
    router,
    doctypedStream as unknown as ReadableStream,
  )

  return new Response(responseStream as any, {
    status: router.state.statusCode,
    headers: responseHeaders,
  })
}
