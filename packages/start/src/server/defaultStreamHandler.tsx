import { PassThrough } from 'stream'
import * as React from 'react'
import { isbot } from 'isbot'
import ReactDOMServer from 'react-dom/server'
import { StartServer } from './StartServer'
import { type RequestHandler } from './createRequestHandler'
import type { AnyRouter } from '@tanstack/react-router'

export const defaultStreamHandler: RequestHandler<AnyRouter> = async ({
  request,
  router,
  responseHeaders,
}) => {
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

    return new Response(stream, {
      status: router.state.statusCode,
      headers: responseHeaders,
    })
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

    return new Response(passthrough as any, {
      status: router.state.statusCode,
      headers: responseHeaders,
    })
  }

  throw new Error(
    'No renderToReadableStream or renderToPipeableStream found in react-dom/server. Ensure you are using a version of react-dom that supports streaming.',
  )
}
