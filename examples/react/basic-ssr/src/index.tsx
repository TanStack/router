import * as React from 'react'

import { RouterProvider } from '@tanstack/react-router'
import { LoaderClientProvider } from '@tanstack/react-loaders'
import { createRouter } from './router'
import { createLoaderClient } from './loaderClient'

export function App({
  route,
  loaderClient,
}: {
  router: ReturnType<typeof createRouter>
  loaderClient: ReturnType<typeof createLoaderClient>
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
            __html: `</script>
          ${router.options.context.head}
        <script>`,
          }}
        />
      </head>
      <body>
        <LoaderClientProvider loaderClient={loaderClient}>
          <RouterProvider router={router} />
        </LoaderClientProvider>
      </body>
    </html>
  )
}
