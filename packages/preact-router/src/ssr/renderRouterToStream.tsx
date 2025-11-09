import { renderToString } from 'preact-render-to-string'
import { transformReadableStreamWithRouter } from '@tanstack/router-core/ssr/server'
import type { ComponentChildren } from 'preact'
import type { AnyRouter } from '@tanstack/router-core'
import type { ReadableStream } from 'node:stream/web'

export const renderRouterToStream = async ({
  request,
  router,
  responseHeaders,
  children,
}: {
  request: Request
  router: AnyRouter
  responseHeaders: Headers
  children: ComponentChildren
}) => {
  // Preact doesn't have native streaming support like React
  // We'll simulate streaming by rendering to string and streaming it
  const { writable, readable } = new TransformStream()

  try {
    // Render the component to string
    const componentHtml = renderToString(children as any, {
      pretty: false,
    })

    // Wrap component HTML in a basic HTML structure so transformReadableStreamWithRouter
    // can find the body tag and inject scripts
    const html = `<!DOCTYPE html><html><head></head><body><div id="app">${componentHtml}</div></body></html>`

    // Create a stream writer
    const writer = writable.getWriter()
    const encoder = new TextEncoder()

    // Write the HTML to the stream asynchronously
    // This allows transformReadableStreamWithRouter to start processing
    Promise.resolve().then(async () => {
      try {
        writer.write(encoder.encode(html))
        await writer.close()
      } catch (error) {
        writer.abort(error)
      }
    })

    const responseStream = transformReadableStreamWithRouter(
      router,
      readable as unknown as ReadableStream,
    )

    return new Response(responseStream as any, {
      status: router.state.statusCode,
      headers: responseHeaders,
    })
  } catch (error) {
    console.error('Error in renderRouterToStream:', error)
    const writer = writable.getWriter()
    await writer.close()
    return new Response('Internal Server Error', {
      status: 500,
      headers: responseHeaders,
    })
  }
}
