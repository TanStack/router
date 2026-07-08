/// <reference types="vite/client" />
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import * as React from 'react'
import { DefaultCatchBoundary } from '../components/DefaultCatchBoundary'
import { NotFound } from '../components/NotFound'
import appCss from '../styles/app.css?url'
import { seo } from '../utils/seo'
import { DescopeLogo } from '../components/DescopeLogo'
import { DescopeProvider } from '../integrations/descope/provider'
import { getSession } from '../integrations/descope/server'

export const Route = createRootRoute({
  beforeLoad: async () => {
    const user = await getSession()

    return {
      user,
    }
  },
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
        title: 'TanStack Start + Descope',
        description: `Authenticate users with Descope in a TanStack Start application.`,
      }),
    ],
    links: [
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      {
        rel: 'preconnect',
        href: 'https://fonts.gstatic.com',
        crossOrigin: 'anonymous',
      },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap',
      },
      { rel: 'stylesheet', href: appCss },
    ],
  }),
  errorComponent: (props) => {
    return (
      <RootDocument>
        <DefaultCatchBoundary {...props} />
      </RootDocument>
    )
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
  const { user } = Route.useRouteContext()

  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <DescopeProvider>
          <header className="sticky top-0 z-10 bg-[#0a0f1a]/80 backdrop-blur">
            {/* brand gradient accent */}
            <div className="h-0.5 bg-gradient-to-r from-cyan-400 via-teal-300 to-green-400" />
            <nav className="mx-auto flex h-16 max-w-6xl items-center gap-8 border-b border-gray-800/60 px-6">
              <Link
                to="/"
                className="flex items-center gap-3"
                activeOptions={{ exact: true }}
              >
                <span className="font-bold tracking-tight text-white">
                  TanStack Start
                </span>
                <span className="text-sm text-gray-600">×</span>
                <DescopeLogo className="h-5 w-auto" />
              </Link>
              <Link
                to="/profile"
                className="text-sm text-gray-400 hover:text-gray-100"
                activeProps={{
                  className: 'font-semibold text-gray-100',
                }}
              >
                Profile
              </Link>
              <div className="ml-auto flex items-center gap-4 text-sm">
                {user ? (
                  <>
                    <span className="hidden text-gray-500 sm:inline">
                      {user.email ?? user.userId}
                    </span>
                    <Link
                      to="/logout"
                      className="rounded-full border border-gray-700 px-5 py-2 font-semibold text-gray-200 hover:bg-gray-900"
                    >
                      Logout
                    </Link>
                  </>
                ) : (
                  <Link
                    to="/login"
                    className="rounded-full bg-blue-500 px-5 py-2 font-semibold text-white transition hover:bg-blue-400"
                  >
                    Login
                  </Link>
                )}
              </div>
            </nav>
          </header>
          <main>{children}</main>
          <TanStackRouterDevtools position="bottom-right" />
        </DescopeProvider>
        <Scripts />
      </body>
    </html>
  )
}
