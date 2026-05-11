import type { Awaitable } from '@tanstack/router-core'

export type HandlerInlineCssOption =
  | boolean
  | ((ctx: { request: Request }) => Awaitable<boolean>)

export async function resolveInlineCssForRequest(opts: {
  request: Request
  handlerInlineCss: HandlerInlineCssOption | undefined
  requestInlineCss: boolean | undefined
}) {
  if (opts.requestInlineCss !== undefined) {
    return opts.requestInlineCss
  }

  if (typeof opts.handlerInlineCss === 'function') {
    return await opts.handlerInlineCss({ request: opts.request })
  }

  return opts.handlerInlineCss ?? true
}
