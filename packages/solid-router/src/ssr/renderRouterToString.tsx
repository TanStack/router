import * as Solid from 'solid-js/web'
import type { JSXElement } from 'solid-js'
import type { AnyRouter } from '@tanstack/router-core'

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
    let html = Solid.renderToString(children)
    const injectedHtml = await Promise.all(router.serverSsr!.injectedHtml).then(
      (htmls) => htmls.join(''),
    )
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
}
