import { renderToStringAsync } from 'preact-render-to-string'
import type { VNode } from 'preact'
import type { AnyRouter } from '@tanstack/router-core'

export const renderRouterToString = async ({
  router,
  responseHeaders,
  children,
}: {
  router: AnyRouter
  responseHeaders: Headers
  children: VNode
}) => {
  try {
    let html = await renderToStringAsync(children)
    router.serverSsr!.setRenderFinished()

    const injectedHtml = router.serverSsr!.takeBufferedHtml()
    if (injectedHtml) {
      html = html.replace(`</body>`, () => `${injectedHtml}</body>`)
    }

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
  } finally {
    router.serverSsr?.cleanup()
  }
}
