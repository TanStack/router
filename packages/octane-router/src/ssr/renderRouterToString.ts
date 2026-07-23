import { renderToString as octaneRenderToString } from 'octane/server'
import type { ComponentBody } from 'octane'
import type { AnyRouter } from '@tanstack/router-core'

type RouterApp = ComponentBody<{ router: AnyRouter }>
type ServerComponent = Parameters<typeof octaneRenderToString>[0]

// eslint-disable-next-line @typescript-eslint/require-await -- framework render handlers share an async contract
export async function renderRouterToString({
  router,
  responseHeaders,
  App,
}: {
  router: AnyRouter
  responseHeaders: Headers
  App: RouterApp
}) {
  try {
    const result = octaneRenderToString(
      App as unknown as ServerComponent,
      { router },
      { nonce: router.options.ssr?.nonce },
    )
    router.serverSsr!.setRenderFinished()

    return new Response(
      finalizeBufferedHtml(
        result.html,
        result.css,
        router.serverSsr!.takeBufferedHtml(),
      ),
      {
        status: router.stores.statusCode.get(),
        headers: responseHeaders,
      },
    )
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

export function finalizeBufferedHtml(
  renderedHtml: string,
  css: string,
  injectedHtml?: string,
) {
  let html = renderedHtml

  if (css) {
    html = html.includes('</head>')
      ? html.replace('</head>', `${css}</head>`)
      : `${css}${html}`
  }

  if (injectedHtml) {
    html = html.includes('</body>')
      ? html.replace('</body>', `${injectedHtml}</body>`)
      : `${html}${injectedHtml}`
  }

  return `<!DOCTYPE html>${html}`
}
