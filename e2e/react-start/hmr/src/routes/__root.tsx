import {
  ClientOnly,
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
  isMatch,
  useMatches,
} from '@tanstack/react-router'
import type { ReactNode } from 'react'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    ],
  }),
  loader: () => ({
    crumb: 'Home',
  }),
  component: RootComponent,
})

function Breadcrumbs() {
  const matches = useMatches()
  const matchesWithCrumbs = matches.filter((match) =>
    isMatch(match, 'loaderData.crumb'),
  )

  return (
    <nav>
      {matchesWithCrumbs.map((match) => (
        <span data-testid={`crumb-${match.routeId}`} key={match.id}>
          {match.loaderData?.crumb}
        </span>
      ))}
    </nav>
  )
}

function RootComponent() {
  return (
    <RootDocument marker="root-component-baseline">
      <RootContent />
    </RootDocument>
  )
}

function RootDocument({
  children,
  marker,
}: {
  children: ReactNode
  marker: string
}) {
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <p data-testid="root-component-marker">{marker}</p>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

function RootShellDocument({
  children,
  marker,
}: {
  children: ReactNode
  marker: string
}) {
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <div data-testid="root-shell">
          <p data-testid="root-shell-marker">{marker}</p>
          {children}
        </div>
        <Scripts />
      </body>
    </html>
  )
}

function RootContent() {
  return (
    <>
        <Link data-testid="home-link" to="/">
          Home
        </Link>
        <Link data-testid="child-link" to="/child">
          Child
        </Link>
        <Link data-testid="inputs-link" to="/inputs">
          Inputs
        </Link>
        <Link data-testid="component-hmr-link" to="/component-hmr">
          Component HMR
        </Link>
        <Link
          data-testid="component-hmr-inline-split-link"
          to="/component-hmr-inline-split"
        >
          Component HMR Inline Split
        </Link>
        <Link
          data-testid="component-hmr-inline-nosplit-link"
          to="/component-hmr-inline-nosplit"
        >
          Component HMR Inline No Split
        </Link>
        <Link
          data-testid="component-hmr-named-split-link"
          to="/component-hmr-named-split"
        >
          Component HMR Named Split
        </Link>
        <Link
          data-testid="component-hmr-named-nosplit-link"
          to="/component-hmr-named-nosplit"
        >
          Component HMR Named No Split
        </Link>
        <Link
          data-testid="component-hmr-inline-error-split-link"
          to="/component-hmr-inline-error-split"
        >
          Component HMR Inline Error Split
        </Link>
        <Link
          data-testid="component-hmr-named-error-split-link"
          to="/component-hmr-named-error-split"
        >
          Component HMR Named Error Split
        </Link>
        <input data-testid="root-message" defaultValue="root state" />
        <Breadcrumbs />
        <Outlet />
        <ClientOnly>
          <p data-testid="hydrated">hydrated</p>
        </ClientOnly>
    </>
  )
}
