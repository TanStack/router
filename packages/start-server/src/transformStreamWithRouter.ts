import { ReadableStream } from 'node:stream/web'
import { Readable } from 'node:stream'
import { createControlledPromise } from '@tanstack/react-router'
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

// regex pattern for matching closing body and html tags
const patternBodyStart = /(<body)/
const patternBodyEnd = /(<\/body>)/
const patternHtmlEnd = /(<\/html>)/
const patternHeadEnd = /(<\/head>)/

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

  let isAppRendering = true as boolean
  let routerStreamBuffer = ''
  let pendingClosingTags = ''
  let bodyStarted = false as boolean
  let leftover = ''
  let leftoverHtml = ''

  function getBufferedRouterStream() {
    const html = routerStreamBuffer
    routerStreamBuffer = ''
    return html
  }

  function decodeChunk(chunk: unknown): string {
    if (chunk instanceof Uint8Array) {
      return textDecoder.decode(chunk)
    }
    return String(chunk)
  }

  const injectedHtmlDonePromise = createControlledPromise<void>()

  let processingCount = 0

  // Process any already-injected HTML
  router.serverSsr!.injectedHtml.forEach((promise) => {
    console.log('pre-added injected html')
    handleInjectedHtml(promise)
  })

  // Listen for any new injected HTML
  const stopListeningToInjectedHtml = router.subscribe(
    'onInjectedHtml',
    (e) => {
      console.log('subscription injected html')
      handleInjectedHtml(e.promise)
    },
  )

  function handleInjectedHtml(promise: Promise<string>) {
    // If the app is done rendering and we've already resolved the promise,
    // stop processing
    if (!isAppRendering && injectedHtmlDonePromise.status !== 'pending') {
      console.log('stop listening to injected html')
      stopListeningToInjectedHtml()
      return
    }

    processingCount++

    promise
      .then((html) => {
        console.log('injected html')
        if (!bodyStarted) {
          routerStreamBuffer += html
        } else {
          finalPassThrough.write(html)
        }
      })
      .catch(injectedHtmlDonePromise.reject)
      .finally(() => {
        processingCount--
        console.log('processing count', processingCount)
        if (!isAppRendering && processingCount === 0) {
          injectedHtmlDonePromise.resolve()
        }
      })
  }

  injectedHtmlDonePromise
    .then(() => {
      const finalHtml =
        leftoverHtml + getBufferedRouterStream() + pendingClosingTags

      finalPassThrough.end(finalHtml)
    })
    .catch((err) => {
      console.error('Error reading routerStream:', err)
      finalPassThrough.destroy(err)
    })

  // Transform the appStream
  readStream(appStream, {
    onData: (chunk) => {
      console.log('app data')
      const text = decodeChunk(chunk.value)

      const chunkString = leftover + text
      const bodyStartMatch = chunkString.match(patternBodyStart)
      const bodyEndMatch = chunkString.match(patternBodyEnd)
      const htmlEndMatch = chunkString.match(patternHtmlEnd)

      if (bodyStartMatch) {
        console.log('body start')
        bodyStarted = true
      }

      if (!bodyStarted) {
        finalPassThrough.write(chunkString)
        leftover = ''
        return
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
      console.log('app done rendering')
      // Stop listening to any new injected HTML
      stopListeningToInjectedHtml()

      // Mark the app as done rendering
      isAppRendering = false

      // If there are no pending promises, resolve the injectedHtmlDonePromise
      if (processingCount === 0) {
        injectedHtmlDonePromise.resolve()
      }
    },
    onError: (error) => {
      console.error('Error reading appStream:', error)
      finalPassThrough.destroy(error)
    },
  })

  return finalPassThrough.stream
}
