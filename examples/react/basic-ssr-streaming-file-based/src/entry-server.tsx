import { PassThrough } from 'stream'
import { StartServer } from '@tanstack/start/server'
import { isbot } from 'isbot'
import { renderToPipeableStream } from 'react-dom/server'
import { createMemoryHistory } from '@tanstack/react-router'
import { ApolloProvider, createQueryPreloader } from '@apollo/client'
import { createRouter } from './router'
import { makeClient } from './apollo'
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
  const client = makeClient()
  const router = createRouter(client)

  const memoryHistory = createMemoryHistory({
    initialEntries: [opts.url],
  })

  // Update the history and context
  router.update({
    history: memoryHistory,
    context: {
      // is this the official way to do this?
      ...router.options.context,
      head: opts.head,
    },
  })

  // Wait for the router to load critical data
  // (streamed data will continue to load in the background)
  await router.load()

  const passthrough = new PassThrough()

  const pipeable = renderToPipeableStream(
    <ApolloProvider client={client}>
      <StartServer router={router} />
    </ApolloProvider>,
    {
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
    },
  )

  opts.res.setHeader('Content-Type', 'text/html')
  opts.res.statusCode = router.state.statusCode
  opts.res.statusMessage = `${router.state.statusCode}`.startsWith('5')
    ? 'Internal Server Error'
    : 'OK'

  pipeable.pipe(opts.res)
}
