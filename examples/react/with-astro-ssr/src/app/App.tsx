import * as React from 'react'
import { LoaderClientProvider } from '@tanstack/react-loaders'
import { RouterProvider } from '@tanstack/router'
import { loaderClient } from './loaderClient'
import { router } from './router'
import { Hydrate } from './Hydrate'

export function App() {
  return (
    <Hydrate loaderClient={loaderClient} router={router}>
      <LoaderClientProvider loaderClient={loaderClient}>
        <RouterProvider router={router} />
      </LoaderClientProvider>
    </Hydrate>
  )
}
