/// <reference types="vite/client" />
import {
  ClientOnly,
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'

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
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <nav data-testid="main-nav">
          <Link to="/" data-testid="nav-home">
            Home
          </Link>{' '}
          <Link to="/co-located" data-testid="nav-co-located">
            Co-located
          </Link>{' '}
          <Link to="/co-located-css-module" data-testid="nav-co-located-css">
            Co-located + CSS module
          </Link>{' '}
          <Link to="/separate-file" data-testid="nav-separate-file">
            Separate file
          </Link>
        </nav>

        <ClientOnly>
          <p data-testid="hydrated">hydrated</p>
        </ClientOnly>

        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}
