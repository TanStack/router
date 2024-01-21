import * as React from 'react'
import ReactDOMServer, { PipeableStream } from 'react-dom/server'
import { createMemoryHistory, isNotFound } from '@tanstack/react-router'
import { ServerResponse } from 'http'
import express from 'express'
import { StartServer } from '@tanstack/react-router-server/server'
import { createRouter } from './router'

// index.js
import './fetch-polyfill'

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
      ...router.options.context,
      head: opts.head,
    },
  })

  await router.load()

  // Render the app
  let statusCode = 200
  let stream!: PipeableStream
  // try {
  await new Promise<void>((resolve) => {
    stream = ReactDOMServer.renderToPipeableStream(
      <StartServer router={router} />,
      {
        onAllReady: resolve,
        onError(e) {
          console.log('onError', e)
          if (isNotFound(e)) {
            statusCode = 404
          } else {
            statusCode = 500
            throw e
          }
        },
      },
    )
  })
  // } catch (e) {
  //   if (isNotFound(e)) {
  //     statusCode = 404
  //     // appHtml = ReactDOMServer.renderToString(
  //     //   React.createElement(router.getNotFoundComponent()),
  //     // )
  //   } else {
  //     throw e
  //   }
  // }

  opts.res.statusCode = statusCode
  opts.res.setHeader('Content-Type', 'text/html')
  stream.pipe(opts.res)
}
