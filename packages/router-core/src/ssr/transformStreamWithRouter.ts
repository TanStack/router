import { ReadableStream } from 'node:stream/web'
import { Readable } from 'node:stream'
import { createControlledPromise } from '../utils'
import type { AnyRouter } from '../router'

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

export const TSR_SCRIPT_BARRIER_ID = '$tsr-stream-barrier'

// regex pattern for matching closing body and html tags
const patternBodyEnd = /(<\/body>)/
const patternHtmlEnd = /(<\/html>)/
// regex pattern for matching closing tags
const patternClosingTag = /(<\/[a-zA-Z][\w:.-]*?>)/g

type ReadablePassthrough = {
  stream: ReadableStream
  write: (chunk: unknown) => void
  end: (chunk?: string) => void
  destroy: (error: unknown) => void
  destroyed: boolean
}

function createPassthrough(onCancel?: () => void) {
  let controller: ReadableStreamDefaultController<any>
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(c) {
      controller = c
    },
    cancel() {
      res.destroyed = true
      onCancel?.()
    },
  })

  const res: ReadablePassthrough = {
    stream,
    write: (chunk) => {
      if (typeof chunk === 'string') {
        controller.enqueue(encoder.encode(chunk))
      } else {
        controller.enqueue(chunk)
      }
    },
    end: (chunk) => {
      if (chunk) {
        res.write(chunk)
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
  opts?: {
    timeoutMs?: number
  },
) {
  let stopListeningToInjectedHtml: (() => void) | undefined = undefined
  let timeoutHandle: NodeJS.Timeout

  const finalPassThrough = createPassthrough(() => {
    stopListeningToInjectedHtml?.()
    clearTimeout(timeoutHandle)
  })
  const textDecoder = new TextDecoder()

  let isAppRendering = true as boolean
  let routerStreamBuffer = ''
  let pendingClosingTags = ''
  let streamBarrierLifted = false as boolean
  let leftover = ''
  let leftoverHtml = ''

  function getBufferedRouterStream() {
    const html = routerStreamBuffer
    routerStreamBuffer = ''
    return html
  }

  function decodeChunk(chunk: unknown): string {
    if (chunk instanceof Uint8Array) {
      return textDecoder.decode(chunk, { stream: true })
    }
    return String(chunk)
  }

  const injectedHtmlDonePromise = createControlledPromise<void>()

  let processingCount = 0

  // Process any already-injected HTML
  router.serverSsr!.injectedHtml.forEach((promise) => {
    handleInjectedHtml(promise)
  })

  // Listen for any new injected HTML
  stopListeningToInjectedHtml = router.subscribe('onInjectedHtml', (e) => {
    handleInjectedHtml(e.promise)
  })

  function handleInjectedHtml(promise: Promise<string>) {
    processingCount++

    promise
      .then((html) => {
        if (isAppRendering) {
          routerStreamBuffer += html
        } else {
          finalPassThrough.write(html)
        }
      })
      .catch(injectedHtmlDonePromise.reject)
      .finally(() => {
        processingCount--

        if (!isAppRendering && processingCount === 0) {
          injectedHtmlDonePromise.resolve()
        }
      })
  }

  injectedHtmlDonePromise
    .then(() => {
      clearTimeout(timeoutHandle)
      const finalHtml =
        leftoverHtml + getBufferedRouterStream() + pendingClosingTags

      finalPassThrough.end(finalHtml)
    })
    .catch((err) => {
      console.error('Error reading routerStream:', err)
      finalPassThrough.destroy(err)
    })
    .finally(() => stopListeningToInjectedHtml?.())

  // Transform the appStream
  readStream(appStream, {
    onData: (chunk) => {
      const text = decodeChunk(chunk.value)
      const chunkString = leftover + text
      const bodyEndMatch = chunkString.match(patternBodyEnd)
      const htmlEndMatch = chunkString.match(patternHtmlEnd)

      if (!streamBarrierLifted) {
        const streamBarrierIdIncluded = chunkString.includes(
          TSR_SCRIPT_BARRIER_ID,
        )
        if (streamBarrierIdIncluded) {
          streamBarrierLifted = true
          router.serverSsr!.liftScriptBarrier()
        }
      }

      // If either the body end or html end is in the chunk,
      // We need to get all of our data in asap
      if (
        bodyEndMatch &&
        htmlEndMatch &&
        bodyEndMatch.index! < htmlEndMatch.index!
      ) {
        const bodyEndIndex = bodyEndMatch.index!
        pendingClosingTags = chunkString.slice(bodyEndIndex)

        finalPassThrough.write(
          chunkString.slice(0, bodyEndIndex) + getBufferedRouterStream(),
        )

        leftover = ''
        return
      }

      let result: RegExpExecArray | null
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
      // Mark the app as done rendering
      isAppRendering = false
      router.serverSsr!.setRenderFinished()

      // If there are no pending promises, resolve the injectedHtmlDonePromise
      if (processingCount === 0) {
        injectedHtmlDonePromise.resolve()
      } else {
        const timeoutMs = opts?.timeoutMs ?? 60000
        timeoutHandle = setTimeout(() => {
          injectedHtmlDonePromise.reject(
            new Error('Injected HTML timeout after app render finished'),
          )
        }, timeoutMs)
      }
    },
    onError: (error) => {
      console.error('Error reading appStream:', error)
      finalPassThrough.destroy(error)
      injectedHtmlDonePromise.reject(error)
    },
  })

  return finalPassThrough.stream
}
