import * as React from 'react'
import ReactDOMServer from 'react-dom/server'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import jsesc from 'jsesc'
import { App } from './App'
import { createRouter } from './router'
import { ServerResponse } from 'http'

export async function render(opts: {
  url: string
  template: string
  res: ServerResponse
}) {
  const router = createRouter()

  const memoryHistory = createMemoryHistory({
    initialEntries: [opts.url],
  })

  router.update({
    history: memoryHistory,
  })

  router.mount()() // and unsubscribe immediately

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

    console.log('state')
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
        console.log('shell')
        stream.pipe(opts.res)
      },
      onError: (err) => {
        console.log(err)
      },
      onAllReady: () => {
        console.log('done')
        opts.res.end(tailingHtml)
      },
    },
  )
}
