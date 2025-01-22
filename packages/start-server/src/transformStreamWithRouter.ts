import { PassThrough } from 'node:stream'
import type { Readable } from 'node:stream'
import type { AnyRouter } from '@tanstack/react-router'

function createRouterStream(router: AnyRouter) {
  const routerStream = new PassThrough()

  let digesting = false

  async function digestRouterStream(isEnd: boolean = false): Promise<void> {
    if (!digesting) {
      digesting = true

      try {
        while (router.injectedHtml.length > 0) {
          // Wait for any of the injected promises to settle
          const getHtml = await Promise.race(router.injectedHtml)
          // On success, as long as the routerStream is not destroyed,
          // push the html
          const html = getHtml()
          if (!routerStream.destroyed) {
            routerStream.write(html)
          }
        }
      } catch (error) {
        console.error('Error processing HTML injection:', error)
        routerStream.destroy(
          error instanceof Error ? error : new Error(String(error)),
        )
      }

      digesting = false
    }

    if (isEnd && !routerStream.destroyed) {
      routerStream.end()
    }
  }

  // Start digesting router injections into the routerStream
  digestRouterStream()

  return [routerStream, digestRouterStream] as const
}

// regex pattern for matching closing body and html tags
const patternBodyStart = /(<body)/
const patternBodyEnd = /(<\/body>)/
const patternHtmlEnd = /(<\/html>)/

// regex pattern for matching closing tags
const patternClosingTag = /(<\/[a-zA-Z][\w:.-]*?>)/g
const textDecoder = new TextDecoder()
export function transformStreamWithRouter(
  router: AnyRouter,
  appStream: Readable,
) {
  const finalPassThrough = new PassThrough()
  const [routerStream, digestRouterStream] = createRouterStream(router)
  let routerStreamBuffer = ''
  let pendingClosingTags = ''
  let isRouterStreamDone = false
  let isAppStreamDone = false

  let bodyStarted = false
  let leftover = ''
  let leftoverHtml = ''

  const textDecoder = new TextDecoder()

  // Buffer and handle `routerStream` data
  routerStream.on('data', (chunk) => {
    const decoded = textDecoder.decode(chunk)

    if (!bodyStarted) {
      routerStreamBuffer += decoded
    } else {
      if (!finalPassThrough.write(decoded)) {
        routerStream.pause()
        finalPassThrough.once('drain', () => routerStream.resume())
      }
    }
  })

  const getBufferedRouterStream = () => {
    const html = routerStreamBuffer
    routerStreamBuffer = ''
    return html
  }

  appStream.on('data', (chunk) => {
    digestRouterStream()

    const chunkString = leftover + textDecoder.decode(chunk)
    const bodyStartMatch = chunkString.match(patternBodyStart)
    const bodyEndMatch = chunkString.match(patternBodyEnd)
    const htmlEndMatch = chunkString.match(patternHtmlEnd)

    if (bodyStartMatch) {
      bodyStarted = true
    }

    if (!bodyStarted) {
      if (!finalPassThrough.write(chunkString)) {
        appStream.pause()
        finalPassThrough.once('drain', () => appStream.resume())
      }
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
  })

  function finish() {
    finalPassThrough.end(leftoverHtml + pendingClosingTags)
  }

  appStream.on('end', () => {
    digestRouterStream(true)
    isAppStreamDone = true
    if (isRouterStreamDone) finish()
  })

  routerStream.on('end', () => {
    isRouterStreamDone = true
    if (isAppStreamDone) finish()
  })

  // Error handling
  appStream.on('error', (err) => {
    console.error('Error in appStream:', err)
    finalPassThrough.destroy(err)
  })

  routerStream.on('error', (err) => {
    console.error('Error in routerStream:', err)
    finalPassThrough.destroy(err)
  })

  return finalPassThrough
}

// export function transformReadableStreamWithRouter(router: AnyRouter) {
//   const callbacks = transformHtmlCallbacks(() =>
//     router.injectedHtml.map((d) => d()).join(''),
//   )

//   const encoder = new TextEncoder()

//   return new TransformStream<string>({
//     transform(chunk, controller) {
//       return callbacks.transform(chunk, (chunkToPush) => {
//         controller.enqueue(encoder.encode(chunkToPush))
//         return true
//       })
//     },
//     flush(controller) {
//       return callbacks.flush((chunkToPush) => {
//         controller.enqueue(chunkToPush)
//         return true
//       })
//     },
//   })
// }
