import { Transform } from 'stream'
import type { AnyRouter } from '@tanstack/react-router'

export function transformStreamWithRouter(router: AnyRouter) {
  return transformStreamHtmlCallback(async () => {
    const injectorPromises = router.injectedHtml.map((d) =>
      typeof d === 'function' ? d() : d,
    )
    const injectors = await Promise.all(injectorPromises)
    router.injectedHtml = []
    return injectors.join('')
  })
}
function transformStreamHtmlCallback(injector: () => Promise<string>) {
  let leftover = ''
  // If a closing tag is split across chunks, store the HTML to add after it
  // This expects that all the HTML that's added is closed properly
  let leftoverHtml = ''

  return new Transform({
    transform(chunk, encoding, callback) {
      const chunkString = leftover + chunk.toString()

      // regex pattern for matching closing body and html tags
      const patternBody = /(<\/body>)/
      const patternHtml = /(<\/html>)/

      const bodyMatch = chunkString.match(patternBody)
      const htmlMatch = chunkString.match(patternHtml)

      injector()
        .then((html) => {
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

            this.push(processed)
            leftover = ''
          } else {
            // For all other closing tags, add the arbitrary HTML after them
            const pattern = /(<\/[a-zA-Z][\w:.-]*?>)/g
            let result
            let lastIndex = 0

            while ((result = pattern.exec(chunkString)) !== null) {
              lastIndex = result.index + result[0].length
            }

            // If a closing tag was found, add the arbitrary HTML and send it through
            if (lastIndex > 0) {
              const processed =
                chunkString.slice(0, lastIndex) + html + leftoverHtml
              this.push(processed)
              leftover = chunkString.slice(lastIndex)
            } else {
              // If no closing tag was found, store the chunk to process with the next one
              leftover = chunkString
              leftoverHtml += html
            }
          }

          callback()
        })
        .catch((err) => {
          console.error(err)
          callback(err)
        })
    },
    flush(callback) {
      if (leftover) {
        this.push(leftover)
      }
      callback()
    },
  })
}
