import * as React from 'react'
import ReactDOMServer, { PipeableStream } from 'react-dom/server'
import {
  NotFoundOptions,
  createMemoryHistory,
  isNotFound,
} from '@tanstack/react-router'
import {
  StartServer,
  transformStreamWithRouter,
  GlobalNotFound,
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
  let statusCode = 200
  let globalNotFoundError: NotFoundOptions | undefined = undefined

  // Clever way to get the right callback. Thanks Remix!
  const callbackName = isbot(opts.req.headers['user-agent'])
    ? 'onAllReady'
    : 'onShellReady'

  // Render the app to a readable stream
  let stream!: PipeableStream

  await new Promise<void>((resolve) => {
    const results = ReactDOMServer.renderToPipeableStream(
      <StartServer router={router} />,
      {
        [callbackName]: () => {
          resolve()
        },
        onError: (err) => {
          if (isNotFound(err)) {
            statusCode = 404
            // TODO: type
            if ((err as { global: boolean }).global) {
              // Abort the rendering of the current page in order to render the 404 page
              results.abort()
              globalNotFoundError = err as NotFoundOptions
            }
          } else {
            statusCode = 500
            console.log(err)
          }
        },
      },
    )
    stream = results
  })

  opts.res.setHeader('Content-Type', 'text/html')
  opts.res.statusCode = statusCode

  if (globalNotFoundError) {
    await new Promise<void>((resolve) => {
      stream = ReactDOMServer.renderToPipeableStream(
        <GlobalNotFound
          router={router}
          globalNotFoundError={globalNotFoundError}
        />,
        {
          onAllReady: resolve,
          onError(err) {
            statusCode = 500
            console.log(err)
          },
        },
      )
    })
  }

  // Add our Router transform to the stream
  const transforms = [transformStreamWithRouter(router)]

  const transformedStream = transforms.reduce(
    (stream, transform) => stream.pipe(transform as any),
    stream,
  )

  transformedStream.pipe(opts.res)
}
