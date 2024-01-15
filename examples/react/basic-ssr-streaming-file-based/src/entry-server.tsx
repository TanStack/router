import * as React from 'react'
import ReactDOMServer, { PipeableStream } from 'react-dom/server'
import { createMemoryHistory } from '@tanstack/react-router'
import {
  StartServer,
  transformStreamWithRouter,
} from '@tanstack/react-router-server/server'
import { isbot } from 'isbot'
import { ServerResponse } from 'http'
import express from 'express'

// index.js
import './fetch-polyfill'
import { createRouter } from './router'

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

  // Track errors
  let didError = false

  // Clever way to get the right callback. Thanks Remix!
  const callbackName = isbot(opts.req.headers['user-agent'])
    ? 'onAllReady'
    : 'onShellReady'

  // Render the app to a readable stream
  let stream!: PipeableStream

  await new Promise<void>((resolve) => {
    stream = ReactDOMServer.renderToPipeableStream(
      <StartServer router={router} />,
      {
        [callbackName]: () => {
          opts.res.statusCode = didError ? 500 : 200
          opts.res.setHeader('Content-Type', 'text/html')
          resolve()
        },
        onShellError(error) {
          console.log('onShellError', error)
        },
        onError: (err) => {
          didError = true
          console.log('renderToPipeableStream error:\n', err)
        },
      },
    )
  })

  // Add our Router transform to the stream
  const transforms = [transformStreamWithRouter(router)]

  const transformedStream = transforms.reduce(
    (stream, transform) => stream.pipe(transform as any),
    stream,
  )

  transformedStream.pipe(opts.res)
}
