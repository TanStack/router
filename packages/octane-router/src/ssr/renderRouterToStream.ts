import { renderToReadableStream } from 'octane/server'
import { prerender } from 'octane/static'
import { isbot } from 'isbot'
import {
  createSsrStreamResponse,
  transformReadableStreamWithRouter,
} from '@tanstack/router-core/ssr/server'
import { finalizeBufferedHtml } from './renderRouterToString'
import type { ComponentBody } from 'octane'
import type { AnyRouter } from '@tanstack/router-core'

type RouterApp = ComponentBody<{ router: AnyRouter }>
type ServerComponent = Parameters<typeof renderToReadableStream>[0]

export async function renderRouterToStream({
  request,
  router,
  responseHeaders,
  App,
}: {
  request: Request
  router: AnyRouter
  responseHeaders: Headers
  App: RouterApp
}) {
  if (isbot(request.headers.get('User-Agent'))) {
    return renderRouterForBot({ request, router, responseHeaders, App })
  }

  const renderController = new AbortController()
  const onRequestAbort = () => renderController.abort(request.signal.reason)
  if (request.signal.aborted) {
    onRequestAbort()
  } else {
    request.signal.addEventListener('abort', onRequestAbort, { once: true })
    router.serverSsr?.onCleanup(() => {
      request.signal.removeEventListener('abort', onRequestAbort)
    })
  }

  try {
    const stream = await renderToReadableStream(
      App as unknown as ServerComponent,
      { router },
      {
        signal: renderController.signal,
        nonce: router.options.ssr?.nonce,
        onError(error) {
          if (!isAbortError(request, error)) {
            console.error('Error in renderToReadableStream:', error)
          }
        },
      },
    )

    const appStream = prependDoctype(relocateLeadingOctaneStylesToHead(stream))
    const responseStream = transformReadableStreamWithRouter(
      router,
      appStream as unknown as Parameters<
        typeof transformReadableStreamWithRouter
      >[1],
      {
        onAbort: (reason) => renderController.abort(reason),
      },
    )

    return createSsrStreamResponse(
      router,
      new Response(responseStream as unknown as BodyInit, {
        status: router.stores.statusCode.get(),
        headers: responseHeaders,
      }),
    )
  } catch (error) {
    renderController.abort(error)
    router.serverSsr?.cleanup()
    throw error
  }
}

const MAX_DOCUMENT_PREFIX_CHARS = 64 * 1024

/**
 * Octane streams the scoped styles needed by the shell before the rendered
 * markup. That is useful for fragment roots, but a full document would put the
 * styles before `<html>`. Hold only those leading renderer-owned styles and the
 * document prefix, then release them immediately after the opening `<head>`.
 * All later chunks (including suspense styles and boundary instructions) keep
 * flowing through this transform under the source stream's backpressure.
 */
export function relocateLeadingOctaneStylesToHead(
  stream: globalThis.ReadableStream<Uint8Array>,
): globalThis.ReadableStream<Uint8Array> {
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let state: 'leading' | 'document-prefix' | 'passthrough' = 'leading'
  let buffer = ''
  let leadingStyles = ''

  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true })
      processBuffer(controller, false)
    },
    flush(controller) {
      buffer += decoder.decode()
      processBuffer(controller, true)
    },
  })

  return stream.pipeThrough(transform)

  function processBuffer(
    controller: TransformStreamDefaultController<Uint8Array>,
    isFinalChunk: boolean,
  ) {
    while (state === 'leading') {
      const style = readLeadingOctaneStyle(buffer, isFinalChunk)
      if (style === undefined) {
        return
      }
      if (style === null) {
        if (!leadingStyles) {
          state = 'passthrough'
          enqueueBuffer(controller)
          return
        }
        state = 'document-prefix'
        break
      }
      leadingStyles += buffer.slice(0, style)
      buffer = buffer.slice(style)
    }

    if (state === 'document-prefix') {
      const headEnd = findOpeningTagEnd(buffer, 'head')
      if (headEnd !== -1) {
        enqueue(
          controller,
          `${buffer.slice(0, headEnd)}${leadingStyles}${buffer.slice(headEnd)}`,
        )
        leadingStyles = ''
        buffer = ''
        state = 'passthrough'
        return
      }

      // A route-owned document is expected to render a head. Keep malformed or
      // fragment output streaming too: after a bounded prefix, preserve Octane's
      // original ordering instead of retaining the rest of the response.
      if (!isFinalChunk && buffer.length <= MAX_DOCUMENT_PREFIX_CHARS) {
        return
      }

      enqueue(controller, `${leadingStyles}${buffer}`)
      leadingStyles = ''
      buffer = ''
      state = 'passthrough'
      return
    }

    enqueueBuffer(controller)
  }

  function enqueueBuffer(
    controller: TransformStreamDefaultController<Uint8Array>,
  ) {
    enqueue(controller, buffer)
    buffer = ''
  }

  function enqueue(
    controller: TransformStreamDefaultController<Uint8Array>,
    value: string,
  ) {
    if (value) {
      controller.enqueue(encoder.encode(value))
    }
  }
}

// Returns the end offset of a complete leading Octane style, null when the
// prefix is not one, or undefined while a split tag still needs more bytes.
function readLeadingOctaneStyle(
  html: string,
  isFinalChunk: boolean,
): number | null | undefined {
  const stylePrefix = '<style'
  const comparablePrefix = html
    .slice(0, Math.min(html.length, stylePrefix.length))
    .toLowerCase()

  if (!stylePrefix.startsWith(comparablePrefix)) {
    return null
  }
  if (html.length < stylePrefix.length) {
    return isFinalChunk ? null : undefined
  }

  const next = html.charAt(stylePrefix.length)
  if (!next) {
    return isFinalChunk ? null : undefined
  }
  if (next !== '>' && !isHtmlWhitespace(next)) {
    return null
  }

  const openingTagEnd = findTagEnd(html, 0)
  if (openingTagEnd === -1) {
    return isFinalChunk ? null : undefined
  }

  const openingTag = html.slice(0, openingTagEnd)
  if (!/\sdata-octane(?:\s|=|>)/i.test(openingTag)) {
    return null
  }

  const closingTag = '</style>'
  const closingTagStart = html.toLowerCase().indexOf(closingTag, openingTagEnd)
  if (closingTagStart === -1) {
    return isFinalChunk ? null : undefined
  }
  return closingTagStart + closingTag.length
}

function findOpeningTagEnd(html: string, tagName: string): number {
  const lowerHtml = html.toLowerCase()
  const prefix = `<${tagName}`
  let searchFrom = 0

  while (searchFrom < html.length) {
    const start = lowerHtml.indexOf(prefix, searchFrom)
    if (start === -1) {
      return -1
    }

    const next = html.charAt(start + prefix.length)
    if (next === '>' || isHtmlWhitespace(next)) {
      return findTagEnd(html, start)
    }
    searchFrom = start + prefix.length
  }

  return -1
}

function findTagEnd(html: string, start: number): number {
  let quote: '"' | "'" | undefined
  for (let index = start + 1; index < html.length; index++) {
    const char = html.charAt(index)
    if (quote) {
      if (char === quote) {
        quote = undefined
      }
    } else if (char === '"' || char === "'") {
      quote = char
    } else if (char === '>') {
      return index + 1
    }
  }
  return -1
}

function isHtmlWhitespace(char: string) {
  return char === ' ' || char === '\n' || char === '\r' || char === '\t'
}

async function renderRouterForBot({
  request,
  router,
  responseHeaders,
  App,
}: {
  request: Request
  router: AnyRouter
  responseHeaders: Headers
  App: RouterApp
}) {
  try {
    const result = await prerender(
      App as unknown as Parameters<typeof prerender>[0],
      { router },
      {
        signal: request.signal,
        nonce: router.options.ssr?.nonce,
        onError(error) {
          if (!isAbortError(request, error)) {
            console.error('Error in prerender:', error)
          }
        },
      },
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
  } finally {
    router.serverSsr?.cleanup()
  }
}

function prependDoctype(
  stream: globalThis.ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let sentDoctype = false

  return new ReadableStream({
    start() {
      reader = stream.getReader()
    },
    async pull(controller) {
      if (!sentDoctype) {
        sentDoctype = true
        controller.enqueue(encoder.encode('<!DOCTYPE html>'))
        return
      }

      try {
        const { done, value } = await reader!.read()
        if (done) {
          controller.close()
          releaseReader()
        } else {
          controller.enqueue(value)
        }
      } catch (error) {
        controller.error(error)
        releaseReader()
      }
    },
    async cancel(reason) {
      try {
        await reader?.cancel(reason)
      } finally {
        releaseReader()
      }
    },
  })

  function releaseReader() {
    try {
      reader?.releaseLock()
    } catch {
      // The stream may already have released its reader during cancellation.
    }
    reader = undefined
  }
}

function isAbortError(request: Request, error: unknown) {
  return (
    (request.signal.aborted && error === request.signal.reason) ||
    (error instanceof Error && error.name === 'AbortError')
  )
}
