import * as React from 'react'
import ReactDOMServer from 'react-dom/server'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import jsesc from 'jsesc'
import { App } from './App'
import { router } from './router'
import { ServerResponse } from 'http'

export async function render(
  opts: { url: string; template: string },
  res: ServerResponse,
) {
  router.reset()

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

    res.write(routerScript)
  })

  const leadingHtml = opts.template.substring(
    0,
    opts.template.indexOf('<!--app-html-->'),
  )

  const tailingHtml = opts.template.substring(
    opts.template.indexOf('<!--app-html-->') + '<!--app-html-->'.length,
  )

  const stream = ReactDOMServer.renderToPipeableStream(
    <RouterProvider router={router}>
      <App />
    </RouterProvider>,
    {
      onShellReady: () => {
        res.write(leadingHtml)
        stream.pipe(res)
      },
      onError: (err) => {
        console.log(err)
      },
      onAllReady: () => {
        res.end(tailingHtml)
      },
    },
  )

  // router.reset()

  // return res
}
