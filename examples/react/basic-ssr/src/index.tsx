import * as React from 'react'

import { RouterProvider } from '@tanstack/react-router'
import { createRouter } from './router'

export function App({ router }: { router: ReturnType<typeof createRouter> }) {
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
        <RouterProvider router={router} />
      </body>
    </html>
  )
}
