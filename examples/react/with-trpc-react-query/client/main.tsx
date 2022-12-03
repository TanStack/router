import React, { StrictMode, useState } from 'react'
import ReactDOM from 'react-dom/client'
import {
  Outlet,
  RouterProvider,
  createReactRouter,
  createRouteConfig,
  Link,
  useMatch,
} from '@tanstack/react-router'
import { AppRouter } from '../server/server'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import {
  useQuery,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { httpBatchLink } from '@trpc/client'
import { createTRPCReact } from '@trpc/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

import axios from 'axios'

type PostType = {
  id: string
  title: string
  body: string
}

const queryClient = new QueryClient()

const rootRoute = createRouteConfig({
  component: () => {
    return (
      <>
        <div>
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
        <TanStackRouterDevtools position="bottom-left" />
      </>
    )
  },
})

const indexRoute = rootRoute.createRoute({
  path: '/',
  component: () => {
    const hello = trpc.hello.useQuery()
    const posts = trpc.posts.useQuery()
    if (!hello.data || !posts.data) return <p>{'Loading...'}</p>
    return (
      <div className="p-5">
        <h1 className="text-xl pb-2">{hello.data}</h1>
        <ul className="list-disc list-inside">
          {posts.data.map((post) => (
            <li key={post.id}>{post.title}</li>
          ))}
        </ul>
      </div>
    )
  },
})

const postsRoute = rootRoute.createRoute({
  path: 'posts',
  loaderMaxAge: 0,
  errorComponent: () => 'Oh crap!',
  loader: async () => {
    // TODO: Prefetch posts using TRPC
    return {}
  },
  component: () => {
    const { Link } = useMatch(postsRoute.id)

    // TODO: fetch postsQuery using the tPRC client

    return (
      <div>
        <div
          style={{
            float: 'left',
            marginRight: '1rem',
          }}
        >
          {postsQuery.data?.map((post) => {
            return (
              <div key={post.id}>
                <Link
                  to="/posts/$postId"
                  params={{
                    postId: post.id,
                  }}
                  activeProps={{ className: 'font-bold' }}
                >
                  <pre>{post.title.substring(0, 20)}</pre>
                </Link>
              </div>
            )
          })}
        </div>
        <hr />
        <Outlet />
      </div>
    )
  },
})

const postsIndexRoute = postsRoute.createRoute({
  path: '/',
  component: () => {
    return (
      <>
        <div>Select a post.</div>
      </>
    )
  },
})

const postRoute = postsRoute.createRoute({
  path: '$postId',
  loader: async ({ params: { postId } }) => {
    // TODO: Prefetch post using TRPC
    return {}
  },
  component: () => {
    const { params } = useMatch(postRoute.id)

    // TODO: fetch postQuery using the tPRC client

    return (
      <div>
        <h4>{postQuery.data?.title}</h4>
        <p>{postQuery.data?.body}</p>
      </div>
    )
  },
})

const routeConfig = rootRoute.addChildren([
  indexRoute,
  postsRoute.addChildren([postsIndexRoute, postRoute]),
])

// Set up a ReactRouter instance
const router = createReactRouter({
  routeConfig,
  defaultPreload: 'intent',
})

declare module '@tanstack/react-router' {
  interface RegisterRouter {
    router: typeof router
  }
}

export const trpc = createTRPCReact<AppRouter>({})

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: 'http://localhost:4000',
      // optional
      headers() {
        return {
          // authorization: getAuthCookie(),
        }
      },
    }),
  ],
})

function App() {
  return (
    // Build our routes and render our router
    <>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
          <ReactQueryDevtools
            initialIsOpen
            position="bottom-left"
            toggleButtonProps={{
              style: {
                marginLeft: '5.5rem',
                transform: `scale(.7)`,
                transformOrigin: 'bottom left',
              },
            }}
          />
        </QueryClientProvider>
      </trpc.Provider>
    </>
  )
}

const rootElement = document.getElementById('app')!
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
