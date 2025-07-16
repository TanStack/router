/// <reference types="vite/client" />
import * as React from 'react'
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'

import { DefaultCatchBoundary } from '~/components/DefaultCatchBoundary'
import { NotFound } from '~/components/NotFound'
import appCss from '~/styles/app.css?url'
import { seo } from '~/utils/seo'

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
      ...seo({
        title: 'Optional Parameters Demo | TanStack Start + Router',
        description: 'Testing optional parameters in TanStack Start and Router',
      }),
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      {
        rel: 'apple-touch-icon',
        sizes: '180x180',
        href: '/apple-touch-icon.png',
      },
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '32x32',
        href: '/favicon-32x32.png',
      },
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '16x16',
        href: '/favicon-16x16.png',
      },
      { rel: 'manifest', href: '/site.webmanifest', color: '#fffff' },
      { rel: 'icon', href: '/favicon.ico' },
    ],
  }),
  errorComponent: (props) => {
    return <DefaultCatchBoundary {...props} />
  },
  notFoundComponent: () => <NotFound />,
  component: RootComponent,
})

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <div className="min-h-screen bg-gray-50">
          <header className="bg-white shadow border-b">
            <div className="container mx-auto px-4 py-4">
              <h1 className="text-2xl font-bold text-gray-900 mb-4">
                Optional Parameters Demo
              </h1>
              <nav className="flex gap-6 text-sm">
                <Link
                  to="/"
                  activeProps={{ className: 'font-bold text-blue-600' }}
                  activeOptions={{ exact: true }}
                  className="hover:text-blue-600 transition-colors"
                >
                  Home
                </Link>
                <Link
                  to="/blog/{-$category}"
                  params={{}}
                  activeProps={{ className: 'font-bold text-blue-600' }}
                  className="hover:text-blue-600 transition-colors"
                >
                  Blog
                </Link>
                <Link
                  to="/users/$id/{-$tab}"
                  params={{ id: '1' }}
                  activeProps={{ className: 'font-bold text-blue-600' }}
                  className="hover:text-blue-600 transition-colors"
                >
                  Users
                </Link>
                <Link
                  to="/api/v{-$version}/{-$endpoint}"
                  params={{}}
                  activeProps={{ className: 'font-bold text-blue-600' }}
                  className="hover:text-blue-600 transition-colors"
                >
                  API
                </Link>
              </nav>
            </div>
          </header>
          <main className="container mx-auto px-4 py-8">{children}</main>
        </div>
        <Scripts />
      </body>
    </html>
  )
}
