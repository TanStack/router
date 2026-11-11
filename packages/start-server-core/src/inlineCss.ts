import type { Awaitable } from '@tanstack/router-core'

export type HandlerInlineCssOption =
  | boolean
  | ((ctx: { request: Request }) => Awaitable<boolean>)

/**
 * The inline-CSS choice that needs no handler callback: a request override
 * wins, then a static handler option, then the default. Undefined when a
 * handler callback has to decide.
 */
export function getStaticInlineCss(
  requestInlineCss: boolean | undefined,
  handlerInlineCss: HandlerInlineCssOption | undefined,
): boolean | undefined {
  if (requestInlineCss !== undefined) {
    return requestInlineCss
  }
  if (typeof handlerInlineCss === 'function') {
    return undefined
  }
  return handlerInlineCss ?? true
}

export async function resolveInlineCssForRequest(opts: {
  request: Request
  handlerInlineCss: HandlerInlineCssOption | undefined
  requestInlineCss: boolean | undefined
}) {
  const inlineCss = getStaticInlineCss(
    opts.requestInlineCss,
    opts.handlerInlineCss,
  )
  if (inlineCss !== undefined) {
    return inlineCss
  }
  // Only a handler callback leaves the choice open.
  return await (
    opts.handlerInlineCss as Exclude<HandlerInlineCssOption, boolean>
  )({ request: opts.request })
}
