import * as React from 'react'
import ReactDOMServer from 'react-dom/server'
import { createMemoryHistory } from '@tanstack/react-router'
import jsesc from 'jsesc'
import { ServerResponse } from 'http'
import { createRouter } from './router'
import express from 'express'

// index.js
import './fetch-polyfill'
import { App } from '.'

async function getRouter(opts: { url: string }) {
  const router = createRouter()

  const memoryHistory = createMemoryHistory({
    initialEntries: [opts.url],
  })

  router.update({
    history: memoryHistory,
  })

  await router.load()

  return router
}

export async function load(opts: { url: string }) {
  const router = await getRouter(opts)

  const search = router.store.state.currentLocation.search as {
    __data: { matchId: string }
  }

  return router.store.state.currentMatches.find(
    (d) => d.id === search.__data.matchId,
  )?.store.state.routeLoaderData
}

export async function render(opts: {
  url: string
  head: string
  req: express.Request
  res: ServerResponse
}) {
  const router = await getRouter(opts)

  const routerState = router.dehydrate()

  const routerStateScript = `<script>
  window.__TANSTACK_ROUTER_STATE__ = JSON.parse(${jsesc(
    JSON.stringify(routerState),
    {
      isScriptContext: true,
      wrap: true,
      json: true,
    },
  )}
    )
    </script>`

  const context = {
    head: `${opts.head}${routerStateScript}`,
  }

  router.update({
    context,
  })

  const appHtml = ReactDOMServer.renderToString(<App router={router} />)

  opts.res.statusCode = 200
  opts.res.setHeader('Content-Type', 'text/html')
  opts.res.end(`<!DOCTYPE html>${appHtml}`)
}
