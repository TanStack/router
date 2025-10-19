import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/solid-router'
import { TanStackRouterDevtools } from '@tanstack/solid-router-devtools'
import { HydrationScript } from 'solid-js/web'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charset: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'TanStack Start Starter',
      },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <html>
      <head>
        <HeadContent />
        <HydrationScript />
      </head>
      <body>
        <Outlet />
        <TanStackRouterDevtools position="bottom-right" />
        <Scripts />
      </body>
    </html>
  )
}
