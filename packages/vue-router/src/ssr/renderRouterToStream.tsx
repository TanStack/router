import { ReadableStream as NodeReadableStream } from 'node:stream/web'
import * as Vue from 'vue'
import { renderToWebStream } from 'vue/server-renderer'
import { isbot } from 'isbot'
import { transformReadableStreamWithRouter } from '@tanstack/router-core/ssr/server'
import type { AnyRouter } from '@tanstack/router-core'
import type { Component } from 'vue'
import type { ReadableStream } from 'node:stream/web'

function stripVueMarkers(html: string): string {
  return html.replace(/<!--(?:\[|]|--)-->/g, '')
}

function wrapStreamWithDoctype(
  inputStream: any,
): NodeReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  let reader: any
  let sentDoctype = false
  let prefixBuffer = ''
  let foundHtmlOpen = false
  let foundHtmlClose = false
  let suffixBuffer = ''

  return new NodeReadableStream<Uint8Array>({
    start() {
      reader = inputStream.getReader()
    },
    async pull(controller) {
      const { done, value } = await reader.read()

      if (done) {
        if (prefixBuffer) {
          if (!sentDoctype) {
            controller.enqueue(encoder.encode('<!DOCTYPE html>'))
          }
          controller.enqueue(encoder.encode(stripVueMarkers(prefixBuffer)))
        }
        controller.close()
        return
      }

      const chunk = decoder.decode(value, { stream: true })

      if (!foundHtmlOpen) {
        prefixBuffer += chunk
        const htmlIndex = prefixBuffer.indexOf('<html')

        if (htmlIndex !== -1) {
          foundHtmlOpen = true
          if (!sentDoctype) {
            sentDoctype = true
            controller.enqueue(encoder.encode('<!DOCTYPE html>'))
          }
          const content = prefixBuffer.slice(htmlIndex)
          prefixBuffer = ''

          const closeIndex = content.indexOf('</html>')
          if (closeIndex !== -1) {
            foundHtmlClose = true
            controller.enqueue(encoder.encode(content.slice(0, closeIndex + 7)))
            suffixBuffer = content.slice(closeIndex + 7)
          } else {
            controller.enqueue(encoder.encode(content))
          }
        } else if (prefixBuffer.length > 500) {
          foundHtmlOpen = true
          if (!sentDoctype) {
            sentDoctype = true
            controller.enqueue(encoder.encode('<!DOCTYPE html>'))
          }
          controller.enqueue(encoder.encode(stripVueMarkers(prefixBuffer)))
          prefixBuffer = ''
        }
        return
      }

      if (!foundHtmlClose) {
        const closeIndex = chunk.indexOf('</html>')
        if (closeIndex !== -1) {
          foundHtmlClose = true
          controller.enqueue(encoder.encode(chunk.slice(0, closeIndex + 7)))
          suffixBuffer = chunk.slice(closeIndex + 7)
        } else {
          controller.enqueue(encoder.encode(chunk))
        }
        return
      }

      suffixBuffer += chunk
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

    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0)
    const combined = new Uint8Array(totalLength)
    let offset = 0
    for (const chunk of chunks) {
      combined.set(chunk, offset)
      offset += chunk.length
    }
    let fullHtml = new TextDecoder().decode(combined)

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

  const wrappedStream = wrapStreamWithDoctype(stream)
  const responseStream = transformReadableStreamWithRouter(
    router,
    wrappedStream as unknown as ReadableStream,
  )

  return new Response(responseStream as any, {
    status: router.state.statusCode,
    headers: responseHeaders,
  })
}
