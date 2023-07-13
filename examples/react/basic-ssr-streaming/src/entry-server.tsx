import * as React from 'react'
import ReactDOMServer from 'react-dom/server'
import { createMemoryHistory } from '@tanstack/router'
import { StartServer } from '@tanstack/react-start/server'
import isbot from 'isbot'
import { ServerResponse } from 'http'
import express from 'express'

// index.js
import './fetch-polyfill'
import { createRouter } from './router'

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
      ...router.context,
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

  const stream = ReactDOMServer.renderToPipeableStream(
    <StartServer router={router} />,
    {
      [callbackName]: () => {
        opts.res.statusCode = didError ? 500 : 200
        opts.res.setHeader('Content-type', 'text/html')
        stream.pipe(opts.res)
      },
      onError: (err) => {
        didError = true
        console.log(err)
      },
    },
  )

  setTimeout(() => stream.abort(), 10000)
}
