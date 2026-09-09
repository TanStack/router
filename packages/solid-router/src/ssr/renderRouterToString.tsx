import * as Solid from 'solid-js/web'
import {
  getSsrStatus,
  transformHtmlStringWithRouter,
} from '@tanstack/router-core/ssr/server'
import { getSolidRenderOptions } from './renderOptions'
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
  try {
    const html = await transformHtmlStringWithRouter(
      router,
      Solid.renderToString(children, getSolidRenderOptions(router)),
    )
    return new Response(html, {
      status: getSsrStatus(router),
      headers: responseHeaders,
    })
  } catch (error) {
    console.error('Render to string error:', error)
    return new Response('Internal Server Error', {
      status: 500,
      headers: responseHeaders,
    })
  } finally {
    router.serverSsr?.cleanup()
  }
}
