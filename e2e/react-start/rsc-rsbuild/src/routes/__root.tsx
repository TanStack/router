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
      {
        name: 'theme-color',
        content: '#ffffff',
      },
    ],
    links: [
      {
        rel: 'icon',
        href: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E',
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
          <Link
            to="/rsc-basic"
            activeProps={{ className: 'font-bold' }}
            data-testid="nav-rsc-basic"
          >
            RSC Basic
          </Link>{' '}
          <Link
            to="/rsc-css-modules"
            activeProps={{ className: 'font-bold' }}
            data-testid="nav-css-modules"
          >
            CSS Modules
          </Link>{' '}
          <Link
            to="/rsc-query-no-loader-css"
            activeProps={{ className: 'font-bold' }}
            data-testid="nav-rsc-query-no-loader-css"
          >
            Render-Suspended CSS
          </Link>{' '}
          <Link
            to="/rsc-css-alt"
            activeProps={{ className: 'font-bold' }}
            data-testid="nav-css-alt"
          >
            CSS Alt
          </Link>{' '}
          <Link
            to="/rsc-css-conditional"
            activeProps={{ className: 'font-bold' }}
            data-testid="nav-css-conditional"
          >
            CSS Conditional
          </Link>{' '}
          <Link
            to="/rsc-slots"
            activeProps={{ className: 'font-bold' }}
            data-testid="nav-slots"
          >
            Slots
          </Link>{' '}
          <Link
            to="/rsc-client-in-rsc"
            activeProps={{ className: 'font-bold' }}
            data-testid="nav-client-in-rsc"
          >
            Client-in-RSC
          </Link>
        </div>
        <hr />
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}
