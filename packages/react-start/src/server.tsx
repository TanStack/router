import type { APIContext } from 'astro'
import {
  AnyRouter,
  createMemoryHistory,
  RouterProvider,
} from '@tanstack/router'
// import { handleEvent, hasHandler, handlers } from '@tanstack/bling/server'
import * as ReactDOMServer from 'react-dom/server'
import * as React from 'react'
import isbot from 'isbot'
import { PassThrough, Transform } from 'stream'
// @ts-ignore
import cprc from '@gisatcz/cross-package-react-context'

export function createRequestHandler<TRouter extends AnyRouter>(opts: {
  createRouter: () => TRouter
}) {
  return async ({ request }: APIContext) => {
    const fullUrl = new URL(request.url)
    const url = request.url.replace(fullUrl.origin, '')

    // console.log(handlers)
    // if (hasHandler(fullUrl.pathname)) {
    //   return await handleEvent({
    //     request,
    //   })
    // }

    if (fullUrl.pathname.includes('.')) {
      return new Response(null, {
        status: 404,
      })
    }

    console.log('Rendering: ', url, '...')

    const history = createMemoryHistory({
      initialEntries: [url],
    })

    const router = opts.createRouter()

    router.update({
      history,
    })

    await router.load()

    return new Promise((resolve, reject) => {
      let didError = false

      const responseStatusCode = 200
      const responseHeaders = new Headers({
        'Content-Type': 'text/html',
      })

      // Clever way to get the right callback. Thanks Remix!
      const callbackName = isbot(request.headers.get('user-agent'))
        ? 'onAllReady'
        : 'onShellReady'

      const stream = ReactDOMServer.renderToPipeableStream(
        <StartServer router={router} />,
        {
          [callbackName]: () => {
            const body = new PassThrough()

            responseHeaders.set('Content-Type', 'text/html')

            resolve(
              new Response(body as any, {
                headers: responseHeaders,
                status: didError ? 500 : responseStatusCode,
              }),
            )

            stream.pipe(body)
          },
          onShellError: (err) => {
            reject(err)
          },
          onError: (err) => {
            didError = true
            console.log(err)
          },
        },
      )

      setTimeout(() => stream.abort(), 10000)
    })
  }
}

export function StartServer<TRouter extends AnyRouter>(props: {
  router: TRouter
}) {
  const Wrap = props.router.options.Wrap || React.Fragment

  const hydrationContext = cprc.getContext('TanStackRouterHydrationContext', {})

  const hydrationCtxValue = React.useMemo(
    () => ({
      router: props.router.dehydrate(),
      payload: props.router.options.dehydrate?.(),
    }),
    [],
  )

  // React.useState(() => {
  //   if (hydrationCtxValue) {
  //     props.router.hydrate(hydrationCtxValue)
  //   }
  // })

  return (
    // Provide the hydration context still, since `<RouterScripts />` needs it.
    <hydrationContext.Provider value={hydrationCtxValue}>
      <Wrap>
        <RouterProvider router={props.router} />
      </Wrap>
    </hydrationContext.Provider>
  )
}

export function transformStreamWithRouter(router: AnyRouter) {
  return transformStreamHtmlCallback(async () => {
    const injectorPromises = router.injectedHtml.map((d) => d())
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
        .catch(callback)
    },
    flush(callback) {
      if (leftover) {
        this.push(leftover)
      }
      callback()
    },
  })
}
