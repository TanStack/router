import { LoaderClientProvider, LoaderInstance } from '@tanstack/react-loaders'
import { ReactRouter, RouterProvider } from '@tanstack/react-router'
import { Hydrate } from './Hydrate'
import { server$ } from '@tanstack/bling/server'
import * as React from 'react'

server$.addDeserializer({
  apply: (e) => e.$type === 'loaderClient',
  deserialize: (e, event) => event.locals.$loaderClient,
})

export function StartServer({ loaderClient, routeTree }) {
  const router = React.useMemo(
    () =>
      new ReactRouter({
        routeTree,
        context: {
          loaderClient,
        },
        defaultPreload: 'intent',
      }),
    [routeTree, loaderClient],
  )

  return (
    <Hydrate loaderClient={loaderClient} router={router}>
      <LoaderClientProvider loaderClient={loaderClient}>
        <RouterProvider router={router} />
      </LoaderClientProvider>
    </Hydrate>
  )
}
