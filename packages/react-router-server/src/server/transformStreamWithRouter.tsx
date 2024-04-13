import { Transform } from 'stream'
import type { AnyRouter } from '@tanstack/react-router'

export function transformStreamWithRouter(router: AnyRouter) {
  const callbacks = transformHtmlCallbacks(injectorFromRouter(router))
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
  const callbacks = transformHtmlCallbacks(injectorFromRouter(router))
  return new TransformStream<string>({
    transform(chunk, controller) {
      return callbacks.transform(chunk, (chunkToPush) => {
        controller.enqueue(chunkToPush)
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

function injectorFromRouter(router: AnyRouter) {
  return async () => {
    const injectorPromises = router.injectedHtml.map((d) =>
      typeof d === 'function' ? d() : d,
    )
    const injectors = await Promise.all(injectorPromises)
    router.injectedHtml = []
    return injectors.join('')
  }
}

// regex pattern for matching closing body and html tags
const patternBody = /(<\/body>)/
const patternHtml = /(<\/html>)/

// regex pattern for matching closing tags
const pattern = /(<\/[a-zA-Z][\w:.-]*?>)/g

const textDecoder = new TextDecoder()

function transformHtmlCallbacks(injector: () => Promise<string>) {
  let leftover = ''
  // If a closing tag is split across chunks, store the HTML to add after it
  // This expects that all the HTML that's added is closed properly
  let leftoverHtml = ''

  return {
    async transform(chunk: any, push: (chunkToPush: string) => boolean) {
      const chunkString = leftover + textDecoder.decode(chunk)

      const bodyMatch = chunkString.match(patternBody)
      const htmlMatch = chunkString.match(patternHtml)

      try {
        const html = await injector()
        // If a </body></html> sequence was found
        if (bodyMatch && htmlMatch && bodyMatch.index! < htmlMatch.index!) {
          const bodyIndex = bodyMatch.index! + bodyMatch[0].length
          const htmlIndex = htmlMatch.index! + htmlMatch[0].length

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
    async flush(push: (chunkToPush: string) => boolean) {
      if (leftover) {
        push(leftover)
      }
    },
  }
}
