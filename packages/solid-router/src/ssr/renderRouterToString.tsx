import * as Solid from 'solid-js/web'
import { UnheadContext, createHead } from '@unhead/solid-js/server'
import { makeSsrSerovalPlugin } from '@tanstack/router-core'
import type { AnyRouter } from '@tanstack/router-core'
import type { JSXElement } from 'solid-js'
import type { SSRHeadPayload } from 'unhead/types'

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
    const headPayload = head.render()
    router.serverSsr!.setRenderFinished()
    html = applyHeadPayload(html, headPayload)

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

function applyHeadPayload(html: string, payload: SSRHeadPayload) {
  let updated = html
  updated = insertTagAttrs(updated, 'html', payload.htmlAttrs)
  updated = insertTagAttrs(updated, 'body', payload.bodyAttrs)
  updated = insertBeforeClose(updated, 'head', payload.headTags)
  updated = insertAfterOpen(updated, 'body', payload.bodyTagsOpen)
  updated = insertBeforeClose(updated, 'body', payload.bodyTags)
  return updated
}

function insertTagAttrs(
  html: string,
  tagName: 'html' | 'body',
  attrs: string,
) {
  const trimmed = attrs.trim()
  if (!trimmed) return html
  const openTag = `<${tagName}`
  const start = html.indexOf(openTag)
  if (start === -1) return html
  const end = html.indexOf('>', start)
  if (end === -1) return html
  const insertAt = start + openTag.length
  return `${html.slice(0, insertAt)} ${trimmed}${html.slice(insertAt)}`
}

function insertAfterOpen(html: string, tagName: 'body', content: string) {
  if (!content) return html
  const openTag = `<${tagName}`
  const start = html.indexOf(openTag)
  if (start === -1) return html
  const end = html.indexOf('>', start)
  if (end === -1) return html
  const insertAt = end + 1
  return `${html.slice(0, insertAt)}${content}${html.slice(insertAt)}`
}

function insertBeforeClose(
  html: string,
  tagName: 'head' | 'body',
  content: string,
) {
  if (!content) return html
  const closeTag = `</${tagName}>`
  const start = html.indexOf(closeTag)
  if (start === -1) return html
  return `${html.slice(0, start)}${content}${html.slice(start)}`
}
