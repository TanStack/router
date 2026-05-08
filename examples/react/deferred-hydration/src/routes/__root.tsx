/// <reference types="vite/client" />
import * as React from 'react'
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { benchmarkRoutes } from '~/benchmark'
import appCss from '~/styles/app.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      {
        title: 'Deferred Hydration Benchmark',
      },
      {
        name: 'description',
        content:
          'A TanStack Start benchmark for measuring deferred hydration tradeoffs.',
      },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <header className="topbar">
          <Link to="/" className="brand" activeOptions={{ exact: true }}>
            Deferred Hydration Lab
          </Link>
          <nav className="nav-links" aria-label="Benchmark routes">
            {benchmarkRoutes.map((route) => (
              <Link
                key={route.to}
                to={route.to}
                search={{
                  points: 1000,
                }}
                activeProps={{ className: 'active' }}
              >
                {route.label}
              </Link>
            ))}
          </nav>
        </header>
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}
