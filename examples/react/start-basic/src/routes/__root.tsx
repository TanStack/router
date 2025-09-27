/// <reference types="vite/client" />
import {
  HeadContent,
  Link,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import * as React from 'react'
import { DefaultCatchBoundary } from '~/components/DefaultCatchBoundary'
import { NotFound } from '~/components/NotFound'
import { Test, startInstance } from '~/start'
import appCss from '~/styles/app.css?url'
import { seo } from '~/utils/seo'

export const testServerMw = startInstance
  .createMiddleware()
  .server(({ next, context }) => {
    context.fromFetch
    //      ^?
    context.fromServerMw
    //      ^?

    return next({
      context: {
        fromIndexServerMw: true,
      },
    })
  })

export const testFnMw = startInstance
  .createMiddleware({ type: 'function' })
  .middleware([testServerMw])
  .server(({ next, context }) => {
    context.fromFetch
    //      ^?
    context.fromServerMw
    //      ^?
    context.fromFnMw
    //      ^?
    context.fromIndexServerMw
    //      ^?

    return next({
      context: {
        fromIndexFnMw: true,
      },
    })
  })

export const testGetMiddleware = startInstance
  .createMiddleware()
  .server(({ next, context }) => {
    return next({
      context: {
        fromGetMiddleware: true,
      },
    })
  })

export const Route = createRootRoute({
  server: {
    middleware: [testServerMw],
    handlers: {
      GET: ({ context, next }) => {
        context.fromFetch
        //      ^?
        context.fromServerMw
        //      ^?
        context.fromIndexServerMw
        //      ^?
        return next({
          context: {
            fromGet: true,
          },
        })
      },
      POST: ({ context, next }) => {
        context.fromFetch
        context.fromServerMw
        context.fromIndexServerMw
        return next({
          context: {
            fromPost: true,
          },
        })
      },
    },
    // handlers: ({ createHandlers }) =>
    //   createHandlers({
    //     GET: {
    //       middleware: [testGetMiddleware],
    //       handler: ({ context, next }) => {
    //         context.fromFetch
    //         //      ^?
    //         context.fromServerMw
    //         //      ^?
    //         context.fromIndexServerMw
    //         //      ^?
    //         context.fromGetMiddleware
    //         //      ^?
    //         return next({
    //           context: {
    //             fromGet: true,
    //             fromPost: false,
    //           },
    //         })
    //       },
    //     },
    //     POST: {
    //       handler: ({ next }) => {
    //         return next({
    //           context: {
    //             fromGet: false,
    //             fromPost: true,
    //           },
    //         })
    //       },
    //     },
    //   }),
    test: (test) => {},
  },
  beforeLoad: ({ serverContext }) => {
    serverContext?.fromFetch
    //             ^?
    serverContext?.fromServerMw
    //             ^?
    serverContext?.fromIndexServerMw
    //             ^?
    serverContext?.fromGet
    //             ^?
    return serverContext
  },
  // ssr: false,
  loader: ({ context }) => {
    context?.fromFetch
    //             ^?
    context?.fromServerMw
    //             ^?
    context?.fromIndexServerMw
    //             ^?
    context?.fromPost
    //             ^?
    return new Test('test')
  },
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
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
    scripts: [
      {
        src: '/customScript.js',
        type: 'text/javascript',
      },
    ],
  }),
  errorComponent: DefaultCatchBoundary,
  notFoundComponent: () => <NotFound />,
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <head>
        <HeadContent />
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
          </Link>{' '}
          <Link
            to="/users"
            activeProps={{
              className: 'font-bold',
            }}
          >
            Users
          </Link>{' '}
          <Link
            to="/route-a"
            activeProps={{
              className: 'font-bold',
            }}
          >
            Pathless Layout
          </Link>{' '}
          <Link
            to="/deferred"
            activeProps={{
              className: 'font-bold',
            }}
          >
            Deferred
          </Link>{' '}
          <Link
            // @ts-expect-error
            to="/this-route-does-not-exist"
            activeProps={{
              className: 'font-bold',
            }}
          >
            This Route Does Not Exist
          </Link>
        </div>
        <hr />
        {children}
        <TanStackRouterDevtools position="bottom-right" />
        <Scripts />
      </body>
    </html>
  )
}
