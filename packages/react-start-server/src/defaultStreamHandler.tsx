import { PassThrough } from 'node:stream'
import { isbot } from 'isbot'
import ReactDOMServer from 'react-dom/server'

import {
  defineHandlerCallback,
  transformPipeableStreamWithRouter,
  transformReadableStreamWithRouter,
} from '@tanstack/start-server-core'
import { StartServer } from './StartServer'

import type { ReadableStream } from 'node:stream/web'

export const defaultStreamHandler = defineHandlerCallback(
  async ({ request, router, responseHeaders }) => {
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
        const pipeable = ReactDOMServer.renderToPipeableStream(
          <StartServer router={router} />,
          {
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
          },
        )
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
  },
)
