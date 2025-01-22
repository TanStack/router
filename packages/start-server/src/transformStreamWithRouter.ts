import { ReadableStream } from 'node:stream/web'
import { Readable } from 'node:stream'
import type { AnyRouter } from '@tanstack/react-router'

export function transformReadableStreamWithRouter(
  router: AnyRouter,
  routerStream: ReadableStream,
) {
  return transformStreamWithRouter(router, routerStream)
}

export function transformPipeableStreamWithRouter(
  router: AnyRouter,
  routerStream: Readable,
) {
  return Readable.fromWeb(
    transformStreamWithRouter(router, Readable.toWeb(routerStream)),
  )
}

function createRouterStream(router: AnyRouter) {
  const routerStream = createPassthrough()

  let isAppRendering = true

  async function digestRouterStream(): Promise<void> {
    try {
      while (isAppRendering || router.injectedHtml.length) {
        // Wait for any of the injected promises to settle
        const getHtml = await Promise.race(router.injectedHtml)
        // On success, push the html

        if (!routerStream.destroyed) {
          routerStream.write(getHtml())
        }
      }
    } catch (error) {
      console.error('Error processing HTML injection:', error)
      routerStream.destroy(
        error instanceof Error ? error : new Error(String(error)),
      )
    }
  }

  // Start digesting router injections into the routerStream
  digestRouterStream()

  const appDoneRendering = () => {
    isAppRendering = false
  }

  return [routerStream, appDoneRendering] as const
}

// regex pattern for matching closing body and html tags
const patternBodyStart = /(<body)/
const patternBodyEnd = /(<\/body>)/
const patternHtmlEnd = /(<\/html>)/

// regex pattern for matching closing tags
const patternClosingTag = /(<\/[a-zA-Z][\w:.-]*?>)/g

const textDecoder = new TextDecoder()

type ReadablePassthrough = {
  stream: ReadableStream
  write: (chunk: string) => void
  end: (chunk?: string) => void
  destroy: (error: unknown) => void
  destroyed: boolean
}

function createPassthrough() {
  let controller: ReadableStreamDefaultController<any>
  const stream = new ReadableStream({
    start(c) {
      controller = c
    },
  })

  const res: ReadablePassthrough = {
    stream,
    write: (chunk) => {
      controller.enqueue(chunk)
    },
    end: (chunk) => {
      if (chunk) {
        controller.enqueue(chunk)
      }
      controller.close()
      res.destroyed = true
    },
    destroy: (error) => {
      controller.error(error)
    },
    destroyed: false,
  }

  return res
}

async function readStream(
  stream: ReadableStream,
  opts: {
    onData?: (chunk: ReadableStreamReadValueResult<any>) => void
    onEnd?: () => void
    onError?: (error: unknown) => void
  },
) {
  try {
    const reader = stream.getReader()
    let chunk
    while (!(chunk = await reader.read()).done) {
      opts.onData?.(chunk)
    }
    opts.onEnd?.()
  } catch (error) {
    opts.onError?.(error)
  }
}

export function transformStreamWithRouter(
  router: AnyRouter,
  appStream: ReadableStream,
) {
  const finalPassThrough = createPassthrough()
  const [routerStream, appDoneRendering] = createRouterStream(router)

  let routerStreamBuffer = ''
  let pendingClosingTags = ''
  let isRouterStreamDone = false as boolean
  let isAppStreamDone = false as boolean
  let bodyStarted = false as boolean
  let leftover = ''
  let leftoverHtml = ''

  function getBufferedRouterStream() {
    const html = routerStreamBuffer
    routerStreamBuffer = ''
    return html
  }

  function finish() {
    const finalHtml = leftoverHtml + pendingClosingTags
    finalPassThrough.end(finalHtml)
  }

  function decodeChunk(chunk: unknown): string {
    if (chunk instanceof Uint8Array) {
      return textDecoder.decode(chunk)
    }
    return String(chunk)
  }

  // Buffer and handle `routerStream` data
  readStream(routerStream.stream, {
    onData: (chunk) => {
      const text = decodeChunk(chunk.value)

      if (!bodyStarted) {
        routerStreamBuffer += text
      } else {
        finalPassThrough.write(text)
      }
    },
    onEnd: () => {
      isRouterStreamDone = true
      if (isAppStreamDone) finish()
    },
    onError: (error) => {
      console.error('Error reading routerStream:', error)
      finalPassThrough.destroy(error)
    },
  })

  // Transform the appStream
  readStream(appStream, {
    onData: (chunk) => {
      const text = decodeChunk(chunk.value)

      const chunkString = leftover + text
      const bodyStartMatch = chunkString.match(patternBodyStart)
      const bodyEndMatch = chunkString.match(patternBodyEnd)
      const htmlEndMatch = chunkString.match(patternHtmlEnd)

      if (bodyStartMatch) {
        bodyStarted = true
      }

      if (!bodyStarted) {
        finalPassThrough.write(chunkString)
        leftover = ''
        return
      }

      if (
        bodyEndMatch &&
        htmlEndMatch &&
        bodyEndMatch.index! < htmlEndMatch.index!
      ) {
        const bodyIndex = bodyEndMatch.index!
        pendingClosingTags = chunkString.slice(bodyIndex)
        finalPassThrough.write(
          getBufferedRouterStream() + chunkString.slice(0, bodyIndex),
        )
        leftover = ''
        return
      }

      let result
      let lastIndex = 0
      while ((result = patternClosingTag.exec(chunkString)) !== null) {
        lastIndex = result.index + result[0].length
      }

      if (lastIndex > 0) {
        const processed =
          chunkString.slice(0, lastIndex) +
          getBufferedRouterStream() +
          leftoverHtml
        finalPassThrough.write(processed)
        leftover = chunkString.slice(lastIndex)
      } else {
        leftover = chunkString
        leftoverHtml += getBufferedRouterStream()
      }
    },
    onEnd: () => {
      appDoneRendering()
      isAppStreamDone = true
      if (isRouterStreamDone) finish()
    },
    onError: (error) => {
      console.error('Error reading appStream:', error)
      finalPassThrough.destroy(error)
    },
  })

  return finalPassThrough.stream
}
