import * as Solid from 'solid-js/web'
import {
  UnheadContext,
  createHead,
  transformHtmlTemplate,
} from '@unhead/solid-js/server'
import { makeSsrSerovalPlugin } from '@tanstack/router-core'
import type { AnyRouter } from '@tanstack/router-core'
import type { JSXElement } from 'solid-js'

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
    const serializationAdapters =
      (router.options as any)?.serializationAdapters ||
      (router.options.ssr as any)?.serializationAdapters
    const serovalPlugins = serializationAdapters?.map((adapter: any) => {
      const plugin = makeSsrSerovalPlugin(adapter, { didRun: false })
      return plugin
    })

    const head = createHead()
    let html = Solid.renderToString(
      () => (
        <UnheadContext.Provider value={head}>
          {children()}
        </UnheadContext.Provider>
      ),
      {
        nonce: router.options.ssr?.nonce,
        plugins: serovalPlugins,
      } as any,
    )
    html = await transformHtmlTemplate(head, html)
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
