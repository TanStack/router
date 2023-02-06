import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { Link, Outlet, RootRoute, useMatches } from '@tanstack/react-router'
import type { RouterContext } from '../router'

export const rootRoute = RootRoute.withRouterContext<RouterContext>()({
  component: Root,
})

function Root() {
  const matches = useMatches()

  const titleMatch = matches.reverse().find((d) => d.context?.getTitle)

  const title = titleMatch?.context?.getTitle?.() ?? 'Astro + TanStack Router'

  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title}</title>
        <script src="https://cdn.tailwindcss.com"></script>
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
      </body>
    </html>
  )
}
