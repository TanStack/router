import type { AnyRouter } from '@tanstack/router-core'

export interface HandlerCallback<TRouter extends AnyRouter> {
  (ctx: {
    request: Request
    router: TRouter
    responseHeaders: Headers
  }): Response | Promise<Response>
}

export function defineHandlerCallback<TRouter extends AnyRouter>(
  handler: HandlerCallback<TRouter>,
): HandlerCallback<TRouter> {
  return handler
}
