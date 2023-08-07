import { Link, Outlet, RouterContext } from '@tanstack/router'

import { DehydrateRouter } from '@tanstack/react-start/client'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'

import type { createServerSideHelpers } from '@trpc/react-query/server'
import type { AppRouter } from '../server/trpc'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

export const routerContext = new RouterContext<{
  ssg: ReturnType<typeof createServerSideHelpers<AppRouter>>
  head: string
}>()

export const rootRoute = routerContext.createRootRoute({
  component: Root,
})

function Root() {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Vite App</title>
        {/* <script src="https://cdn.tailwindcss.com" /> */}
        <script
          type="module"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `
              import RefreshRuntime from "/@react-refresh"
              RefreshRuntime.injectIntoGlobalHook(window)
              window.$RefreshReg$ = () => {}
              window.$RefreshSig$ = () => (type) => type
              window.__vite_plugin_react_preamble_installed__ = true
            `,
          }}
        />
        <script type="module" src="/@vite/client" />
        <script type="module" src="/src/entry-client.tsx" />
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
        <ReactQueryDevtools />
        <DehydrateRouter />
      </body>
    </html>
  )
}
