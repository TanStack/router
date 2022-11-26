import * as React from 'react'
import ReactDOMServer from 'react-dom/server'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import jsesc from 'jsesc'
import { App } from './App'
import { ServerResponse } from 'http'
import { createRouter } from './router'

async function getRouter(opts: { url: string }) {
  const router = createRouter()

  router.reset()

  const memoryHistory = createMemoryHistory({
    initialEntries: [opts.url],
  })

  router.update({
    history: memoryHistory,
  })

  router.mount()() // and unsubscribe immediately

  return router
}

export async function load(opts: { url: string }) {
  const router = await getRouter(opts)

  await router.load()

  const search = router.state.location.search as { __data: { matchId: string } }

  return router.state.matches.find((d) => d.matchId === search.__data.matchId)
    ?.routeLoaderData
}

export async function render(opts: {
  url: string
  template: string
  res: ServerResponse
}) {
  const router = await getRouter(opts)

  // router.getHeadTags()
  // router.getRequestReponse()

  router.load().then(() => {
    const routerState = router.dehydrateState()
    const routerScript = `<script>window.__TANSTACK_ROUTER_STATE__ = JSON.parse(${jsesc(
      JSON.stringify(routerState),
      {
        isScriptContext: true,
        wrap: true,
        json: true,
      },
    )})</script>`

    opts.res.write(routerScript)
  })

  const leadingHtml = opts.template.substring(
    0,
    opts.template.indexOf('<!--app-html-->'),
  )

  const tailingHtml = opts.template.substring(
    opts.template.indexOf('<!--app-html-->') + '<!--app-html-->'.length,
  )

  opts.res.setHeader('Content-Type', 'text/html')

  const stream = ReactDOMServer.renderToPipeableStream(
    <RouterProvider router={router}>
      <App />
    </RouterProvider>,
    {
      onShellReady: () => {
        opts.res.write(leadingHtml)
        stream.pipe(opts.res)
      },
      onError: (err) => {
        console.log(err)
      },
      onAllReady: () => {
        opts.res.end(tailingHtml)
      },
    },
  )

  // router.reset()

  // return res
}
