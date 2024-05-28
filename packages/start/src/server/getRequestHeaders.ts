import {
  type EventHandlerRequest,
  type H3Event,
  getResponseHeaders,
} from 'vinxi/http'
import { mergeHeaders } from '../client/headers'
import {
  serverFnPayloadTypeHeader,
  serverFnReturnTypeHeader,
} from '../constants'
import type { AnyRouter } from '@tanstack/react-router'

export function getRequestHeaders(opts: {
  event: H3Event<EventHandlerRequest>
  router: AnyRouter
}): Headers {
  ;(opts.event as any).__tsrHeadersSent = true

  let headers = mergeHeaders(
    getResponseHeaders(opts.event),
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
