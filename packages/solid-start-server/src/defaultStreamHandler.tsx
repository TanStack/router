import { isbot } from 'isbot'
import * as Solid from 'solid-js/web'

import {
  defineHandlerCallback,
  transformReadableStreamWithRouter,
} from '@tanstack/start-server-core'

import { StartServer } from './StartServer'
import type { ReadableStream } from 'node:stream/web'

export const defaultStreamHandler = defineHandlerCallback(
  async ({ request, router, responseHeaders, RootDocument }) => {
    const { writable, readable } = new TransformStream()

    const stream = Solid.renderToStream(() => (
      <RootDocument>
        <StartServer router={router} />
      </RootDocument>
    ))

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
