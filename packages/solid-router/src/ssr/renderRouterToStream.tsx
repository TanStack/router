import {
  HydrationScript,
  NoHydration,
  renderToStream,
  renderToString,
  ssr,
} from 'solid-js/web'
import {
  HeadStream,
  UnheadContext,
  createStreamableHead,
} from '@unhead/solid-js/stream/server'
import { isbot } from 'isbot'
import { transformReadableStreamWithRouter } from '@tanstack/router-core/ssr/server'
import { makeSsrSerovalPlugin } from '@tanstack/router-core'
import type { JSXElement } from 'solid-js'
import { TransformStream } from 'node:stream/web'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'
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
  const docType = ssr('<!DOCTYPE html>')

  const serializationAdapters =
    (router.options as any)?.serializationAdapters ||
    (router.options.ssr as any)?.serializationAdapters
  const serovalPlugins = serializationAdapters?.map((adapter: any) => {
    const plugin = makeSsrSerovalPlugin(adapter, { didRun: false })
    return plugin
  })

  const { head, onCompleteShell, wrapStream } = createStreamableHead()
  const template = renderToString(
    () => (
      <NoHydration>
        {docType as any}
        <html>
          <head>
            <HydrationScript />
          </head>
          <body></body>
        </html>
      </NoHydration>
    ),
    {
      nonce: router.options.ssr?.nonce,
    } as any,
  )
  const stream = renderToStream(
    () => (
      <UnheadContext.Provider value={head}>
        <NoHydration>
          {HeadStream() as unknown as JSXElement}
          {children()}
        </NoHydration>
      </UnheadContext.Provider>
    ),
    {
      nonce: router.options.ssr?.nonce,
      plugins: serovalPlugins,
      onCompleteShell,
    } as any,
  )

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  stream.pipeTo(writable)

  if (isbot(request.headers.get('User-Agent'))) {
    await stream
  }
  const wrappedStream = wrapStream(
    readable as unknown as ReadableStream<Uint8Array>,
    template,
  )
  const responseStream = transformReadableStreamWithRouter(
    router,
    wrappedStream as unknown as NodeReadableStream,
  )
  return new Response(responseStream as any, {
    status: router.state.statusCode,
    headers: responseHeaders,
  })
}
