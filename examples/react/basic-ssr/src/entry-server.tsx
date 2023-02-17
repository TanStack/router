import * as React from 'react'
import ReactDOMServer from 'react-dom/server'
import { createMemoryHistory, Router } from '@tanstack/router'
import jsesc from 'jsesc'
import { ServerResponse } from 'http'
import { createLoaderClient } from './loaderClient'
import express from 'express'

// index.js
import './fetch-polyfill'
import { App } from '.'
import { routeTree } from './routeTree'

async function getRouter(opts: { url: string }) {
  const loaderClient = createLoaderClient()

  const router = new Router({
    routeTree: routeTree,
    context: {
      loaderClient,
    },
  })

  const memoryHistory = createMemoryHistory({
    initialEntries: [opts.url],
  })

  router.update({
    history: memoryHistory,
  })

  return { router, loaderClient }
}

export async function render(opts: {
  url: string
  head: string
  req: express.Request
  res: ServerResponse
}) {
  const { router, loaderClient } = await getRouter(opts)

  await router.load()

  const dehydratedRouter = router.dehydrate()
  const dehydratedLoaderClient = loaderClient.dehydrate()

  let head = `<script class="__DEHYDRATED__">
    window.__DEHYDRATED__ = JSON.parse(
      ${jsesc(
        JSON.stringify({
          dehydratedRouter,
          dehydratedLoaderClient,
        }),
        {
          isScriptContext: true,
          wrap: true,
          json: true,
        },
      )}
    )
  </script>
`

  const appHtml = ReactDOMServer.renderToString(
    <App router={router} loaderClient={loaderClient} head={head} />,
  )

  opts.res.statusCode = 200
  opts.res.setHeader('Content-Type', 'text/html')
  opts.res.end(`<!DOCTYPE html>${appHtml}`)
}
