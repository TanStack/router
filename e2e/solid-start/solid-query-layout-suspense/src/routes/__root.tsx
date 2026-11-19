import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/solid-router'
import { Loading } from 'solid-js'

export const Route = createRootRouteWithContext()({
  head: () => ({ meta: [{ charset: 'utf-8' }] }),
  shellComponent: RootDocument,
})

function RootDocument() {
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
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
