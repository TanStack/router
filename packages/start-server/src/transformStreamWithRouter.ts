import { PassThrough } from 'node:stream'
import type { Readable } from 'node:stream'
import type { AnyRouter } from '@tanstack/react-router'

function createRouterStream(router: AnyRouter): Readable {
  const routerStream = new PassThrough()

  async function digestRouterInjections(): Promise<void> {
    try {
      while (router.injectedHtml.length > 0) {
        // Wait for any of the injected promises to settle
        const getHtml = await Promise.race(router.injectedHtml)
        // On success, as long as the routerStream is not destroyed,
        // push the html
        if (!routerStream.destroyed) {
          routerStream.push(getHtml())
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
  digestRouterInjections()

  return routerStream
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
  const routerStream = createRouterStream(router)
  let routerStreamBuffer = ''
  let pendingClosingTags = ''
  let isRouterStreamDone = false
  let isAppStreamDone = false

  // Buffer the routerStream until the appStream has an open body tag
  let bodyStarted = false
  let leftover = ''
  let leftoverHtml = ''

  // Buffer the routerStream so we can flush it when the appStream has an open body tag
  routerStream.on('data', (chunk) => {
    const decoded = textDecoder.decode(chunk)

    console.log('routerStream data', decoded)

    if (!bodyStarted) {
      // console.log('Non-body routerStream data', decoded)
      routerStreamBuffer += decoded
    } else {
      finalPassThrough.write(decoded)
    }
  })

  appStream.on('data', (chunk) => {
    const chunkString = leftover + textDecoder.decode(chunk)

    const bodyStartMatch = chunkString.match(patternBodyStart)
    const bodyEndMatch = chunkString.match(patternBodyEnd)
    const htmlEndMatch = chunkString.match(patternHtmlEnd)

    if (bodyStartMatch) {
      bodyStarted = true
    }

    const getBufferedRouterStream = () => {
      const html = routerStreamBuffer
      routerStreamBuffer = ''
      return html
    }

    if (!bodyStarted) {
      finalPassThrough.write(chunkString)
      leftover = ''
      return
    }

    // If the body has already ended, we need to hold on to the closing tags
    // until the routerStream has finished
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

    // For all other closing tags, add the arbitrary HTML after them
    let result
    let lastIndex = 0

    while ((result = patternClosingTag.exec(chunkString)) !== null) {
      lastIndex = result.index + result[0].length
    }

    // If a closing tag was found, add the arbitrary HTML and send it through
    if (lastIndex > 0) {
      const processed =
        chunkString.slice(0, lastIndex) +
        getBufferedRouterStream() +
        leftoverHtml
      finalPassThrough.write(processed)
      leftover = chunkString.slice(lastIndex)
    } else {
      // If no closing tag was found, store the chunk to process with the next one
      leftover = chunkString
      leftoverHtml += getBufferedRouterStream()
    }
  })

  routerStream.on('end', () => {
    isRouterStreamDone = true

    if (isAppStreamDone) {
      if (pendingClosingTags) {
        finalPassThrough.write(pendingClosingTags)
      }
      finalPassThrough.end()
    }
  })

  appStream.on('end', () => {
    isAppStreamDone = true

    if (isRouterStreamDone) {
      if (routerStreamBuffer || pendingClosingTags) {
        finalPassThrough.write(routerStreamBuffer + pendingClosingTags)
      }
      finalPassThrough.end()
    }
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
