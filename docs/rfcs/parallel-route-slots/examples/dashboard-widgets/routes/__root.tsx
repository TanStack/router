// @ts-nocheck
// Example only - this is a conceptual demonstration

import { createRootRoute, Outlet } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
    <html>
      <head>
        <title>Dashboard App</title>
      </head>
      <body>
        <header>
          <nav>{/* main navigation */}</nav>
        </header>
        <Outlet />
      </body>
    </html>
  )
}
