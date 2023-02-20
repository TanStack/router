import { AnyRoute, createMemoryHistory, Router } from '@tanstack/router'
import type { APIContext } from 'astro'
import ReactDOMServer from 'react-dom/server'
import { handleEvent, server$ } from '@tanstack/bling/server/server'
import { ServerContext } from './Hydrate'
import * as React from 'react'
import { StartServer } from './StartServer'
import { LoaderClient } from 'packages/loaders/build/types'

export function createRequestHandler<
  TRouteTree extends AnyRoute,
  TLoaderClient extends LoaderClient,
>({
  routeTree,
  createLoaderClient,
}: {
  routeTree: TRouteTree
  createLoaderClient: () => TLoaderClient
}) {
  return async ({ request }: APIContext) => {
    const fullUrl = new URL(request.url)
    const url = request.url.replace(fullUrl.origin, '')

    const loaderClient = createLoaderClient()

    if (server$.hasHandler(fullUrl.pathname)) {
      return await handleEvent({
        request,
        env: {},
        locals: {
          $loaderClient: loaderClient,
          $abortSignal: new AbortController().signal,
        },
      })
    }

    console.log('Rendering: ', url, '...')

    const history = createMemoryHistory({
      initialEntries: [url],
    })

    const router = new Router({
      history,
      routeTree,
      context: {
        loaderClient,
      },
    })

    await router.load()

    const dehydratedRouter = router.dehydrate()
    const dehydratedLoaderClient = loaderClient.dehydrate()

    const html = ReactDOMServer.renderToString(
      <StartServer
        loaderClient={loaderClient}
        routeTree={routeTree}
        dehydratedRouter={dehydratedRouter}
        dehydratedLoaderClient={dehydratedLoaderClient}
      />,
    )

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html',
      },
    })

    // // Clever way to get the right callback. Thanks Remix!
    // // const callbackName = isbot(request.headers.get('user-agent'))
    // //   ? 'onAllReady'
    // //   : 'onShellReady'
    // const callbackName = 'onShellReady'

    // const body = new PassThrough()

    // const stream = ReactDOMServer.renderToPipeableStream(
    //   React.createElement(App, {
    //     dehydratedRouter,
    //     dehydratedLoaderClient,
    //   }),
    //   {
    //     [callbackName]: () => {
    //       // opts.res.statusCode = didError ? 500 : 200
    //       // opts.res.setHeader('Content-type', 'text/html')
    //       stream.pipe(body)
    //     },
    //     onError: (err) => {
    //       // didError = true
    //       console.log(err)
    //     },
    //   },
    // )

    // setTimeout(() => stream.abort(), 10000)

    // return new Response(body as any)
  }
}
