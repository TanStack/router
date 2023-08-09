import * as React from 'react'

import { RegisteredRouter, RouterProvider } from '@tanstack/react-router'
import {
  LoaderClientProvider,
  RegisteredLoaderClient,
} from '@tanstack/react-loaders'

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
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Vite App</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `</script>${head}<script>`,
          }}
        />
      </head>
      <body>
        <LoaderClientProvider client={loaderClient}>
          <RouterProvider router={router} />
        </LoaderClientProvider>
      </body>
    </html>
  )
}
