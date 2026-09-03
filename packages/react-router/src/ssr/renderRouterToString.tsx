import ReactDOMServer from 'react-dom/server'
import { transformHtmlStringWithRouter } from '@tanstack/router-core/ssr/server'
import type { ReactNode } from 'react'
import type { AnyRouter } from '@tanstack/router-core'

export const renderRouterToString = async ({
  router,
  responseHeaders,
  children,
}: {
  router: AnyRouter
  responseHeaders: Headers
  children: ReactNode
}) => {
  try {
    const html = await transformHtmlStringWithRouter(
      router,
      ReactDOMServer.renderToString(children),
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
