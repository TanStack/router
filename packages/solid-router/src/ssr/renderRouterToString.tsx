import * as Solid from 'solid-js/web'
import { renderSsrHtmlResponse } from '@tanstack/router-core/ssr/server'
import { getSolidRenderOptions } from './renderOptions'
import { deferHydrationScripts } from './deferHydrationScripts'
import type { AnyRouter } from '@tanstack/router-core'
import type { JSXElement } from 'solid-js'

export const renderRouterToString = async ({
  router,
  responseHeaders,
  children,
}: {
  router: AnyRouter
  responseHeaders: Headers
  children: () => JSXElement
}) => {
  const tracker = { didRun: false }
  return renderSsrHtmlResponse({
    router,
    responseHeaders,
    render: () => {
      const html = Solid.renderToString(
        children,
        getSolidRenderOptions(router, tracker),
      )
      return tracker.didRun ? deferHydrationScripts(html) : html
    },
  })
}
