import { pipeline } from 'node:stream/promises'
import { type AnyRouter, createMemoryHistory } from '@tanstack/react-router'
import { serializeLoaderData } from '../client/serialization'
import {
  mergeHeaders,
  serverFnPayloadTypeHeader,
  serverFnReturnTypeHeader,
} from '../client'
import type { StartHandler } from './defaultStreamHandler'
import type { Manifest } from '@tanstack/react-router'

export type RequestHandler<TRouter extends AnyRouter> = (ctx: {
  request: Response
  response: Response
  router: TRouter
  responseHeaders: Headers
}) => Promise<Response>

export type CustomizeRequestHandler<TRouter extends AnyRouter> = (
  cb: StartHandler<TRouter>,
) => Promise<void>

export function createRequestHandler<TRouter extends AnyRouter>({
  createRouter,
  req,
  res,
  getRouterManifest,
}: {
  createRouter: () => TRouter
  req: any
  res: any
  getRouterManifest?: () => Manifest
}): CustomizeRequestHandler<TRouter> {
  return async (cb) => {
    const href = req.originalUrl

    // Create a history for the router
    const history = createMemoryHistory({
      initialEntries: [href],
    })

    const router = createRouter()

    router.serializeLoaderData = serializeLoaderData as any

    if (getRouterManifest) {
      router.manifest = getRouterManifest()
    }

    // Update the router with the history and context
    router.update({
      history,
    })

    await router.load()

    const responseHeaders = getRequestHeaders({
      router,
    })

    const requestUrl = new URL(req.originalUrl, 'http://localhost').href

    const response = await cb({
      request: new Request(requestUrl, {
        method: req.method,
        headers: (() => {
          const headers = new Headers()
          for (const [key, value] of Object.entries(req.headers)) {
            headers.append(key, value as any)
          }
          return headers
        })(),
        body: req.body,
        redirect: 'manual',
      }),
      router,
      responseHeaders,
    })

    res.statusMessage = response.statusText
    res.status(response.status)
    // Set the response headers
    response.headers.forEach((value, name) => {
      res.setHeader(name, value)
    })

    // Pipe the web response body to the express response

    await pipeline(response.body as any, res)
  }
}

function getRequestHeaders(opts: { router: AnyRouter }): Headers {
  let headers = mergeHeaders(
    {
      'Content-Type': 'text/html; charset=UTF-8',
    },
    ...opts.router.state.matches.map((match) => {
      return match.headers
    }),
  )

  // Handle Redirects
  const { redirect } = opts.router.state

  if (redirect) {
    headers = mergeHeaders(headers, redirect.headers, {
      Location: redirect.href,
    })
  }

  // Remove server function headers
  ;[serverFnReturnTypeHeader, serverFnPayloadTypeHeader].forEach((header) => {
    headers.delete(header)
  })

  return headers
}
