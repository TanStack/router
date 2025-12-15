/// <reference types="vite/client" />
import * as React from 'react'
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import appCss from '~/styles/app.css?url'

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
      {
        title: 'Split Exports E2E Test',
      },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
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
        <div className="p-2 flex gap-2 text-lg">
          <Link
            to="/"
            activeProps={{ className: 'font-bold' }}
            activeOptions={{ exact: true }}
          >
            Home
          </Link>
          <Link to="/direct-import" activeProps={{ className: 'font-bold' }}>
            Direct Import
          </Link>
          <Link to="/reexport-import" activeProps={{ className: 'font-bold' }}>
            Re-export Import
          </Link>
          <Link to="/alias-import" activeProps={{ className: 'font-bold' }}>
            Alias Import
          </Link>
        </div>
        <hr />
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}
