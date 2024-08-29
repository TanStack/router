import { Transform } from 'node:stream'
import type { AnyRouter } from '@tanstack/react-router'

export function transformStreamWithRouter(router: AnyRouter) {
  const callbacks = transformHtmlCallbacks(() =>
    router.injectedHtml.map((d) => d()).join(''),
  )
  return new Transform({
    transform(chunk, _encoding, callback) {
      callbacks
        .transform(chunk, this.push.bind(this))
        .then(() => callback())
        .catch((err) => callback(err))
    },
    flush(callback) {
      callbacks
        .flush(this.push.bind(this))
        .then(() => callback())
        .catch((err) => callback(err))
    },
  })
}

export function transformReadableStreamWithRouter(router: AnyRouter) {
  const callbacks = transformHtmlCallbacks(() =>
    router.injectedHtml.map((d) => d()).join(''),
  )

  const encoder = new TextEncoder()

  return new TransformStream<string>({
    transform(chunk, controller) {
      return callbacks.transform(chunk, (chunkToPush) => {
        controller.enqueue(encoder.encode(chunkToPush))
        return true
      })
    },
    flush(controller) {
      return callbacks.flush((chunkToPush) => {
        controller.enqueue(chunkToPush)
        return true
      })
    },
  })
}

// regex pattern for matching closing body and html tags
const patternBodyStart = /(<body)/
const patternBodyEnd = /(<\/body>)/
const patternHtmlEnd = /(<\/html>)/

// regex pattern for matching closing tags
const pattern = /(<\/[a-zA-Z][\w:.-]*?>)/g

const textDecoder = new TextDecoder()

function transformHtmlCallbacks(getHtml: () => string) {
  let bodyStarted = false
  let leftover = ''
  // If a closing tag is split across chunks, store the HTML to add after it
  // This expects that all the HTML that's added is closed properly
  let leftoverHtml = ''

  return {
    // eslint-disable-next-line @typescript-eslint/require-await
    async transform(chunk: any, push: (chunkToPush: string) => boolean) {
      const chunkString = leftover + textDecoder.decode(chunk)

      const bodyStartMatch = chunkString.match(patternBodyStart)
      const bodyEndMatch = chunkString.match(patternBodyEnd)
      const htmlEndMatch = chunkString.match(patternHtmlEnd)

      try {
        if (bodyStartMatch) {
          bodyStarted = true
        }

        if (!bodyStarted) {
          push(chunkString)
          leftover = ''
          return
        }

        const html = getHtml()

        // If a </body></html> sequence was found
        if (
          bodyEndMatch &&
          htmlEndMatch &&
          bodyEndMatch.index! < htmlEndMatch.index!
        ) {
          const bodyIndex = bodyEndMatch.index! + bodyEndMatch[0].length
          const htmlIndex = htmlEndMatch.index! + htmlEndMatch[0].length

          // Add the arbitrary HTML before the closing body tag
          const processed =
            chunkString.slice(0, bodyIndex) +
            html +
            chunkString.slice(bodyIndex, htmlIndex) +
            chunkString.slice(htmlIndex)

          push(processed)
          leftover = ''
        } else {
          // For all other closing tags, add the arbitrary HTML after them
          let result
          let lastIndex = 0

          while ((result = pattern.exec(chunkString)) !== null) {
            lastIndex = result.index + result[0].length
          }

          // If a closing tag was found, add the arbitrary HTML and send it through
          if (lastIndex > 0) {
            const processed =
              chunkString.slice(0, lastIndex) + html + leftoverHtml
            push(processed)
            leftover = chunkString.slice(lastIndex)
          } else {
            // If no closing tag was found, store the chunk to process with the next one
            leftover = chunkString
            leftoverHtml += html
          }
        }
      } catch (err) {
        console.error(err)
        throw err
      }
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    async flush(push: (chunkToPush: string) => boolean) {
      if (leftover) {
        push(leftover)
      }
    },
  }
}
