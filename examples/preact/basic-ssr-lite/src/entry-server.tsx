import * as React from 'react'
import ReactDOMServer from 'react-dom/server'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import jsesc from 'jsesc'
import { App } from './App'
import { router } from './router'

export async function render(url: string) {
  const memoryHistory = createMemoryHistory({
    initialEntries: [url],
  })

  router.update({
    history: memoryHistory,
  })

  const unsub = router.mount()
  await router.load()

  const routerState = router.dehydrateState()

  const res = [
    `<script>window.__TANSTACK_ROUTER_STATE__ = JSON.parse(${jsesc(
      JSON.stringify(routerState),
      {
        isScriptContext: true,
        wrap: true,
        json: true,
      },
    )})</script>`,
    ReactDOMServer.renderToString(
      <RouterProvider router={router}>
        <App />
      </RouterProvider>,
    ),
  ]

  unsub()
  router.reset()

  return res
}
