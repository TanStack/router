import ReactDOMServer from 'react-dom/server'
import { defineHandlerCallback } from '@tanstack/start-server-core'
import { StartServer } from './StartServer'

export const defaultRenderHandler = defineHandlerCallback(
  async ({ router, responseHeaders }) => {
    try {
      let html = ReactDOMServer.renderToString(<StartServer router={router} />)
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
