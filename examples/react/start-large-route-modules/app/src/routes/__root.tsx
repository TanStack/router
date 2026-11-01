/// <reference types="vite/client" />
import type { ReactNode } from 'react'
import {
  HeadContent,
  Link,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { account } from '../routeScope.gen'
import '../styles.css'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Large route modules' },
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
          <Link to="/" className="brand">
            Large route modules
          </Link>
          <nav className="nav" aria-label="Main">
            <Link to="/">Modules</Link>
            <account.Link to="/">Account</account.Link>
          </nav>
        </header>
        <main className="page">{children}</main>
        <Scripts />
      </body>
    </html>
  )
}
