import { PassThrough } from 'node:stream'
import ReactDOMServer from 'react-dom/server'
import { isbot } from 'isbot'
import {
  transformPipeableStreamWithRouter,
  transformReadableStreamWithRouter,
} from '@tanstack/router-core/ssr/server'
import type { AnyRouter } from '@tanstack/router-core'
import type { ReadableStream } from 'node:stream/web'
import type { ReactNode } from 'react'

export const renderRouterToStream = async ({
  request,
  router,
  responseHeaders,
  children,
}: {
  request: Request
  router: AnyRouter
  responseHeaders: Headers
  children: ReactNode
}) => {
  if (typeof ReactDOMServer.renderToReadableStream === 'function') {
    const stream = await ReactDOMServer.renderToReadableStream(children, {
      signal: request.signal,
    })

    if (isbot(request.headers.get('User-Agent'))) {
      await stream.allReady
    }

    const responseStream = transformReadableStreamWithRouter(
      router,
      stream as unknown as ReadableStream,
    )
    return new Response(responseStream as any, {
      status: router.state.statusCode,
      headers: responseHeaders,
    })
  }

  if (typeof ReactDOMServer.renderToPipeableStream === 'function') {
    const reactAppPassthrough = new PassThrough()

    try {
      const pipeable = ReactDOMServer.renderToPipeableStream(children, {
        ...(isbot(request.headers.get('User-Agent'))
          ? {
              onAllReady() {
                pipeable.pipe(reactAppPassthrough)
              },
            }
          : {
              onShellReady() {
                pipeable.pipe(reactAppPassthrough)
              },
            }),
        onError: (error, info) => {
          console.error('Error in renderToPipeableStream:', error, info)
        },
      })
    } catch (e) {
      console.error('Error in renderToPipeableStream:', e)
    }

    const responseStream = transformPipeableStreamWithRouter(
      router,
      reactAppPassthrough,
    )
    return new Response(responseStream as any, {
      status: router.state.statusCode,
      headers: responseHeaders,
    })
  }

  throw new Error(
    'No renderToReadableStream or renderToPipeableStream found in react-dom/server. Ensure you are using a version of react-dom that supports streaming.',
  )
}
