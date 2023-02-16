import {
  LoaderClient,
  LoaderClientProvider,
  LoaderInstance,
} from '@tanstack/react-loaders'
import { AnyRoute, ReactRouter, RouterProvider } from '@tanstack/react-router'
import { Hydrate } from './Hydrate'
import { server$ } from '@tanstack/bling/server'
import * as React from 'react'

server$.addSerializer({
  apply: (e) => e instanceof LoaderInstance,
  serialize: (e) => ({ $type: 'loaderClient' }),
})

export function StartClient<
  TRouteTree extends AnyRoute,
  TLoaderClient extends LoaderClient<any>,
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
