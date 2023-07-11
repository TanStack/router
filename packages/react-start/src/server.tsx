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
import { PassThrough } from 'stream'
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

  React.useState(() => {
    if (hydrationCtxValue) {
      props.router.hydrate(hydrationCtxValue)
    }
  })

  return (
    // Provide the hydration context still, since `<RouterScripts />` needs it.
    <hydrationContext.Provider value={hydrationCtxValue}>
      <Wrap>
        <RouterProvider router={props.router} />
      </Wrap>
    </hydrationContext.Provider>
  )
}
