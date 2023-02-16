import {
  LoaderClient,
  LoaderClientProvider,
  LoaderInstance,
} from '@tanstack/react-loaders'
import { AnyRoute, ReactRouter, RouterProvider } from '@tanstack/react-router'
import { Hydrate } from './Hydrate'
import { server$ } from '@tanstack/bling/server'
import * as React from 'react'

server$.addDeserializer({
  apply: (e) => e.$type === 'loaderClient',
  deserialize: (e, event) => event.locals.$loaderClient,
})

export function StartServer<
  TLoaderClient extends LoaderClient<any>,
  TRouteTree extends AnyRoute,
>({
  loaderClient,
  routeTree,
}: {
  loaderClient: TLoaderClient
  routeTree: TRouteTree
}) {
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
    <Hydrate loaderClient={loaderClient} router={router as any}>
      <LoaderClientProvider loaderClient={loaderClient}>
        <RouterProvider router={router} />
      </LoaderClientProvider>
    </Hydrate>
  )
}
