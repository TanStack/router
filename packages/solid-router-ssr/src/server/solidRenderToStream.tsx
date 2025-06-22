import * as Solid from 'solid-js/web'
import { isbot } from 'isbot'
import { transformReadableStreamWithRouter } from '@tanstack/router-ssr-core/server'
import type { JSXElement } from 'solid-js'
import type { ReadableStream } from 'node:stream/web'
import type { AnyRouter } from '@tanstack/router-core'

export const solidRenderToStream = async ({
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
  const { writable, readable } = new TransformStream()

  const stream = Solid.renderToStream(children)

  if (isbot(request.headers.get('User-Agent'))) {
    await stream
  }
  stream.pipeTo(writable)

  const responseStream = transformReadableStreamWithRouter(
    router,
    readable as unknown as ReadableStream,
  )
  return new Response(responseStream as any, {
    status: router.state.statusCode,
    headers: responseHeaders,
  })
}
