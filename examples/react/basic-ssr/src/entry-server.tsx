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

  router.mount()

  await router.loadLocation()

  const { status, location, matches, lastUpdated } = router.state

  const payload = {
    status,
    location,
    matches: matches.map((match) => {
      const { status, routeLoaderData, loaderData, isInvalid, invalidAt } =
        match

      return {
        status,
        routeLoaderData,
        loaderData,
        isInvalid,
        invalidAt,
      }
    }),
    lastUpdated,
  }

  return [
    `<script>window.__TANSTACK_ROUTER_STATE__ = JSON.parse(${jsesc(
      JSON.stringify(payload),
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
}
