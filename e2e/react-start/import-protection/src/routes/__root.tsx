import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  Scripts,
} from '@tanstack/react-router'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Import Protection E2E Test' },
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
        <nav>
          <Link to="/">Home</Link>
          {' | '}
          <Link to="/leaky-server-import">Leaky Import</Link>
          {' | '}
          <Link to="/client-only-violations">Client-Only Violations</Link>
          {' | '}
          <Link to="/client-only-jsx">Client-Only JSX</Link>
        </nav>
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}
