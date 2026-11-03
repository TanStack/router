/// <reference types="vite/client" />
import * as React from 'react'
import type { ReactNode } from 'react'
import {
  ClientOnly,
  HeadContent,
  Link,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { catalog, notes, team } from '../routeScope.gen'
import '../styles.css'

// The router devtools, in development only.
const RouterDevtools = import.meta.env.DEV
  ? React.lazy(() =>
      import('@tanstack/react-router-devtools').then((module) => ({
        default: module.TanStackRouterDevtools,
      })),
    )
  : () => null

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Acme Store' },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <header className="topbar">
          <Link to="/" className="brand" aria-label="Acme Store home">
            <PlanMark />
            Acme <small>Store</small>
          </Link>
          <nav className="nav" aria-label="Main">
            <catalog.Link to="/">Catalog</catalog.Link>
            <catalog.Link to="/$productId" params={{ productId: 'lamp' }}>
              Desk lamp
            </catalog.Link>
            <notes.Link to="/">Notes</notes.Link>
            <span className="nav-group">
              {/* The team is mounted below `/orgs/$orgId`: links into it pass `orgId`. */}
              <team.Link to="/" params={{ orgId: 'acme' }}>
                Acme team
              </team.Link>
              <team.Link to="/" params={{ orgId: 'globex' }}>
                Globex team
              </team.Link>
            </span>
          </nav>
          <ClientOnly fallback={<p className="status">server-rendered</p>}>
            <p className="status hydrated" data-testid="hydrated">
              hydrated
            </p>
          </ClientOnly>
        </header>
        <main className="page">{children}</main>
        <React.Suspense fallback={null}>
          <RouterDevtools />
        </React.Suspense>
        <Scripts />
      </body>
    </html>
  )
}

/** A small floor plan: outer walls with a door, two inner walls. */
function PlanMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 18 18" aria-hidden="true">
      <path
        d="M7 17H1V1h16v16h-6M1 8h8M12 1v6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  )
}
