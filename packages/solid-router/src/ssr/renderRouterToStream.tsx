import * as Solid from '@solidjs/web'
import { isbot } from 'isbot'
import { transformReadableStreamWithRouter } from '@tanstack/router-core/ssr/server'
import { makeSsrSerovalPlugin } from '@tanstack/router-core'
import type { ReadableStream } from 'node:stream/web'
import type { AnyRouter } from '@tanstack/router-core'
import type { JSX } from '@solidjs/web'

export const renderRouterToStream = async ({
  request,
  router,
  responseHeaders,
  children,
}: {
  request: Request
  router: AnyRouter
  responseHeaders: Headers
  children: () => JSX.Element
}) => {
  const { writable, readable } = new TransformStream()

  const serializationAdapters =
    (router.options as any)?.serializationAdapters ||
    (router.options.ssr as any)?.serializationAdapters
  const serovalPlugins = serializationAdapters?.map((adapter: any) => {
    const plugin = makeSsrSerovalPlugin(adapter, { didRun: false })
    return plugin
  })

  const stream = Solid.renderToStream(() => children, {
    nonce: router.options.ssr?.nonce,
    plugins: serovalPlugins,
  } as any)

  if (isbot(request.headers.get('User-Agent'))) {
    await stream
  }
  stream.pipeTo(writable)

  const responseStream = transformReadableStreamWithRouter(
    router,
    readable as unknown as ReadableStream,
  )
  return new Response(responseStream as any, {
    status: router.stores.statusCode.state,
    headers: responseHeaders,
  })
}
