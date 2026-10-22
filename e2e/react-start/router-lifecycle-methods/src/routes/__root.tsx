/// <reference types="vite/client" />
import * as React from 'react'
import {
  ClientOnly,
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
  useRouterState,
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

const links: Array<{
  to: string
  params?: Record<string, string>
  id: string
  label: string
}> = [
  { to: '/', id: 'home', label: 'Home' },
  { to: '/posts', id: 'posts', label: 'Posts' },
  {
    to: '/posts/$postId',
    params: { postId: '1' },
    id: 'post-1',
    label: 'Post 1',
  },
  {
    to: '/posts/$postId',
    params: { postId: '2' },
    id: 'post-2',
    label: 'Post 2',
  },
  {
    to: '/posts/$postId/comments',
    params: { postId: '1' },
    id: 'post-1-comments',
    label: 'Post 1 Comments',
  },
  {
    to: '/cached-auth/$user',
    params: { user: 'alice' },
    id: 'cached-auth-alice',
    label: 'Cached auth (alice)',
  },
  {
    to: '/cached-auth/$user',
    params: { user: 'nobody' },
    id: 'cached-auth-nobody',
    label: 'Cached auth (nobody)',
  },
  {
    to: '/query-context/$postId',
    params: { postId: '1' },
    id: 'query-context',
    label: 'Query context',
  },
  {
    to: '/revalidate-fn',
    id: 'revalidate-fn',
    label: 'Revalidate fn',
  },
  {
    to: '/dehydrate-defaults',
    id: 'dehydrate-defaults',
    label: 'Dehydrate Defaults',
  },
  {
    to: '/dehydrate-all-true',
    id: 'dehydrate-all-true',
    label: 'Dehydrate All True',
  },
  {
    to: '/dehydrate-all-false',
    id: 'dehydrate-all-false',
    label: 'Dehydrate All False',
  },
  { to: '/dehydrate-mixed', id: 'dehydrate-mixed', label: 'Dehydrate Mixed' },
  {
    to: '/dehydrate-beforeload-false',
    id: 'dehydrate-beforeload-false',
    label: 'Dehydrate BeforeLoad False',
  },
  {
    to: '/dehydrate-loader-false',
    id: 'dehydrate-loader-false',
    label: 'Dehydrate Loader False',
  },
  {
    to: '/dehydrate-context-true',
    id: 'dehydrate-context-true',
    label: 'Dehydrate Context True',
  },
  {
    to: '/dehydrate-partial/$locale',
    params: { locale: 'de-DE' },
    id: 'dehydrate-partial',
    label: 'Dehydrate Partial',
  },
  {
    to: '/hydrated-narrowing',
    id: 'hydrated-narrowing',
    label: 'Hydrated narrowing',
  },
  { to: '/full-value', id: 'full-value', label: 'Full value' },
  { to: '/void-guard', id: 'void-guard', label: 'Void guard' },
  {
    to: '/ssr-false-context',
    id: 'ssr-false-context',
    label: 'SSR false context',
  },
  { to: '/async-codec', id: 'async-codec', label: 'Async codec' },
  {
    to: '/codec-error-dehydrate-throws',
    id: 'codec-error-dehydrate-throws',
    label: 'Codec error: dehydrate throws',
  },
  {
    to: '/codec-error-hydrate-throws',
    id: 'codec-error-hydrate-throws',
    label: 'Codec error: hydrate throws',
  },
  {
    to: '/codec-error-hydrate-throws-ssr',
    id: 'codec-error-hydrate-throws-ssr',
    label: 'Codec error: hydrate throws (ssr: true)',
  },
  {
    to: '/codec-error-dehydrate-redirect',
    id: 'codec-error-dehydrate-redirect',
    label: 'Codec error: redirect from dehydrate',
  },
  {
    to: '/in-place-beforeload',
    id: 'in-place-beforeload',
    label: 'In-place beforeLoad',
  },
  { to: '/in-place-loader', id: 'in-place-loader', label: 'In-place loader' },
  {
    to: '/in-place-redirect/child',
    id: 'in-place-redirect-child',
    label: 'In-place redirect (child)',
  },
  {
    to: '/stripping-marker',
    id: 'stripping-marker',
    label: 'Stripping marker',
  },
]

function RouterStatus() {
  const { isLoading, status } = useRouterState({
    select: (state) => ({ isLoading: state.isLoading, status: state.status }),
    structuralSharing: true,
  })
  return (
    <div>
      <div data-testid="hydrated">hydrated</div>
      <div>
        router isLoading:{' '}
        <b data-testid="router-isLoading">{isLoading ? 'true' : 'false'}</b>
      </div>
      <div>
        router status: <b data-testid="router-status">{status}</b>
      </div>
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
          {links.map((link) => (
            <Link
              key={link.id}
              to={link.to as any}
              params={link.params as any}
              data-testid={`link-${link.id}`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <hr />
        <ClientOnly>
          <RouterStatus />
        </ClientOnly>
        <hr />
        {children}
        <TanStackRouterDevtools position="bottom-right" />
        <Scripts />
      </body>
    </html>
  )
}
