import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import type { RouterContext } from '../routerContext'

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    links: [{ rel: 'icon', href: '/images/favicon.ico' }],
    meta: [
      {
        title: 'TanStack Router SSR Search Persistence Example',
      },
      {
        charSet: 'UTF-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1.0',
      },
    ],
    scripts: [
      {
        src: 'https://unpkg.com/@tailwindcss/browser@4',
      },
      ...(!import.meta.env.PROD
        ? [
            {
              type: 'module',
              children: `import RefreshRuntime from "/@react-refresh"
  RefreshRuntime.injectIntoGlobalHook(window)
  window.$RefreshReg$ = () => {}
  window.$RefreshSig$ = () => (type) => type
  window.__vite_plugin_react_preamble_installed__ = true`,
            },
            {
              type: 'module',
              src: '/@vite/client',
            },
          ]
        : []),
      {
        type: 'module',
        src: import.meta.env.PROD
          ? '/static/entry-client.js'
          : '/src/entry-client.tsx',
      },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <div className="p-6">
          <h1 className="text-3xl font-bold mb-4">SSR Search Persistence</h1>
          <p className="text-gray-600 mb-6">
            This example demonstrates server-side search parameter persistence
            using TanStack Router's search middleware with a custom database
            adapter.
          </p>

          <div className="flex gap-4 text-lg mb-6">
            <Link
              to="/"
              activeProps={{
                className: 'font-bold text-blue-600',
              }}
              activeOptions={{ exact: true }}
              className="hover:text-blue-500"
            >
              Home
            </Link>
            <Link
              to="/products"
              activeProps={{
                className: 'font-bold text-blue-600',
              }}
              search={(prev) => prev}
              className="hover:text-blue-500"
            >
              Products
            </Link>
            <Link
              to="/users"
              activeProps={{
                className: 'font-bold text-blue-600',
              }}
              className="hover:text-blue-500"
              search={(prev) => prev}
            >
              Users
            </Link>
            <Link
              to="/database"
              activeProps={{
                className: 'font-bold text-blue-600',
              }}
              className="hover:text-blue-500"
            >
              Database
            </Link>
          </div>

          <hr className="mb-6" />
          <Outlet />
          <TanStackRouterDevtools position="bottom-right" />
        </div>
        <Scripts />
      </body>
    </html>
  )
}
