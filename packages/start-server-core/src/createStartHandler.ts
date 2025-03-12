import { mergeHeaders } from '@tanstack/start-client-core'
import { getResponseHeaders } from 'h3'
import type { HandlerCallback } from './handlerCallback'
import type { EventHandlerResponse, H3Event, eventHandler } from 'h3'
import type { AnyRouter } from '@tanstack/router-core'

export type CustomizeStartHandler<
  TRouter extends AnyRouter,
  TResponse extends EventHandlerResponse = EventHandlerResponse,
> = (cb: HandlerCallback<TRouter, TResponse>) => ReturnType<typeof eventHandler>

export function getStartResponseHeaders(opts: { event: H3Event; router: AnyRouter }) {
  let headers = mergeHeaders(
    getResponseHeaders(opts.event),
    (opts.event as any).___ssrRpcResponseHeaders,
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
  return headers
}
