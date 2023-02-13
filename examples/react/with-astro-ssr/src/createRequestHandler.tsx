import type { DehydratedLoaderClient } from '@tanstack/react-loaders'
import { createMemoryHistory, DehydratedRouter, Router } from '@tanstack/router'
import type { APIRoute, APIContext } from 'astro'
import * as React from 'react'
import ReactDOMServer from 'react-dom/server'
import { PassThrough } from 'stream'
import { ServerContext } from './components/Hydrate'

// import { createRequestHandler } from '@tanstack/astro-react-router'
export function createRequestHandler() {
  return async ({ request }: APIContext) => {
    const App = await import('./components/App').then((m) => m.App)
    const routeTree = await import('./routeTree').then((m) => m.routeTree)
    const createLoaderClient = await import('./loaderClient').then(
      (m) => m.createLoaderClient,
    )

    const fullUrl = new URL(request.url)
    const url = request.url.replace(fullUrl.origin, '')

    console.log('Rendering: ', url, '...')

    const history = createMemoryHistory({
      initialEntries: [url],
    })

    const loaderClient = createLoaderClient()

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
      <ServerContext
        {...{
          dehydratedRouter,
          dehydratedLoaderClient,
        }}
      >
        <App />
      </ServerContext>,
    )

    console.log(html)

    return new Response(
      ReactDOMServer.renderToString(
        <ServerContext
          {...{
            dehydratedRouter,
            dehydratedLoaderClient,
          }}
        >
          <App />
        </ServerContext>,
      ),
      {
        headers: {
          'Content-Type': 'text/html',
        },
      },
    )

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
