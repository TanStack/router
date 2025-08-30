import ReactDOMServer from 'react-dom/server'
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
    let html = ReactDOMServer.renderToString(children)

    // Collect HTML attributes from all route matches
    const htmlAttributes: Record<string, string> = {}
    for (const match of router.state.matches) {
      if (match.html) {
        Object.assign(htmlAttributes, match.html)
      }
    }

    // Convert HTML attributes to string
    const htmlAttrsString = Object.entries(htmlAttributes)
      .map(([key, value]) => `${key}="${value}"`)
      .join(' ')

    // Apply HTML attributes to the html element
    if (htmlAttrsString) {
      html = html.replace(/<html([^>]*)>/, `<html$1 ${htmlAttrsString}>`)
    }

    const injectedHtml = await Promise.all(router.serverSsr!.injectedHtml).then(
      (htmls) => htmls.join(''),
    )
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
}
