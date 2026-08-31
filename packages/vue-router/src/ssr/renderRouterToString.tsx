import * as Vue from 'vue'
import { renderToString as vueRenderToString } from 'vue/server-renderer'
import { transformHtmlStringWithRouter } from '@tanstack/router-core/ssr/server'
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

    const html = await transformHtmlStringWithRouter(
      router,
      await vueRenderToString(app),
    )

    return new Response(html, {
      status:
        router._serverResult?.type === 'render'
          ? router._serverResult.status
          : 200,
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
