import { ReadableStream as NodeReadableStream } from 'node:stream/web'
import * as Vue from 'vue'
import { renderToWebStream } from 'vue/server-renderer'
import { isbot } from 'isbot'
import { transformReadableStreamWithRouter } from '@tanstack/router-core/ssr/server'
import type { AnyRouter } from '@tanstack/router-core'
import type { Component } from 'vue'

// Wraps a stream with <html> prefix and </html> suffix
// This is needed because Vue root components render fragments (<head> + <body>)
// rather than a full <html> wrapper like React
function wrapStreamWithHtml(inputStream: any): NodeReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let sentPrefix = false
  let reader: any

  return new NodeReadableStream<Uint8Array>({
    start() {
      reader = inputStream.getReader()
    },
    async pull(controller) {
      // Send the HTML prefix first
      if (!sentPrefix) {
        sentPrefix = true
        controller.enqueue(encoder.encode('<!DOCTYPE html><html>'))
      }

      const { done, value } = await reader.read()
      if (done) {
        // Send the closing </html> tag
        controller.enqueue(encoder.encode('</html>'))
        controller.close()
      } else {
        controller.enqueue(value)
      }
    },
    cancel() {
      reader.releaseLock()
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

  const stream = renderToWebStream(app)

  // For bots, we need to wait for the full response
  if (isbot(request.headers.get('User-Agent'))) {
    const reader = stream.getReader()
    const chunks: Array<Uint8Array> = []
    let done = false
    while (!done) {
      const result = await reader.read()
      if (result.done) {
        done = true
      } else {
        chunks.push(result.value)
      }
    }

    // Combine all chunks into a single Uint8Array
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0)
    const combined = new Uint8Array(totalLength)
    let offset = 0
    for (const chunk of chunks) {
      combined.set(chunk, offset)
      offset += chunk.length
    }
    const fullHtml = new TextDecoder().decode(combined)

    return new Response(`<!DOCTYPE html><html>${fullHtml}</html>`, {
      status: router.state.statusCode,
      headers: responseHeaders,
    })
  }

  // Wrap the Vue stream with <html> tags
  const wrappedStream = wrapStreamWithHtml(stream)

  const responseStream = transformReadableStreamWithRouter(
    router,
    wrappedStream as unknown as NodeReadableStream,
  )

  return new Response(responseStream as any, {
    status: router.state.statusCode,
    headers: responseHeaders,
  })
}
