/// <reference types="vite/client" />
import * as React from 'react'
import {
  ClientOnly,
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import appCss from '~/styles/app.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Router Lifecycle Methods E2E' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  context: () => {
    return { rootContextCtx: 'root-context' }
  },
  beforeLoad: () => {
    return { rootBeforeLoadCtx: 'root-beforeLoad' }
  },
  shellComponent: RootDocument,
  component: RootComponent,
})

function RootComponent() {
  const context = Route.useRouteContext()

  return (
    <div data-testid="root-component">
      <div data-testid="root-context">{context.rootContextCtx}</div>
      <div data-testid="root-beforeLoad">{context.rootBeforeLoadCtx}</div>
      <Outlet />
    </div>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <nav>
          <Link to="/" data-testid="link-home">
            Home
          </Link>
          <Link to="/posts" data-testid="link-posts">
            Posts
          </Link>
          <Link
            to="/posts/$postId"
            params={{ postId: '1' }}
            data-testid="link-post-1"
          >
            Post 1
          </Link>
          <Link
            to="/posts/$postId"
            params={{ postId: '2' }}
            data-testid="link-post-2"
          >
            Post 2
          </Link>
          <Link
            to="/posts/$postId/comments"
            params={{ postId: '1' }}
            data-testid="link-post-1-comments"
          >
            Post 1 Comments
          </Link>
          <Link to="/dehydrate-defaults" data-testid="link-dehydrate-defaults">
            Dehydrate Defaults
          </Link>
          <Link to="/dehydrate-all-true" data-testid="link-dehydrate-all-true">
            Dehydrate All True
          </Link>
          <Link
            to="/dehydrate-all-false"
            data-testid="link-dehydrate-all-false"
          >
            Dehydrate All False
          </Link>
          <Link to="/dehydrate-mixed" data-testid="link-dehydrate-mixed">
            Dehydrate Mixed
          </Link>
          <Link
            to="/dehydrate-beforeload-false"
            data-testid="link-dehydrate-beforeload-false"
          >
            Dehydrate BeforeLoad False
          </Link>
          <Link
            to="/dehydrate-loader-false"
            data-testid="link-dehydrate-loader-false"
          >
            Dehydrate Loader False
          </Link>
          <Link
            to="/dehydrate-context-true"
            data-testid="link-dehydrate-context-true"
          >
            Dehydrate Context True
          </Link>
          <Link to="/dehydrate-fn" data-testid="link-dehydrate-fn">
            Dehydrate Functions
          </Link>
          <Link to="/dehydrate-partial" data-testid="link-dehydrate-partial">
            Dehydrate Partial
          </Link>
          <Link to="/revalidate-context" data-testid="link-revalidate-context">
            Revalidate Context
          </Link>
          <Link to="/stale-revalidate" data-testid="link-stale-revalidate">
            Stale Revalidate
          </Link>
        </nav>
        <hr />
        <ClientOnly>
          <div data-testid="hydrated">hydrated</div>
        </ClientOnly>
        {children}
        <TanStackRouterDevtools position="bottom-right" />
        <Scripts />
      </body>
    </html>
  )
}
