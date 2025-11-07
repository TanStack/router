import { pipeline } from 'node:stream/promises'
import {
  RouterServer,
  createRequestHandler,
  renderRouterToString,
  renderRouterToStream,
} from '@tanstack/preact-router/ssr/server'
import { createRouterInstance } from './router'
import type express from 'express'

export async function render({
  req,
  res,
  head,
  useStreaming = false,
}: {
  head: string
  req: express.Request
  res: express.Response
  useStreaming?: boolean
}) {
  // Convert the express request to a fetch request
  const url = new URL(req.originalUrl || req.url, 'http://localhost:3000').href

  const request = new Request(url, {
    method: req.method,
    headers: (() => {
      const headers = new Headers()
      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === 'string') {
          headers.set(key, value)
        } else if (Array.isArray(value)) {
          value.forEach((v) => headers.append(key, String(v)))
        }
      }
      return headers
    })(),
  })

  // Create a request handler
  const handler = createRequestHandler({
    request,
    createRouter: () => {
      const router = createRouterInstance()

      // Update each router instance with the head info from vite
      router.update({
        context: {
          ...router.options.context,
          head: head,
        },
      })
      return router
    },
  })

  // Use either streaming or string rendering
  const response = await handler(({ responseHeaders, router }) =>
    useStreaming
      ? renderRouterToStream({
          request,
          responseHeaders,
          router,
          children: <RouterServer router={router} />,
        })
      : renderRouterToString({
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

