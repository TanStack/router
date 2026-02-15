/// <reference types="vite/client" />
import * as React from 'react'
import {
  HeadContent,
  Link,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import type { RouterContext } from '~/router'
import appCss from '~/styles/app.css?url'

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  shellComponent: RootDocument,
})

const RouterDevtools =
  process.env.NODE_ENV === 'production'
    ? () => null
    : React.lazy(() =>
        import('@tanstack/react-router-devtools').then((res) => ({
          default: res.TanStackRouterDevtools,
        })),
      )

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <div className="p-2 flex gap-3 text-lg">
          <Link
            to="/"
            activeOptions={{ exact: true }}
            activeProps={{ className: 'font-bold' }}
          >
            Home
          </Link>
          <Link
            to="/next"
            activeOptions={{ exact: true }}
            activeProps={{ className: 'font-bold' }}
          >
            Next
          </Link>
        </div>
        <hr />
        {children}
        <RouterDevtools position="bottom-right" />
        <Scripts />
      </body>
    </html>
  )
}
