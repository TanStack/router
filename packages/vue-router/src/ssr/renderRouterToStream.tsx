import { ReadableStream as NodeReadableStream } from 'node:stream/web'
import * as Vue from 'vue'
import { renderToWebStream } from 'vue/server-renderer'
import { isbot } from 'isbot'
import type { AnyRouter } from '@tanstack/router-core'
import type { Component } from 'vue'

// Strips Vue fragment comment markers from HTML string
function stripVueMarkers(html: string): string {
  return html.replace(/<!--(?:\[|]|--)-->/g, '')
}

// Wraps a stream with <!DOCTYPE html> prefix and cleans up Vue fragment markers
// Vue outputs fragment markers before <html> and after </html> that need stripping
// Key: Stream content through IMMEDIATELY after finding <html> - don't buffer!
function wrapStreamWithDoctype(
  inputStream: any,
): NodeReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  let reader: any
  let sentDoctype = false
  let prefixBuffer = '' // Buffer only until we find <html>
  let foundHtmlOpen = false
  let foundHtmlClose = false
  let suffixBuffer = '' // Buffer only after </html> to strip trailing markers

  return new NodeReadableStream<Uint8Array>({
    start() {
      reader = inputStream.getReader()
    },
    async pull(controller) {
      const { done, value } = await reader.read()

      if (done) {
        // Stream ended - flush remaining buffers
        if (prefixBuffer) {
          if (!sentDoctype) {
            controller.enqueue(encoder.encode('<!DOCTYPE html>'))
          }
          controller.enqueue(encoder.encode(stripVueMarkers(prefixBuffer)))
        }
        // Don't output anything after </html> - trailing markers are stripped
        controller.close()
        return
      }

      const chunk = decoder.decode(value, { stream: true })

      // Phase 1: Buffer until we find <html> to strip leading markers
      if (!foundHtmlOpen) {
        prefixBuffer += chunk
        const htmlIndex = prefixBuffer.indexOf('<html')

        if (htmlIndex !== -1) {
          foundHtmlOpen = true
          // Send DOCTYPE immediately
          if (!sentDoctype) {
            sentDoctype = true
            controller.enqueue(encoder.encode('<!DOCTYPE html>'))
          }
          // Get content from <html> onward (skip leading markers)
          const content = prefixBuffer.slice(htmlIndex)
          prefixBuffer = ''

          // Check if </html> is in this same chunk
          const closeIndex = content.indexOf('</html>')
          if (closeIndex !== -1) {
            foundHtmlClose = true
            // Send up to and including </html>
            controller.enqueue(encoder.encode(content.slice(0, closeIndex + 7)))
            // Buffer the rest to strip trailing markers
            suffixBuffer = content.slice(closeIndex + 7)
          } else {
            // Stream content through immediately
            controller.enqueue(encoder.encode(content))
          }
        } else if (prefixBuffer.length > 500) {
          // Safety: no <html> found after 500 chars, pass through
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

      // Phase 2: Stream content through, looking for </html>
      if (!foundHtmlClose) {
        const closeIndex = chunk.indexOf('</html>')
        if (closeIndex !== -1) {
          foundHtmlClose = true
          // Send up to and including </html>
          controller.enqueue(encoder.encode(chunk.slice(0, closeIndex + 7)))
          // Buffer the rest (trailing markers to be stripped)
          suffixBuffer = chunk.slice(closeIndex + 7)
        } else {
          // Stream through immediately - this is the key fix!
          controller.enqueue(encoder.encode(chunk))
        }
        return
      }

      // Phase 3: After </html>, just buffer (will be discarded as trailing markers)
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

    // Strip Vue fragment comment markers before <html> and after </html>
    const htmlOpenIndex = fullHtml.indexOf('<html')
    const htmlCloseIndex = fullHtml.indexOf('</html>')

    if (htmlOpenIndex !== -1 && htmlCloseIndex !== -1) {
      // Extract just the content from <html> to </html> (inclusive)
      fullHtml = fullHtml.slice(htmlOpenIndex, htmlCloseIndex + 7)
    } else if (htmlOpenIndex !== -1) {
      fullHtml = fullHtml.slice(htmlOpenIndex)
    }

    return new Response(`<!DOCTYPE html>${fullHtml}`, {
      status: router.state.statusCode,
      headers: responseHeaders,
    })
  }

  // Temporarily: collect all chunks and return as a single response
  // to test if basic flow works
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

  // Strip Vue fragment markers before <html> and after </html>
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
