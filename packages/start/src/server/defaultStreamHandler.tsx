import { PassThrough } from 'node:stream'
import * as React from 'react'
import { isbot } from 'isbot'
import ReactDOMServer from 'react-dom/server'
import { StartServer } from './StartServer'
import { transformStreamWithRouter } from './transformStreamWithRouter'
import type { AnyRouter } from '@tanstack/react-router'

export type StartHandler<TRouter extends AnyRouter> = (ctx: {
  request: Request
  router: TRouter
  responseHeaders: Headers
}) => Promise<Response>

export const defaultStreamHandler: StartHandler<AnyRouter> = async ({
  request,
  router,
  responseHeaders,
}) => {
  const stream = await (async () => {
    if (typeof ReactDOMServer.renderToReadableStream === 'function') {
      const stream = await ReactDOMServer.renderToReadableStream(
        <StartServer router={router} />,
        {
          signal: request.signal,
        },
      )

      if (isbot(request.headers.get('User-Agent'))) {
        await stream.allReady
      }

      return stream
    }

    if (typeof ReactDOMServer.renderToPipeableStream === 'function') {
      const passthrough = new PassThrough()

      const pipeable = ReactDOMServer.renderToPipeableStream(
        <StartServer router={router} />,
        {
          ...(isbot(request.headers.get('User-Agent'))
            ? {
                onAllReady() {
                  pipeable.pipe(passthrough)
                },
              }
            : {
                onShellReady() {
                  pipeable.pipe(passthrough)
                },
              }),
          onShellError(err) {
            throw err
          },
        },
      )

      return passthrough
    }

    return undefined
  })()

  // Add our Router transform to the stream
  const transforms = [transformStreamWithRouter(router)]

  if (stream) {
    const transformedStream = transforms.reduce(
      (stream, transform) => (stream as any).pipe(transform),
      stream,
    )

    return new Response(transformedStream as BodyInit, {
      status: router.state.statusCode,
      headers: responseHeaders,
    })
  }

  throw new Error(
    'No renderToReadableStream or renderToPipeableStream found in react-dom/server. Ensure you are using a version of react-dom that supports streaming.',
  )
}
