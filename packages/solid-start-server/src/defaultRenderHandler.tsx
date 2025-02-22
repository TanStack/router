import * as Solid from 'solid-js/web'
import { StartServer } from './StartServer'
import { defineHandlerCallback } from './handlerCallback'

export const defaultRenderHandler = defineHandlerCallback(
  async ({ router, responseHeaders }) => {
    try {
      let html = Solid.renderToString(() => <StartServer router={router} />)
      const injectedHtml = await Promise.all(
        router.serverSsr!.injectedHtml,
      ).then((htmls) => htmls.join(''))
      html = html.replace(`</body>`, `${injectedHtml}</body>`)
      return new Response(`<!DOCTYPE html>${html}`, {
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
