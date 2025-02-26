import { isbot } from 'isbot'
import * as Solid from 'solid-js/web'

import { StartServer } from './StartServer'

import { transformReadableStreamWithRouter } from './transformStreamWithRouter'

import { defineHandlerCallback } from './handlerCallback'
import type { ReadableStream } from 'node:stream/web'

export const defaultStreamHandler = defineHandlerCallback(
  async ({ request, router, responseHeaders }) => {
    const { writable, readable } = new TransformStream()

    const stream = Solid.renderToStream(() => <StartServer router={router} />)

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
  },
)
