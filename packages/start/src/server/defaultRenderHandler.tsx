import ReactDOMServer from 'react-dom/server'
import { StartServer } from './StartServer'
import type { HandlerCallback } from './defaultStreamHandler'
import type { AnyRouter } from '@tanstack/react-router'

export const defaultRenderHandler: HandlerCallback<AnyRouter> = ({
  router,
  responseHeaders,
}) => {
  try {
    const html = ReactDOMServer.renderToString(<StartServer router={router} />)

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
}
