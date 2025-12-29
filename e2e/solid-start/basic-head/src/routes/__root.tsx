/// <reference types="vite/client" />
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/solid-router'

import { TanStackRouterDevtoolsInProd } from '@tanstack/solid-router-devtools'
import { HydrationScript } from 'solid-js/web'
import { NotFound } from '~/components/NotFound'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'TanStack Router Head Function Test',
      },
      {
        name: 'description',
        content: 'Testing head() function behavior with async loaders',
      },
    ],
    links: [
      { rel: 'icon', href: '/favicon.ico' },
    ],
  }),
  errorComponent: (props) => <p>{props.error.stack}</p>,
  notFoundComponent: () => <NotFound />,
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
        <div class="p-2 flex gap-2 text-lg">
          <Link
            to="/"
            activeProps={{
              class: 'font-bold',
            }}
            activeOptions={{ exact: true }}
          >
            Home
          </Link>{' '}
          <Link
            to="/article/$id"
            params={{ id: '1' }}
            activeProps={{
              class: 'font-bold',
            }}
          >
            Article 1
          </Link>{' '}
          <Link
            to="/article/$id"
            params={{ id: '2' }}
            activeProps={{
              class: 'font-bold',
            }}
          >
            Article 2
          </Link>
        </div>
        <Outlet />
        <TanStackRouterDevtoolsInProd />
        <Scripts />
      </body>
    </html>
  )
}
