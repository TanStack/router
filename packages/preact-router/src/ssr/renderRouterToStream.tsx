import { renderToStringAsync } from 'preact-render-to-string'
import type { AnyRouter } from '@tanstack/router-core'
import type { VNode } from 'preact'

export const renderRouterToStream = async ({
  router,
  responseHeaders,
  children,
}: {
  request: Request
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
    console.error('Render to stream error:', error)
    return new Response('Internal Server Error', {
      status: 500,
      headers: responseHeaders,
    })
  } finally {
    router.serverSsr?.cleanup()
  }
}
