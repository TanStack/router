/// <reference types="vite/client" />
import * as React from 'react'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import appCss from '~/styles/app.css?url'
import { getOrySession, getLogoutUrl } from '~/utils/orySession'
import type { OrySession } from '~/utils/orySession'

const ORY_BASE = import.meta.env.VITE_ORY_SDK_URL ?? 'http://localhost:4000'

export type AuthContext = {
  session: OrySession | null
  isAuthenticated: boolean
}

export const Route = createRootRoute({
  head: () => ({
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  beforeLoad: async () => {
    const session = await getOrySession()
    const isAuthenticated = !!session?.identity
    return {
      auth: {
        session,
        isAuthenticated,
      } satisfies AuthContext,
    }
  },

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
  const { auth } = Route.useRouteContext()

  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <nav style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1.5rem',
          padding: '0.85rem 1rem',
          background: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(8px)',
          borderBottom: '1px solid rgba(139, 92, 246, 0.2)',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}>
          <Link to="/" style={{ color: '#c4b5fd', textDecoration: 'none', fontWeight: 500, margin: 0 }}>Home</Link>
          <Link to="/profile" style={{ color: '#c4b5fd', textDecoration: 'none', fontWeight: 500, margin: 0 }}>Profile</Link>
          {auth.isAuthenticated ? (
            <a
              href="#"
              style={{ color: '#f87171', textDecoration: 'none', fontWeight: 500, margin: 0 }}
              onClick={async (e) => {
                e.preventDefault()
                const url = await getLogoutUrl()
                if (url) window.location.href = url
              }}
            >Logout</a>
          ) : (
            <a href={`${ORY_BASE}/self-service/login/browser`} style={{ color: '#86efac', textDecoration: 'none', fontWeight: 600, margin: 0 }}>Login</a>
          )}
        </nav>

        {children}
        <TanStackRouterDevtools position="bottom-right" />
        <Scripts />
      </body>
    </html>
  )
}
