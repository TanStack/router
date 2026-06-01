import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/solid-router'
import { Loading } from 'solid-js'
import { HydrationScript } from '@solidjs/web'

export const Route = createRootRouteWithContext()({
  head: () => ({ meta: [{ charset: 'utf-8' }] }),
  shellComponent: RootDocument,
})

function RootDocument() {
  return (
    <html>
      <head>
        <HydrationScript />
      </head>
      <body>
        <HeadContent />
        <nav>
          <Link to="/">Home</Link> <Link to="/layout/page2">👉 To page2</Link>
        </nav>
        <Loading>
          <Outlet />
        </Loading>
        <Scripts />
      </body>
    </html>
  )
}
