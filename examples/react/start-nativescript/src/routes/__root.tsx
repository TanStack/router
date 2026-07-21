/// <reference types="vite/client" />
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import appCss from '~/styles/app.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [{ title: 'TanStack Start + NativeScript' }],
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
        <header className="site-header">
          <strong>TanStack Native</strong>
          <nav>
            <Link to="/">Home</Link>
            <Link to="/search" search={{ q: 'router' }}>
              Search
            </Link>
          </nav>
        </header>
        <main>
          <Outlet />
        </main>
        <Scripts />
      </body>
    </html>
  )
}
