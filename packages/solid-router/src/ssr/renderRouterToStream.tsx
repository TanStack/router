import * as Solid from 'solid-js/web'
import { isbot } from 'isbot'
import { transformReadableStreamWithRouter } from '@tanstack/router-core/ssr/server'
import { makeSsrSerovalPlugin } from '@tanstack/router-core'
import type { JSXElement } from 'solid-js'
import type { ReadableStream } from 'node:stream/web'
import type { AnyRouter } from '@tanstack/router-core'

export const renderRouterToStream = async ({
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

  const docType = Solid.ssr('<!DOCTYPE html>')

  const serializationAdapters =
    (router.options as any)?.serializationAdapters ||
    (router.options.ssr as any)?.serializationAdapters
  const serovalPlugins = serializationAdapters?.map((adapter: any) => {
    const plugin = makeSsrSerovalPlugin(adapter, { didRun: false })
    return plugin
  })

  const stream = Solid.renderToStream(
    () => (
      <>
        {docType}
        {children()}
      </>
    ),
    {
      nonce: router.options.ssr?.nonce,
      plugins: serovalPlugins,
    } as any,
  )

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
