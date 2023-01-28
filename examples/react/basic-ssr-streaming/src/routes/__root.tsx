import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import * as React from 'react'
import { Link, Outlet, RootRoute, useRouter } from '@tanstack/react-router'
import { RouterContext } from '../router'
import { useHead } from '../head'

export const rootRoute = RootRoute.withRouterContext<RouterContext>()({
  component: Root,
})

function Root() {
  const head = useHead()
  const router = useRouter()
  // This is weak sauce, but it's just an example.
  // In the future, we'll make meta an official thing
  // and make it async as well to support data
  const titleMatch = [...router.state.currentMatches]
    .reverse()
    .find((d) => d.route.context?.title)

  return (
    <html lang="en">
      <React.StrictMode>
        <head>
          <meta charSet="UTF-8" />
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1.0"
          />
          <title>
            {titleMatch ? titleMatch.route.context?.title : 'Vite App'}
          </title>
          <script src="https://cdn.tailwindcss.com"></script>
          <script
            suppressHydrationWarning
            dangerouslySetInnerHTML={{
              __html: `</script>
              ${head}
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
      </React.StrictMode>
    </html>
  )
}
