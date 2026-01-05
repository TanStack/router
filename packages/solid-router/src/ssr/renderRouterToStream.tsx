import { TransformStream } from 'node:stream/web'
import {
  HydrationScript,
  NoHydration,
  renderToStream,
  renderToString,
  ssr,
} from 'solid-js/web'
import {
  HeadStream,
  UnheadContext,
  createStreamableHead,
} from '@unhead/solid-js/stream/server'
import { isbot } from 'isbot'
import { transformReadableStreamWithRouter } from '@tanstack/router-core/ssr/server'
import { makeSsrSerovalPlugin } from '@tanstack/router-core'
import type { JSXElement } from 'solid-js'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'
import type { AnyRouter } from '@tanstack/router-core'
import type { SSRHeadPayload } from 'unhead/types'

export const renderRouterToStream = async ({
  request,
  router,
  responseHeaders,
  children,
  document,
}: {
  request: Request
  router: AnyRouter
  responseHeaders: Headers
  children: () => JSXElement
  document?: boolean
}) => {
  const docType = ssr('<!DOCTYPE html>')

  const serializationAdapters =
    (router.options as any)?.serializationAdapters ||
    (router.options.ssr as any)?.serializationAdapters
  const serovalPlugins = serializationAdapters?.map((adapter: any) => {
    const plugin = makeSsrSerovalPlugin(adapter, { didRun: false })
    return plugin
  })

  const { head, onCompleteShell } = createStreamableHead()
  let shellState: SSRHeadPayload | undefined
  let resolveShellState: ((state: SSRHeadPayload) => void) | undefined
  const shellStateReady = new Promise<SSRHeadPayload>((resolve) => {
    resolveShellState = resolve
  })
  const originalRender = head.render.bind(head)
  head.render = (...args) => {
    const state = originalRender(...args) as SSRHeadPayload
    shellState ??= state
    return state
  }
  const onCompleteShellWithState = () => {
    onCompleteShell()
    if (!shellState) {
      shellState = head.render() as SSRHeadPayload
    }
    resolveShellState?.(shellState)
  }

  const template = renderToString(
    () => (
      <NoHydration>
        {docType as any}
        <html>
          <head></head>
          <body></body>
        </html>
      </NoHydration>
    ),
    {
      nonce: router.options.ssr?.nonce,
    } as any,
  )
  const hydrationScript = renderToString(() => <HydrationScript />, {
    nonce: router.options.ssr?.nonce,
  } as any)
  const stream = renderToStream(
    () => (
      <UnheadContext.Provider value={head}>
        {document ? (
          <>
            {docType as any}
            {children()}
          </>
        ) : (
          <>
            {HeadStream() as unknown as JSXElement}
            {children()}
          </>
        )}
      </UnheadContext.Provider>
    ),
    {
      nonce: router.options.ssr?.nonce,
      plugins: serovalPlugins,
      onCompleteShell: onCompleteShellWithState,
    } as any,
  )

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  stream.pipeTo(writable)

  if (isbot(request.headers.get('User-Agent'))) {
    await stream
  }

  const resolvedShellState = await shellStateReady
  const wrappedStream = document
    ? injectHeadIntoDocumentStream(
        readable as unknown as ReadableStream<Uint8Array>,
        resolvedShellState,
        getStreamKey(head),
      )
    : wrapBodyStream(
        readable as unknown as ReadableStream<Uint8Array>,
        template,
        {
          ...resolvedShellState,
          headTags: `${hydrationScript}${resolvedShellState.headTags}`,
        },
        getStreamKey(head),
      )

  const responseStream = transformReadableStreamWithRouter(
    router,
    wrappedStream as unknown as NodeReadableStream,
  )
  return new Response(responseStream as any, {
    status: router.state.statusCode,
    headers: responseHeaders,
  })
}

const DEFAULT_STREAM_KEY = '__unhead__'

function getStreamKey(head: { resolvedOptions?: { experimentalStreamKey?: string } }) {
  return head.resolvedOptions?.experimentalStreamKey ?? DEFAULT_STREAM_KEY
}

function createBootstrapScript(streamKey: string) {
  return `<script>window.${streamKey}={_q:[],push(e){this._q.push(e)}}</script>`
}

function injectHeadIntoDocumentStream(
  stream: ReadableStream<Uint8Array>,
  shellState: SSRHeadPayload,
  streamKey: string,
) {
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  const headTags = `${createBootstrapScript(streamKey)}${shellState.headTags}`
  const bodyTagsOpen = shellState.bodyTagsOpen
  const bodyTags = shellState.bodyTags
  const htmlAttrs = shellState.htmlAttrs
  const bodyAttrs = shellState.bodyAttrs
  const closeTag = '</body>'

  return new ReadableStream({
    async start(controller) {
      const reader = stream.getReader()
      let buffer = ''
      let shellFlushed = false
      let bodyTagsInjected = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        if (!shellFlushed) {
          const bodyOpenEnd = findBodyOpenEnd(buffer)
          if (bodyOpenEnd === -1) {
            continue
          }
          const shell = buffer.slice(0, bodyOpenEnd)
          const rest = buffer.slice(bodyOpenEnd)
          const injectedShell = injectShell(shell, {
            headTags,
            bodyTagsOpen,
            htmlAttrs,
            bodyAttrs,
          })
          controller.enqueue(encoder.encode(injectedShell))
          buffer = rest
          shellFlushed = true
        }

        if (shellFlushed) {
          if (!bodyTagsInjected && bodyTags) {
            const index = buffer.toLowerCase().indexOf(closeTag)
            if (index !== -1) {
              const beforeClose = buffer.slice(0, index)
              const afterClose = buffer.slice(index)
              controller.enqueue(encoder.encode(beforeClose + bodyTags))
              buffer = afterClose
              bodyTagsInjected = true
            } else if (buffer.length > closeTag.length) {
              const safeIndex = buffer.length - closeTag.length
              controller.enqueue(encoder.encode(buffer.slice(0, safeIndex)))
              buffer = buffer.slice(safeIndex)
            }
          } else if (buffer.length) {
            controller.enqueue(encoder.encode(buffer))
            buffer = ''
          }
        }
      }

      buffer += decoder.decode()
      if (!shellFlushed) {
        const injected = injectShell(buffer, {
          headTags,
          bodyTagsOpen,
          htmlAttrs,
          bodyAttrs,
        })
        controller.enqueue(encoder.encode(injected))
      } else if (!bodyTagsInjected && bodyTags) {
        const index = buffer.toLowerCase().indexOf(closeTag)
        if (index !== -1) {
          controller.enqueue(
            encoder.encode(
              buffer.slice(0, index) + bodyTags + buffer.slice(index),
            ),
          )
        } else {
          controller.enqueue(encoder.encode(buffer + bodyTags))
        }
      } else if (buffer.length) {
        controller.enqueue(encoder.encode(buffer))
      }

      controller.close()
    },
  })
}

function wrapBodyStream(
  stream: ReadableStream<Uint8Array>,
  template: string,
  shellState: SSRHeadPayload,
  streamKey: string,
) {
  const encoder = new TextEncoder()
  const { shell, end } = splitTemplate(template)
  const headTags = `${createBootstrapScript(streamKey)}${shellState.headTags}`
  const injectedShell = injectShell(shell, {
    headTags,
    bodyTagsOpen: shellState.bodyTagsOpen,
    htmlAttrs: shellState.htmlAttrs,
    bodyAttrs: shellState.bodyAttrs,
  })

  return new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(injectedShell))
      const reader = stream.getReader()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        controller.enqueue(value)
      }

      controller.enqueue(
        encoder.encode(`${shellState.bodyTags ?? ''}${end}`),
      )
      controller.close()
    },
  })
}

function splitTemplate(template: string) {
  const bodyOpenEnd = findBodyOpenEnd(template)
  const lower = template.toLowerCase()
  const bodyCloseStart = lower.indexOf('</body>')
  if (bodyOpenEnd === -1 || bodyCloseStart === -1) {
    return { shell: template, end: '' }
  }
  return {
    shell: template.slice(0, bodyOpenEnd),
    end: template.slice(bodyCloseStart),
  }
}

function findBodyOpenEnd(html: string) {
  const lower = html.toLowerCase()
  const start = lower.indexOf('<body')
  if (start === -1) return -1
  const end = html.indexOf('>', start)
  if (end === -1) return -1
  return end + 1
}

function injectShell(
  html: string,
  {
    headTags,
    bodyTagsOpen,
    htmlAttrs,
    bodyAttrs,
  }: {
    headTags: string
    bodyTagsOpen: string
    htmlAttrs: string
    bodyAttrs: string
  },
) {
  let result = html
  if (headTags) {
    result = insertBeforeClosingTag(result, 'head', headTags)
  }
  if (htmlAttrs) {
    result = appendAttrsToTag(result, 'html', htmlAttrs)
  }
  if (bodyAttrs) {
    result = appendAttrsToTag(result, 'body', bodyAttrs)
  }
  if (bodyTagsOpen) {
    result = insertAfterOpeningTag(result, 'body', bodyTagsOpen)
  }
  return result
}

function appendAttrsToTag(html: string, tag: string, attrs: string) {
  if (!attrs) return html
  const lower = html.toLowerCase()
  const openTag = `<${tag}`
  const start = lower.indexOf(openTag)
  if (start === -1) return html
  const end = html.indexOf('>', start)
  if (end === -1) return html
  const normalizedAttrs = attrs.startsWith(' ') ? attrs : ` ${attrs}`
  return html.slice(0, end) + normalizedAttrs + html.slice(end)
}

function insertAfterOpeningTag(html: string, tag: string, content: string) {
  if (!content) return html
  const lower = html.toLowerCase()
  const openTag = `<${tag}`
  const start = lower.indexOf(openTag)
  if (start === -1) return html
  const end = html.indexOf('>', start)
  if (end === -1) return html
  return html.slice(0, end + 1) + content + html.slice(end + 1)
}

function insertBeforeClosingTag(html: string, tag: string, content: string) {
  if (!content) return html
  const lower = html.toLowerCase()
  const closeTag = `</${tag}`
  const index = lower.indexOf(closeTag)
  if (index === -1) return html
  return html.slice(0, index) + content + html.slice(index)
}
