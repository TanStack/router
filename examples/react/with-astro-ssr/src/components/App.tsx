import { LoaderClientProvider } from '@tanstack/react-loaders'
import { RouterProvider } from '@tanstack/react-router'
import React from 'react'
import { loaderClient } from '../loaderClient'
import { router } from '../router'

export default function App(props: {
  dehydratedRouter: ReturnType<typeof router.dehydrate>
  dehydratedLoaderClient: ReturnType<typeof loaderClient.dehydrate>
}) {
  React.useState(() => {
    loaderClient.hydrate(props.dehydratedLoaderClient)
    router.hydrate(props.dehydratedRouter)
  })

  return (
    <>
      <LoaderClientProvider loaderClient={loaderClient}>
        <RouterProvider router={router} />
      </LoaderClientProvider>
    </>
  )
}
