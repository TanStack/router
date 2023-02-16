import { createMemoryHistory, Router } from '@tanstack/router'
import type { APIContext } from 'astro'
import ReactDOMServer from 'react-dom/server'
import { handleEvent, server$ } from '@tanstack/bling/server'
import { ServerContext } from './Hydrate'

server$.addDeserializer({
  apply: (e) => e.$type === 'loaderClient',
  deserialize: (e, event) => event.locals.$loaderClient,
})

// import { createRequestHandler } from '@tanstack/astro-react-router'
export function createRequestHandler() {
  return async ({ request }: APIContext) => {
    const App = await import('./App').then((m) => m.App)
    const routeTree = await import('./routeTree').then((m) => m.routeTree)
    const createLoaderClient = await import('./loaderClient').then(
      (m) => m.createLoaderClient,
    )

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
      <ServerContext
        {...{
          dehydratedRouter,
          dehydratedLoaderClient,
        }}
      >
        <App />
      </ServerContext>,
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
