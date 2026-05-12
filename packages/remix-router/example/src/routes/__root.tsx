import { createRootRoute } from '@tanstack/remix-router'
import { Link, Outlet } from '@tanstack/remix-router'
import type { Handle } from '@remix-run/ui'

function RootComponent(_handle: Handle) {
  return () => (
    <html>
      <head>
        <title>remix-router demo</title>
      </head>
      <body>
        <nav>
          <Link to="/">Home</Link>
          {' · '}
          <Link to="/users">Users</Link>
        </nav>
        <hr />
        <Outlet />
      </body>
    </html>
  )
}

export const Route = createRootRoute({
  component: RootComponent,
})
