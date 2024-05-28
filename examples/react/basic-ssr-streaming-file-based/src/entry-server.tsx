import { PassThrough } from 'stream'
import { StartServer } from '@tanstack/start/server'
import { isbot } from 'isbot'
import { renderToPipeableStream } from 'react-dom/server'
import { createMemoryHistory } from '@tanstack/react-router'
import { createRouter } from './router'
import type express from 'express'
import type { ServerResponse } from 'http'

// index.js
import './fetch-polyfill'

type ReactReadableStream = ReadableStream<Uint8Array> & {
  allReady?: Promise<void> | undefined
}

export async function render(opts: {
  url: string
  head: string
  req: express.Request
  res: ServerResponse
}) {
  const router = createRouter()

  const memoryHistory = createMemoryHistory({
    initialEntries: [opts.url],
  })

  // Update the history and context
  router.update({
    history: memoryHistory,
    context: {
      head: opts.head,
    },
  })

  // Wait for the router to load critical data
  // (streamed data will continue to load in the background)
  await router.load()

  const passthrough = new PassThrough()

  const pipeable = renderToPipeableStream(<StartServer router={router} />, {
    ...(isbot(opts.req.headers['user-agent'])
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

  opts.res.setHeader('Content-Type', 'text/html')
  opts.res.statusCode = router.state.statusCode
  opts.res.statusMessage = `${router.state.statusCode}`.startsWith('5')
    ? 'Internal Server Error'
    : 'OK'

  pipeable.pipe(opts.res)
}
