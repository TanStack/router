import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/solid-router'
import { HydrationScript } from '@solidjs/web'

export const Route = createRootRoute({
  head: () => ({
    meta: [{ charset: 'utf-8' }],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <html>
      <head>
        <HydrationScript />
      </head>
      <body>
        <HeadContent />
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}
