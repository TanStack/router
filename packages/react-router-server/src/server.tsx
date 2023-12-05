import { AnyRouter, RouterProvider } from '@tanstack/react-router'
import * as React from 'react'
import { Transform } from 'stream'
// @ts-ignore
import cprc from '@gisatcz/cross-package-react-context'

export function StartServer<TRouter extends AnyRouter>(props: {
  router: TRouter
}) {
  const hydrationContext = cprc.getContext('TanStackRouterHydrationContext', {})

  const hydrationCtxValue = React.useMemo(
    () => ({
      router: props.router.dehydrate(),
      payload: props.router.options.dehydrate?.(),
    }),
    [],
  )

  console.log(hydrationCtxValue)

  return (
    // Provide the hydration context still, since `<DehydrateRouter />` needs it.
    <hydrationContext.Provider value={hydrationCtxValue}>
      <RouterProvider router={props.router} />
    </hydrationContext.Provider>
  )
}

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

  return new Transform({
    transform(chunk, encoding, callback) {
      let chunkString = leftover + chunk.toString()

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
              const processed = chunkString.slice(0, lastIndex) + html
              this.push(processed)
              leftover = chunkString.slice(lastIndex)
            } else {
              // If no closing tag was found, store the chunk to process with the next one
              leftover = chunkString
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
