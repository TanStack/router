import * as React from 'react'

import { RegisteredRouter, RouterProvider } from '@tanstack/router'
import {
  LoaderClientProvider,
  RegisteredLoaderClient,
} from '@tanstack/react-loaders'
import { HeadProvider } from './head'

export function App({
  router,
  loaderClient,
  head,
}: {
  router: RegisteredRouter
  loaderClient: RegisteredLoaderClient
  head: string
}) {
  return (
    <HeadProvider value={head}>
      <LoaderClientProvider loaderClient={loaderClient}>
        <RouterProvider router={router} />
      </LoaderClientProvider>
    </HeadProvider>
  )
}
