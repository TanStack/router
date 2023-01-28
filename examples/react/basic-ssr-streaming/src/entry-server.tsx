import * as React from 'react'
import ReactDOMServer from 'react-dom/server'
import {
  createMemoryHistory,
  Router,
  RouterProvider,
} from '@tanstack/react-router'
import isbot from 'isbot'
import jsesc from 'jsesc'
import { ServerResponse } from 'http'
import express from 'express'

// index.js
import '../src-old/fetch-polyfill'
import { createLoaderClient } from './loaderClient'
import { routeTree } from './routeTree'

async function getRouter(opts: { url: string }) {
  const loaderClient = createLoaderClient()

  const router = new Router({
    routeTree: routeTree,
    context: {
      loaderClient,
    },
  })

  const memoryHistory = createMemoryHistory({
    initialEntries: [opts.url],
  })

  router.update({
    history: memoryHistory,
  })

  return { router, loaderClient }
}

export async function render(opts: {
  url: string
  head: string
  req: express.Request
  res: ServerResponse
}) {
  const { router, loaderClient } = await getRouter(opts)

  // ssrFooter: () => {
  //   // After the router has been fully loaded, serialize its
  //   // state right into the HTML. This way, the client can
  //   // hydrate the router with the same state that the server
  //   // used to render the HTML.
  //   const routerState = router.dehydrate()
  //   return (
  //     <>
  //       <script
  //         suppressHydrationWarning
  //         dangerouslySetInnerHTML={{
  //           __html: `
  //             window.__TANSTACK_DEHYDRATED_ROUTER__ = JSON.parse(${jsesc(
  //               JSON.stringify(routerState),
  //               {
  //                 isScriptContext: true,
  //                 wrap: true,
  //                 json: true,
  //               },
  //             )})
  //           `,
  //         }}
  //       ></script>
  //     </>
  //   )
  // },

  // Kick off the router loading sequence, but don't wait for it to finish
  router.load()

  // Track errors
  let didError = false

  // Clever way to get the right callback. Thanks Remix!
  const callbackName = isbot(opts.req.headers['user-agent'])
    ? 'onAllReady'
    : 'onShellReady'

  const stream = ReactDOMServer.renderToPipeableStream(
    <RouterProvider
      router={router}
      loaderClient={loaderClient}
      head={opts.head}
    />,
    {
      [callbackName]: () => {
        opts.res.statusCode = didError ? 500 : 200
        opts.res.setHeader('Content-type', 'text/html')
        stream.pipe(opts.res)
      },
      onError: (err) => {
        didError = true
        console.log(err)
      },
    },
  )

  setTimeout(() => stream.abort(), 10000)
}
