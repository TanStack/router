/// <reference types="vite/client" />
import {
  ClientOnly,
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import type { ReactNode } from 'react'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <RootDocument>
      <RootContent />
    </RootDocument>
  )
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

function RootContent() {
  const navLinks = [
    { testId: 'nav-home', to: '/', label: 'Home' },
    {
      testId: 'nav-global-css',
      to: '/rsc-hmr-global-css',
      label: 'Global CSS',
    },
    {
      testId: 'nav-css-modules',
      to: '/rsc-hmr-css-modules',
      label: 'CSS Modules',
    },
  ] as const

  return (
    <>
      <nav style={{ display: 'flex', gap: 12, padding: 12 }}>
        {navLinks.map((link) => (
          <Link
            activeProps={{ style: { fontWeight: 'bold' } }}
            data-testid={link.testId}
            key={link.testId}
            to={link.to}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <ClientOnly>
        <span data-testid="hydrated">hydrated</span>
      </ClientOnly>
      <Outlet />
    </>
  )
}
