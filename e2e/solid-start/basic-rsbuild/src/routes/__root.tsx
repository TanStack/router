import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/solid-router'
import { HydrationScript } from 'solid-js/web'

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
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <html>
      <head>
        <HydrationScript />
        <HeadContent />
      </head>
      <body>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Link
            to="/"
            activeProps={{ class: 'font-bold' }}
            activeOptions={{ exact: true }}
          >
            Home
          </Link>
          <Link to="/server-fns" activeProps={{ class: 'font-bold' }}>
            Server Functions
          </Link>
        </div>
        <hr />
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}
