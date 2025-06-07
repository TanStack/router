import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  Scripts,
} from '@tanstack/solid-router'
import appCss from '~/styles/app.css?url'
import * as Solid from 'solid-js'
import { TanStackRouterDevtools } from '@tanstack/solid-router-devtools'
import { Hydration, HydrationScript, NoHydration } from 'solid-js/web'

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
    <NoHydration>
      <html>
        <head>
          <HydrationScript />
          <HeadContent />
        </head>
        <body>
          <Hydration>
            <div class="p-2 flex gap-2 text-lg">
              <Link to="/">Index</Link>
              <Link to="/about">About</Link>
            </div>
            {children}
            <TanStackRouterDevtools position="bottom-right" />
            <Scripts />
          </Hydration>
        </body>
      </html>
    </NoHydration>
  )
}
