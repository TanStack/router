import type { EventHandlerResponse } from 'h3'
import type { AnyRouter } from '@tanstack/router-core'

export interface HandlerCallback<
  TRouter extends AnyRouter,
  TResponse extends EventHandlerResponse = EventHandlerResponse,
> {
  (ctx: {
    request: Request
    router: TRouter
    responseHeaders: Headers
  }): TResponse
}

export function defineHandlerCallback<
  TRouter extends AnyRouter,
  TResponse = EventHandlerResponse,
>(
  handler: HandlerCallback<TRouter, TResponse>,
): HandlerCallback<TRouter, TResponse> {
  return handler
}
