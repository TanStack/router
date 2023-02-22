import type { APIContext } from 'astro'
import {
  AnyRouter,
  createMemoryHistory,
  RouterProvider,
} from '@tanstack/router'
import { handleEvent, server$ } from '@tanstack/bling/server'
import ReactDOMServer from 'react-dom/server'
import * as React from 'react'
import isbot from 'isbot'
import { PassThrough } from 'stream'
// @ts-ignore
import cprc from '@gisatcz/cross-package-react-context'
//
import { Hydrate } from './components/Hydrate'

export function createRequestHandler<TRouter extends AnyRouter>(opts: {
  createRouter: () => TRouter
}) {
  return async ({ request }: APIContext) => {
    const fullUrl = new URL(request.url)
    const url = request.url.replace(fullUrl.origin, '')

    if (server$.hasHandler(fullUrl.pathname)) {
      return await handleEvent({
        request,
        env: {},
        locals: {
          $abortSignal: new AbortController().signal, // TODO: Use the real abort signal
        },
      })
    }

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

// server$.addDeserializer({
//   apply: (e) => e.$type === 'loaderClient',
//   deserialize: (e, event) => event.locals.$loaderClient,
// })

export function StartServer<TRouter extends AnyRouter>(props: {
  router: TRouter
}) {
  const CustomRouterProvider = props.router.options.Provider || React.Fragment

  const hydrationContext = cprc.getContext('TanStackStartHydrationContext', {})

  return (
    <hydrationContext.Provider value={props.router.options.dehydrate?.()}>
      <Hydrate onHydrate={props.router.options.hydrate}>
        <CustomRouterProvider>
          <RouterProvider router={props.router} />
        </CustomRouterProvider>
      </Hydrate>
    </hydrationContext.Provider>
  )
}
