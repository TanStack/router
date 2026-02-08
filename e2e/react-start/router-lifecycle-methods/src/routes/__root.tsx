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
          <Link to="/serialize-defaults" data-testid="link-serialize-defaults">
            Serialize Defaults
          </Link>
          <Link to="/serialize-all-true" data-testid="link-serialize-all-true">
            Serialize All True
          </Link>
          <Link
            to="/serialize-all-false"
            data-testid="link-serialize-all-false"
          >
            Serialize All False
          </Link>
          <Link to="/serialize-mixed" data-testid="link-serialize-mixed">
            Serialize Mixed
          </Link>
          <Link
            to="/serialize-beforeload-false"
            data-testid="link-serialize-beforeload-false"
          >
            Serialize BeforeLoad False
          </Link>
          <Link
            to="/serialize-loader-false"
            data-testid="link-serialize-loader-false"
          >
            Serialize Loader False
          </Link>
          <Link
            to="/serialize-context-true"
            data-testid="link-serialize-context-true"
          >
            Serialize Context True
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
