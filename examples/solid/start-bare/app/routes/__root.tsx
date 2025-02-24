import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  Scripts,
} from '@tanstack/solid-router'
import appCss from '~/styles/app.css?url'
import * as Solid from 'solid-js'

export const Route = createRootRoute({
  head: () => ({
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  )
}

function RootDocument({ children }: { children: Solid.JSX.Element }) {
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <div class="p-2 flex gap-2 text-lg">
          <Link to="/">Index</Link>
          <Link to="/about">About</Link>
        </div>

        {children}
        <Scripts />
      </body>
    </html>
  )
}
