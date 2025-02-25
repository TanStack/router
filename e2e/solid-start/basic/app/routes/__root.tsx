import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/solid-router'

import * as Solid from 'solid-js'
import { Hydration, HydrationScript, NoHydration } from 'solid-js/web'

import { DefaultCatchBoundary } from '~/components/DefaultCatchBoundary'
import { NotFound } from '~/components/NotFound'
import appCss from '~/styles/app.css?url'
import { seo } from '~/utils/seo'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      ...seo({
        title:
          'TanStack Start | Type-Safe, Client-First, Full-Stack React Framework',
        description: `TanStack Start is a type-safe, client-first, full-stack React framework. `,
      }),
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      {
        rel: 'apple-touch-icon',
        sizes: '180x180',
        href: '/apple-touch-icon.png',
      },
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '32x32',
        href: '/favicon-32x32.png',
      },
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '16x16',
        href: '/favicon-16x16.png',
      },
      { rel: 'manifest', href: '/site.webmanifest', color: '#fffff' },
      { rel: 'icon', href: '/favicon.ico' },
    ],
  }),
  errorComponent: (props) => {
    return (
      <RootDocument>
        <DefaultCatchBoundary {...props} />
      </RootDocument>
    )
  },
  notFoundComponent: () => <NotFound />,
  component: RootComponent,
})

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  )
}

// const RouterDevtools =
//   process.env.NODE_ENV === 'production'
//     ? () => null // Render nothing in production
//     : React.lazy(() =>
//         // Lazy load in development
//         import('@tanstack/router-devtools').then((res) => ({
//           default: res.TanStackRouterDevtools,
//         })),
//       )

function RootDocument({ children }: { children: Solid.JSX.Element }) {
  return (
    <NoHydration>
      <>
        <div id="app">
          <HeadContent />
          <HydrationScript />
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
              to="/posts"
              activeProps={{
                class: 'font-bold',
              }}
            >
              Posts
            </Link>{' '}
            <Link
              to="/users"
              activeProps={{
                class: 'font-bold',
              }}
            >
              Users
            </Link>{' '}
            <Link
              to="/layout-a"
              activeProps={{
                class: 'font-bold',
              }}
            >
              Layout
            </Link>{' '}
            <Link
              to="/scripts"
              activeProps={{
                class: 'font-bold',
              }}
            >
              Scripts
            </Link>{' '}
            <Link
              to="/deferred"
              activeProps={{
                class: 'font-bold',
              }}
            >
              Deferred
            </Link>{' '}
            <Link
              to="/redirect"
              activeProps={{
                class: 'font-bold',
              }}
            >
              redirect
            </Link>{' '}
            <Link
              // @ts-expect-error
              to="/this-route-does-not-exist"
              activeProps={{
                class: 'font-bold',
              }}
            >
              This Route Does Not Exist
            </Link>
          </div>

          <Hydration>{children}</Hydration>

          <Scripts />
        </div>
      </>
    </NoHydration>
  )
}
