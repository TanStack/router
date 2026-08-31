import * as Vue from 'vue'
import { renderToString as vueRenderToString } from 'vue/server-renderer'
import {
  getSsrStatus,
  transformHtmlStringWithRouter,
} from '@tanstack/router-core/ssr/server'
import { warnUnlessHtmlRoot } from './renderRouterToStream'
import type { AnyRouter } from '@tanstack/router-core'
import type { Component } from 'vue'

export const renderRouterToString = async ({
  router,
  responseHeaders,
  App,
}: {
  router: AnyRouter
  responseHeaders: Headers
  App: Component
}) => {
  try {
    const app = Vue.createSSRApp(App, { router })
    const rendered = await vueRenderToString(app)
    warnUnlessHtmlRoot(rendered)

    const html = await transformHtmlStringWithRouter(router, rendered)

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
