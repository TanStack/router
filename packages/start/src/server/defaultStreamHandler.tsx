import { PassThrough } from 'stream'
import * as React from 'react'
import { isbot } from 'isbot'
import { renderToPipeableStream } from 'react-dom/server'
import { StartServer } from './StartServer'
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
  const passthrough = new PassThrough()

  const pipeable = renderToPipeableStream(<StartServer router={router} />, {
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
  })

  return new Response(passthrough as any, {
    status: router.state.statusCode,
    statusText: `${router.state.statusCode}`.startsWith('5')
      ? 'Internal Server Error'
      : 'OK',
    headers: responseHeaders,
  })
}
