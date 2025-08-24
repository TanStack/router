import { pipeline } from 'node:stream/promises'
import {
  RouterServer,
  createRequestHandler,
  renderRouterToString,
} from '@tanstack/react-router/ssr/server'
import { SearchPersistenceStore } from '@tanstack/react-router'
import { createRouter } from './router'
import type express from 'express'
import './fetch-polyfill'

export async function render({
  req,
  res,
  head,
}: {
  head: string
  req: express.Request
  res: express.Response
}) {
  // Convert the express request to a fetch request
  const url = new URL(req.originalUrl || req.url, 'https://localhost:3000').href

  const request = new Request(url, {
    method: req.method,
    headers: (() => {
      const headers = new Headers()
      for (const [key, value] of Object.entries(req.headers)) {
        headers.set(key, value as any)
      }
      return headers
    })(),
  })

  // Create a request handler
  const handler = createRequestHandler({
    request,
    createRouter: () => {
      const router = createRouter()

      // For SSR: Create a fresh SearchPersistenceStore per request to avoid cross-request contamination
      const requestSearchStore = new SearchPersistenceStore()

      // Update each router instance with the head info from vite and per-request store
      router.update({
        context: {
          ...router.options.context,
          head: head,
        },
        searchPersistenceStore: requestSearchStore,
      })
      return router
    },
  })

  // Let's use the default stream handler to create the response
  const response = await handler(({ responseHeaders, router }) =>
    renderRouterToString({
      responseHeaders,
      router,
      children: <RouterServer router={router} />,
    }),
  )

  // Convert the fetch response back to an express response
  res.statusMessage = response.statusText
  res.status(response.status)

  response.headers.forEach((value, name) => {
    res.setHeader(name, value)
  })

  // Stream the response body
  return pipeline(response.body as any, res)
}
