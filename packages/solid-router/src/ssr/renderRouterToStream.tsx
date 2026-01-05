import { TransformStream } from 'node:stream/web'
import * as Solid from 'solid-js/web'
import {
  UnheadContext,
  createStreamableHead,
} from '@unhead/solid-js/stream/server'
import { isbot } from 'isbot'
import { transformReadableStreamWithRouter } from '@tanstack/router-core/ssr/server'
import { makeSsrSerovalPlugin } from '@tanstack/router-core'
import type { JSXElement } from 'solid-js'
import type { ReadableStream } from 'node:stream/web'
import type { AnyRouter } from '@tanstack/router-core'
import type { SSRHeadPayload } from 'unhead/types'

export const renderRouterToStream = async ({
  request,
  router,
  responseHeaders,
  children,
}: {
  request: Request
  router: AnyRouter
  responseHeaders: Headers
  children: () => JSXElement
}) => {
  const { writable, readable } = new TransformStream()

  const docType = Solid.ssr('<!DOCTYPE html>')

  const serializationAdapters =
    (router.options as any)?.serializationAdapters ||
    (router.options.ssr as any)?.serializationAdapters
  const serovalPlugins = serializationAdapters?.map((adapter: any) => {
    const plugin = makeSsrSerovalPlugin(adapter, { didRun: false })
    return plugin
  })

  const streamHead = createStreamableHead()
  const head = streamHead.head as any
  head._solidShellComplete = false
  let resolveShellState: (payload: SSRHeadPayload) => void
  const shellStatePromise = new Promise<SSRHeadPayload>((resolve) => {
    resolveShellState = resolve
  })
  const onCompleteShell = () => {
    const shellState = head.render()
    head.entries?.clear?.()
    head._solidShellComplete = true
    resolveShellState(shellState)
  }

  const stream = Solid.renderToStream(
    () => (
      <UnheadContext.Provider value={head}>
        <>
          {docType}
          {children()}
        </>
      </UnheadContext.Provider>
    ),
    {
      nonce: router.options.ssr?.nonce,
      plugins: serovalPlugins,
      onCompleteShell,
    } as any,
  )

  if (isbot(request.headers.get('User-Agent'))) {
    await stream
  }
  stream.pipeTo(writable)

  const responseStream = transformReadableStreamWithRouter(
    router,
    readable as unknown as ReadableStream,
  )
  const headStream = (responseStream).pipeThrough(
    createHeadTransform(shellStatePromise),
  )
  return new Response(headStream as any, {
    status: router.state.statusCode,
    headers: responseHeaders,
  })
}

const BODY_CLOSE_TAG = '</body>'

function createHeadTransform(payloadPromise: Promise<SSRHeadPayload>) {
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let buffer = ''

  let htmlAttrs = ''
  let bodyAttrs = ''
  let headTags = ''
  let bodyTagsOpen = ''
  let bodyTags = ''

  let htmlAttrsApplied = false
  let bodyAttrsApplied = false
  let headTagsInserted = false
  let bodyOpenInserted = false
  let bodyCloseInserted = false

  return new TransformStream<Uint8Array, Uint8Array>({
    async start() {
      const payload = await payloadPromise
      htmlAttrs = payload.htmlAttrs?.trim() ?? ''
      bodyAttrs = payload.bodyAttrs?.trim() ?? ''
      headTags = payload.headTags ?? ''
      bodyTagsOpen = payload.bodyTagsOpen ?? ''
      bodyTags = payload.bodyTags ?? ''

      htmlAttrsApplied = htmlAttrs.length === 0
      bodyAttrsApplied = bodyAttrs.length === 0
      headTagsInserted = headTags.length === 0
      bodyOpenInserted = bodyTagsOpen.length === 0
      bodyCloseInserted = bodyTags.length === 0
    },
    transform(chunk, controller) {
      const text =
        chunk instanceof Uint8Array
          ? decoder.decode(chunk, { stream: true })
          : String(chunk)
      buffer += text

      if (!htmlAttrsApplied) {
        const result = insertTagAttrs(buffer, 'html', htmlAttrs)
        buffer = result.buffer
        htmlAttrsApplied = result.done
      }

      if (!bodyAttrsApplied) {
        const result = insertTagAttrs(buffer, 'body', bodyAttrs)
        buffer = result.buffer
        bodyAttrsApplied = result.done
      }

      if (!headTagsInserted) {
        const result = insertBeforeClose(buffer, 'head', headTags)
        buffer = result.buffer
        headTagsInserted = result.done
      }

      if (!bodyOpenInserted) {
        const result = insertAfterOpen(buffer, 'body', bodyTagsOpen)
        buffer = result.buffer
        bodyOpenInserted = result.done
      }

      if (!bodyCloseInserted) {
        const result = insertBeforeClose(buffer, 'body', bodyTags)
        buffer = result.buffer
        bodyCloseInserted = result.done
      }

      const readyToFlush =
        htmlAttrsApplied &&
        bodyAttrsApplied &&
        headTagsInserted &&
        bodyOpenInserted
      if (!readyToFlush) return

      if (bodyCloseInserted) {
        if (buffer) {
          controller.enqueue(encoder.encode(buffer))
          buffer = ''
        }
        return
      }

      const tailLength = BODY_CLOSE_TAG.length - 1
      if (buffer.length > tailLength) {
        const flushLength = buffer.length - tailLength
        controller.enqueue(encoder.encode(buffer.slice(0, flushLength)))
        buffer = buffer.slice(flushLength)
      }
    },
    flush(controller) {
      buffer += decoder.decode()
      if (!bodyCloseInserted && bodyTags) {
        const closeIndex = buffer.indexOf(BODY_CLOSE_TAG)
        if (closeIndex !== -1) {
          buffer =
            buffer.slice(0, closeIndex) +
            bodyTags +
            buffer.slice(closeIndex)
        } else {
          buffer += bodyTags
        }
      }
      if (buffer) {
        controller.enqueue(encoder.encode(buffer))
      }
    },
  })
}

function insertTagAttrs(
  html: string,
  tagName: 'html' | 'body',
  attrs: string,
) {
  if (!attrs) return { buffer: html, done: true }
  const openTag = `<${tagName}`
  const start = html.indexOf(openTag)
  if (start === -1) return { buffer: html, done: false }
  const end = html.indexOf('>', start)
  if (end === -1) return { buffer: html, done: false }
  const insertAt = start + openTag.length
  return {
    buffer: `${html.slice(0, insertAt)} ${attrs}${html.slice(insertAt)}`,
    done: true,
  }
}

function insertAfterOpen(
  html: string,
  tagName: 'body',
  content: string,
) {
  if (!content) return { buffer: html, done: true }
  const openTag = `<${tagName}`
  const start = html.indexOf(openTag)
  if (start === -1) return { buffer: html, done: false }
  const end = html.indexOf('>', start)
  if (end === -1) return { buffer: html, done: false }
  const insertAt = end + 1
  return {
    buffer: `${html.slice(0, insertAt)}${content}${html.slice(insertAt)}`,
    done: true,
  }
}

function insertBeforeClose(
  html: string,
  tagName: 'head' | 'body',
  content: string,
) {
  if (!content) return { buffer: html, done: true }
  const closeTag = `</${tagName}>`
  const start = html.indexOf(closeTag)
  if (start === -1) return { buffer: html, done: false }
  return {
    buffer: `${html.slice(0, start)}${content}${html.slice(start)}`,
    done: true,
  }
}
