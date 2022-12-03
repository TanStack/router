import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import * as React from 'react'
import {
  createRouteConfig,
  Link,
  Outlet,
  useRouter,
} from '@tanstack/react-router'

createRouteConfig({
  component: Root,
})

function Root() {
  const router = useRouter()

  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Vite App</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `</script>
              ${router.options.context.head}
            <script>`,
          }}
        />
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
            to="/posts"
            activeProps={{
              className: 'font-bold',
            }}
          >
            Posts
          </Link>
        </div>
        <hr />
        <Outlet /> {/* Start rendering router matches */}
        <TanStackRouterDevtools position="bottom-right" />
        <script type="module" src="/src/entry-client.tsx"></script>
      </body>
    </html>
  )
}
