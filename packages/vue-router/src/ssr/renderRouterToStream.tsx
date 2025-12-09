import { ReadableStream as NodeReadableStream } from 'node:stream/web'
import * as Vue from 'vue'
import { renderToWebStream } from 'vue/server-renderer'
import { isbot } from 'isbot'
import { transformReadableStreamWithRouter } from '@tanstack/router-core/ssr/server'
import type { AnyRouter } from '@tanstack/router-core'
import type { Component } from 'vue'

// Strips trailing Vue fragment comment markers after </html>
// These are <!--[--> <!--]--> and <!---->
function stripTrailingVueMarkers(html: string): string {
  // Find the last </html> tag
  const htmlCloseIndex = html.lastIndexOf('</html>')
  if (htmlCloseIndex === -1) {
    return html
  }

  // Get content after </html>
  const afterHtml = html.slice(htmlCloseIndex + 7)

  // Check if there's only Vue fragment markers after </html>
  // Strip all <!--[--> <!--]--> and <!----> markers
  const stripped = afterHtml.replace(/<!--(?:\[|]|--)-->/g, '').trim()

  // If nothing meaningful remains after stripping, remove the trailing content
  if (stripped === '') {
    return html.slice(0, htmlCloseIndex + 7)
  }

  return html
}

// Wraps a stream with <!DOCTYPE html> prefix and cleans up Vue fragment markers
// The <html> element should be rendered by the Vue component tree
// using the Html component to enable data-allow-mismatch for streaming hydration
function wrapStreamWithDoctype(
  inputStream: any,
): NodeReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  let sentPrefix = false
  let reader: any
  let buffer = ''
  let foundHtml = false
  let trailingBuffer = ''
  let foundHtmlClose = false

  return new NodeReadableStream<Uint8Array>({
    start() {
      reader = inputStream.getReader()
    },
    async pull(controller) {
      // Send the DOCTYPE prefix first
      if (!sentPrefix) {
        sentPrefix = true
        controller.enqueue(encoder.encode('<!DOCTYPE html>'))
      }

      const { done, value } = await reader.read()
      if (done) {
        // Flush any remaining buffer (for prefix stripping)
        if (buffer) {
          controller.enqueue(encoder.encode(buffer))
        }
        // Process and flush trailing buffer (for suffix stripping)
        if (trailingBuffer) {
          const cleaned = stripTrailingVueMarkers(trailingBuffer)
          controller.enqueue(encoder.encode(cleaned))
        }
        controller.close()
      } else {
        const chunk = decoder.decode(value, { stream: true })

        // If we haven't found <html yet, buffer content and strip Vue fragment markers
        if (!foundHtml) {
          buffer += chunk
          const htmlIndex = buffer.indexOf('<html')
          if (htmlIndex !== -1) {
            foundHtml = true
            // Strip Vue fragment comment markers before <html>
            // These are <!--[--> <!--]--> and <!---->
            const afterHtml = buffer.slice(htmlIndex)
            // Only send content from <html> onward, skip the fragment markers
            // Start buffering for trailing markers
            trailingBuffer = afterHtml
            buffer = ''
          }
          // If buffer is getting too large without finding <html>, something is wrong
          // Just pass it through
          else if (buffer.length > 1000) {
            foundHtml = true // Give up looking
            trailingBuffer = buffer
            buffer = ''
          }
        } else {
          trailingBuffer += chunk
        }

        // Check if we have </html> in the trailing buffer
        // If so, we can flush everything up to a safe point
        if (trailingBuffer.length > 0) {
          const htmlCloseIndex = trailingBuffer.lastIndexOf('</html>')
          if (htmlCloseIndex !== -1) {
            foundHtmlClose = true
            // Keep buffering - we need to wait for stream end to strip trailing markers
            // But if buffer is getting large, flush the safe part
            if (trailingBuffer.length > 10000) {
              // Flush up to </html>, keep the rest buffered
              const safeToFlush = trailingBuffer.slice(0, htmlCloseIndex + 7)
              trailingBuffer = trailingBuffer.slice(htmlCloseIndex + 7)
              controller.enqueue(encoder.encode(safeToFlush))
            }
          } else if (!foundHtmlClose && trailingBuffer.length > 5000) {
            // Haven't found </html> yet, but buffer is large - flush most of it
            // Keep last 100 chars in case </html> spans chunks
            const safeLength = trailingBuffer.length - 100
            const safeToFlush = trailingBuffer.slice(0, safeLength)
            trailingBuffer = trailingBuffer.slice(safeLength)
            controller.enqueue(encoder.encode(safeToFlush))
          }
        }
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
    let fullHtml = new TextDecoder().decode(combined)

    // Strip Vue fragment comment markers before <html>
    const htmlIndex = fullHtml.indexOf('<html')
    if (htmlIndex > 0) {
      fullHtml = fullHtml.slice(htmlIndex)
    }

    // Strip Vue fragment comment markers after </html>
    fullHtml = stripTrailingVueMarkers(fullHtml)

    return new Response(`<!DOCTYPE html>${fullHtml}`, {
      status: router.state.statusCode,
      headers: responseHeaders,
    })
  }

  // Wrap the Vue stream with DOCTYPE (html element comes from Vue component tree)
  const wrappedStream = wrapStreamWithDoctype(stream)

  const responseStream = transformReadableStreamWithRouter(
    router,
    wrappedStream as unknown as NodeReadableStream,
  )

  return new Response(responseStream as any, {
    status: router.state.statusCode,
    headers: responseHeaders,
  })
}
