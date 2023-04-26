import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import {
  ErrorComponent,
  Link,
  Outlet,
  RootRoute,
  useRouter,
} from '@tanstack/router'

import { Scripts } from '@tanstack/react-start/client'
import type { RegisteredLoaderClient } from '@tanstack/react-loaders'
import { secret } from '../secrets.server$'

export interface RouterContext {
  loaderClient: RegisteredLoaderClient
}

export const rootRoute = RootRoute.withRouterContext<RouterContext>()({
  wrapInSuspense: false,
  errorComponent: ({ error }) => <ErrorComponent error={error} />,
  component: function Root() {
    const router = useRouter()

    const titleMatch = [...router.state.currentMatches]
      .reverse()
      .find((d) => d.routeContext?.getTitle)

    const title = titleMatch?.context?.getTitle?.() ?? 'Astro + TanStack Router'

    console.log(secret)

    return (
      <html lang="en">
        <head>
          <meta charSet="UTF-8" />
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1.0"
          />
          <title>{title}</title>
          <script src="https://cdn.tailwindcss.com" />
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
          <Scripts />
        </body>
      </html>
    )
  },
})
