import * as Solid from 'solid-js/web'
import { defineHandlerCallback } from '@tanstack/start-server-core'
import { StartServer } from './StartServer'

export const defaultRenderHandler = defineHandlerCallback(
  async ({ router, responseHeaders, RootDocument }) => {
    try {
      let html = Solid.renderToString(() => (
        <RootDocument>
          <StartServer router={router} />
        </RootDocument>
      ))
      const injectedHtml = await Promise.all(
        router.serverSsr!.injectedHtml,
      ).then((htmls) => htmls.join(''))
      html = html.replace(`</body>`, `${injectedHtml}</body>`)
      return new Response(html, {
        status: router.state.statusCode,
        headers: responseHeaders,
      })
    } catch (error) {
      console.error('Render to string error:', error)
      return new Response('Internal Server Error', {
        status: 500,
        headers: responseHeaders,
      })
    }
  },
)
