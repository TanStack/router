import * as Solid from '@solidjs/web'
import { renderSsrHtmlResponse } from '@tanstack/router-core/ssr/server'
import { getSolidRenderOptions } from './renderOptions'
import type { AnyRouter } from '@tanstack/router-core'
import type { JSX } from '@solidjs/web'

export const renderRouterToString = async ({
  router,
  responseHeaders,
  children,
  manifest,
}: {
  router: AnyRouter
  responseHeaders: Headers
  children: () => JSX.Element
  manifest?: unknown
}) => {
  return renderSsrHtmlResponse({
    router,
    responseHeaders,
    render: () =>
      Solid.renderToString(children, getSolidRenderOptions(router, manifest)),
  })
}
