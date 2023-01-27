import * as React from 'react'
import ReactDOMServer from 'react-dom/server'
import { createMemoryHistory } from '@tanstack/react-router'
import jsesc from 'jsesc'
import { ServerResponse } from 'http'
import { createRouter } from './router'
import { createLoaderClient } from './loaderClient'
import express from 'express'

// index.js
import './fetch-polyfill'
import { App } from '.'
import { RegisteredLoaders } from '@tanstack/react-loaders'

async function getBase(opts: { url: string }) {
  const router = createRouter()
  const loaderClient = createLoaderClient()

  const memoryHistory = createMemoryHistory({
    initialEntries: [opts.url],
  })

  router.update({
    history: memoryHistory,
  })

  return { router, loaderClient }
}

export async function load(opts: { url: string }) {
  const { router, loaderClient } = await getBase(opts)

  // Get the matchIds from the query string
  const search = router.store.state.currentLocation.search as {
    __load?: {
      key: RegisteredLoaders[number]['key']
      variables?: unknown
    }
  }

  const { key, variables } = search.__load ?? {}

  // No matchIds? Throw an error
  if (!key) {
    throw new Error('No loader key provided')
  }

  return loaderClient.getLoader({ key }).load({ variables })
}

export async function render(opts: {
  url: string
  head: string
  req: express.Request
  res: ServerResponse
}) {
  const { router, loaderClient } = await getBase(opts)

  await router.load()
  const dehydratedRouter = router.dehydrate()
  const dehydratedLoaderClient = loaderClient.dehydrate()

  const routerStateScript = `<script>
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
</script>`

  const context = {
    head: `${opts.head}${routerStateScript}`,
  }

  router.update({
    context,
  })

  const appHtml = ReactDOMServer.renderToString(
    <App router={router} loaderClient={loaderClient} />,
  )

  opts.res.statusCode = 200
  opts.res.setHeader('Content-Type', 'text/html')
  opts.res.end(`<!DOCTYPE html>${appHtml}`)
}
