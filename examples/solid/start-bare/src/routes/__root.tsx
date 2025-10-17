/// <reference types="vite/client" />
import { createRootRoute, HeadContent, Link, Outlet, Scripts } from '@tanstack/solid-router'
import appCss from '~/styles/app.css?url'
import * as Solid from 'solid-js'
import { Hydration, HydrationScript, NoHydration } from 'solid-js/web'

export const Route = createRootRoute({
  head: () => ({
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: Solid.JSX.Element }) {
  return (
    <NoHydration>
      <html>
        <head>
          <HeadContent />
          <HydrationScript />
        </head>
        <body>
          <Hydration>
            {children}
          </Hydration>
          <Scripts />
        </body>
      </html>
    </NoHydration>
  )
}