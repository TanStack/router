import { PassThrough } from 'node:stream'
import { isbot } from 'isbot'
import * as Solid from 'solid-js/web'

import { StartServer } from './StartServer'

import {
  transformPipeableStreamWithRouter,
  transformReadableStreamWithRouter,
} from './transformStreamWithRouter'

import { defineHandlerCallback } from './handlerCallback'
import type { ReadableStream } from 'node:stream/web'

export const defaultStreamHandler = defineHandlerCallback(
  async ({ request, router, responseHeaders }) => {
    if (typeof Solid.renderToStream === 'function') {
      const stream = await Solid.renderToStream(()=>
        <StartServer router={router} />
      )

      const responseStream = transformReadableStreamWithRouter(
        router,
        stream as unknown as ReadableStream,
      )
      return new Response(responseStream as any, {
        status: router.state.statusCode,
        headers: responseHeaders,
      })
    }

    if (typeof Solid.renderToStream === 'function') {
      const reactAppPassthrough = new PassThrough()

      try {
        const pipeable = Solid.renderToStream(
          ()=><StartServer router={router} />,
          {
            ...(isbot(request.headers.get('User-Agent'))
              ? {
                  onCompleteAll() {
                    pipeable.pipe(reactAppPassthrough)
                  },
                }
              : {
                  onCompleteShell() {
                    pipeable.pipe(reactAppPassthrough)
                  },
                }),
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
