import * as Vue from 'vue'
import { renderToWebStream } from 'vue/server-renderer'
import { isbot } from 'isbot'
import { transformReadableStreamWithRouter } from '@tanstack/router-core/ssr/server'
import type { ReadableStream } from 'node:stream/web'
import type { AnyRouter } from '@tanstack/router-core'
import type { Component } from 'vue'

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

    return new Response(`<!DOCTYPE html>${fullHtml}`, {
      status: router.state.statusCode,
      headers: responseHeaders,
    })
  }

  const responseStream = transformReadableStreamWithRouter(
    router,
    stream as unknown as ReadableStream,
  )

  return new Response(responseStream as any, {
    status: router.state.statusCode,
    headers: responseHeaders,
  })
}
