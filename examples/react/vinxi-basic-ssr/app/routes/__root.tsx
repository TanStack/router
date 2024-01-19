import * as React from 'react'
import {
  Link,
  Outlet,
  rootRouteWithContext,
  useRouter,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import { DehydrateRouter } from '@tanstack/react-router-server/client'

import '../style.css'

export const Route = rootRouteWithContext<{
  assets: React.ReactNode
}>()({
  component: RootComponent,
})

function RootComponent() {
  const router = useRouter()

  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Vite App</title>
        <script src="https://cdn.tailwindcss.com" />
        {router.options.context.assets}
      </head>
      <body>
        <div className="p-2 flex gap-2 text-lg">
          <Link
            to="/"
            activeProps={{
              className: 'font-bold',
            }}
            activeOptions={{ exact: true }}
          >
            Home
          </Link>{' '}
          <Link
            to="/hello"
            activeProps={{
              className: 'font-bold',
            }}
            activeOptions={{ exact: true }}
          >
            Hello
          </Link>
        </div>
        <hr />
        <Outlet />
        <TanStackRouterDevtools position="bottom-right" />
        <DehydrateRouter />
      </body>
    </html>
  )
}
