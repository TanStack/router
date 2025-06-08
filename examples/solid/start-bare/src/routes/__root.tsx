import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  Scripts,
} from '@tanstack/solid-router'
import appCss from '~/styles/app.css?url'
import type * as Solid from 'solid-js'
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

function RootDocument(props: { children: Solid.JSX.Element }) {
  return (
    <NoHydration>
      <html>
        <head>
          <HydrationScript />
          <HeadContent />
        </head>
        <body>
          <div id="app">
            <Hydration>
              <div class="p-2 flex gap-2 text-lg">
                <Link to="/">Index</Link>
                <Link to="/about">About</Link>
              </div>
              {props.children}
            </Hydration>
          </div>

          <Scripts />
        </body>
      </html>
    </NoHydration>
  )
}
