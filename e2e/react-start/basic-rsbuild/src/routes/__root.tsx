import * as React from 'react'
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <div>
          <Link
            to="/"
            activeProps={{ className: 'font-bold' }}
            activeOptions={{ exact: true }}
          >
            Home
          </Link>{' '}
          <Link to="/server-fns" activeProps={{ className: 'font-bold' }}>
            Server Functions
          </Link>
        </div>
        <hr />
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}
