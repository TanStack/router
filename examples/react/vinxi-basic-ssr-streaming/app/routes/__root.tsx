import * as React from 'react'
import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import { Meta, Scripts } from '@tanstack/react-router-server/client'

export const Route = createRootRouteWithContext<{
  assets: React.ReactNode;
}>()({
  component: RootComponent,
  meta: () => [
    {
      title: "Root",
    },
  ],
  links: () => [
    {
      rel: "apple-touch-icon",
      sizes: "180x180",
      href: "/favicons/apple-touch-icon.png",
    },
  ],
  scripts: () => [
    {
      src: "https://cdn.tailwindcss.com",
    },
  ],
});

function RootComponent() {

  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <Meta />
      </head>
      <body>
        <div className="p-2 flex items-center gap-2 text-lg">
          <Link
            to="/"
            activeProps={{
              className: "font-bold",
            }}
            activeOptions={{ exact: true }}
          >
            Home
          </Link>
          <Link
            to="/hello"
            activeProps={{
              className: "font-bold",
            }}
            activeOptions={{ exact: true }}
          >
            Hello
          </Link>
          <Link
            to="/no-title"
            activeProps={{
              className: "font-bold",
            }}
            activeOptions={{ exact: true }}
          >
            No-Title
          </Link>
        </div>
        <hr />
        <Outlet />
        <TanStackRouterDevtools position="bottom-right" />
        <Scripts />
      </body>
    </html>
  );
}
