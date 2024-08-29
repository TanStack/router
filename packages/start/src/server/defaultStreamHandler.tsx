import { PassThrough } from 'node:stream'
import { isbot } from 'isbot'
import ReactDOMServer from 'react-dom/server'
import { StartServer } from './StartServer'
import {
  transformReadableStreamWithRouter,
  transformStreamWithRouter,
} from './transformStreamWithRouter'
import type { AnyRouter } from '@tanstack/react-router'

export type HandlerCallback<TRouter extends AnyRouter> = (ctx: {
  request: Request
  router: TRouter
  responseHeaders: Headers
}) => Response | Promise<Response>

export const defaultStreamHandler: HandlerCallback<AnyRouter> = async ({
  request,
  router,
  responseHeaders,
}) => {
  if (typeof ReactDOMServer.renderToReadableStream === 'function') {
    const stream = await ReactDOMServer.renderToReadableStream(
      <StartServer router={router} />,
      {
        signal: request.signal,
        onError(error, errorInfo) {
          console.error(error, errorInfo)
        },
      },
    )

    if (isbot(request.headers.get('User-Agent'))) {
      await stream.allReady
    }

    const transforms = [transformReadableStreamWithRouter(router)]

    const transformedStream = transforms.reduce(
      (stream, transform) => stream.pipeThrough(transform),
      stream as ReadableStream,
    )

    return new Response(transformedStream, {
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

    const transforms = [transformStreamWithRouter(router)]

    const transformedStream = transforms.reduce(
      (stream, transform) => (stream as any).pipe(transform),
      passthrough,
    )

    return new Response(transformedStream as any, {
      status: router.state.statusCode,
      headers: responseHeaders,
    })
  }

  throw new Error(
    'No renderToReadableStream or renderToPipeableStream found in react-dom/server. Ensure you are using a version of react-dom that supports streaming.',
  )
}
