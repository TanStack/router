import * as React from 'react'
import ReactDOMServer from 'react-dom/server'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import isbot from 'isbot'
import jsesc from 'jsesc'
import { ServerResponse } from 'http'
import { createRouter } from './router'
import express from 'express'

// index.js
import './fetch-polyfill'

async function getRouter(opts: { url: string }) {
  const router = createRouter()

  router.reset()

  const memoryHistory = createMemoryHistory({
    initialEntries: [opts.url],
  })

  router.update({
    history: memoryHistory,
  })

  router.mount()() // and unsubscribe immediately

  return router
}

export async function load(opts: { url: string }) {
  const router = await getRouter(opts)

  await router.load()

  const search = router.state.currentLocation.search as {
    __data: { matchId: string }
  }

  return router.state.currentMatches.find(
    (d) => d.matchId === search.__data.matchId,
  )?.routeLoaderData
}

export async function render(opts: {
  url: string
  head: string
  req: express.Request
  res: ServerResponse
}) {
  const router = await getRouter(opts)

  await router.load()

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

  const appHtml = ReactDOMServer.renderToString(
    <RouterProvider
      router={router}
      context={{
        head: `${opts.head}${routerStateScript}`,
      }}
    />,
  )

  opts.res.statusCode = 200
  opts.res.setHeader('Content-Type', 'text/html')
  opts.res.end(`<!DOCTYPE html>${appHtml}`)
}
