import {
  DehydratedLoaderClient,
  LoaderClient,
  LoaderClientProvider,
  LoaderInstance,
} from '@tanstack/react-loaders'
import {
  AnyRoute,
  DehydratedRouter,
  ReactRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { Hydrate, ServerContext } from './Hydrate'
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
  dehydratedLoaderClient,
  dehydratedRouter,
}: {
  loaderClient: TLoaderClient
  routeTree: TRouteTree
  dehydratedRouter: DehydratedRouter
  dehydratedLoaderClient: DehydratedLoaderClient
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
    <ServerContext
      dehydratedLoaderClient={dehydratedLoaderClient}
      dehydratedRouter={dehydratedRouter}
    >
      <Hydrate loaderClient={loaderClient} router={router as any}>
        <LoaderClientProvider loaderClient={loaderClient}>
          <RouterProvider router={router} />
        </LoaderClientProvider>
      </Hydrate>
    </ServerContext>
  )
}
