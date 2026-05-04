import * as React from 'react'
import { Outlet, createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>TanStack Router RN Start Server</title>
      </head>
      <body
        style={{
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          padding: 24,
          maxWidth: 720,
          margin: '0 auto',
          color: '#1f2937',
        }}
      >
        <Outlet />
      </body>
    </html>
  )
}
