import React from 'react'
import ReactDOM from 'react-dom/client'
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { httpBatchLink } from '@trpc/client'
import { createTRPCQueryUtils, createTRPCReact } from '@trpc/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import type { AppRouter } from '../server/server'

const queryClient = new QueryClient()

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

const trpcQueryUtils = createTRPCQueryUtils({ queryClient, client: trpcClient })

export function Spinner() {
  return (
    <div className="animate-spin px-3 text-2xl inline-flex items-center justify-center">
      ⍥
    </div>
  )
}

const rootRoute = createRootRouteWithContext<{
  trpc: typeof trpc
  trpcQueryUtils: ReturnType<typeof createTRPCQueryUtils<AppRouter>>
  queryClient: typeof queryClient
}>()({
  component: () => {
    return (
      <>
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
        <TanStackRouterDevtools position="bottom-left" />
      </>
    )
  },
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  loader: async ({ context: { trpcQueryUtils } }) => {
    await trpcQueryUtils.hello.ensureData()
  },
  pendingComponent: Spinner,
  component: () => {
    const helloQuery = trpc.hello.useQuery()
    return <div className="p-2 text-xl">{helloQuery.data}</div>
  },
})

const postsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'posts',
  errorComponent: () => 'Oh crap!',
  loader: async ({ context: { trpcQueryUtils } }) => {
    await trpcQueryUtils.posts.ensureData()
    return
  },
  pendingComponent: Spinner,
  component: () => {
    const postsQuery = trpc.posts.useQuery()

    const posts = postsQuery.data || []

    return (
      <div className="p-2 flex gap-2">
        <ul className="list-disc pl-4">
          {posts.map((post) => {
            return (
              <li key={post.id} className="whitespace-nowrap">
                <Link
                  to={postRoute.fullPath}
                  params={{
                    postId: post.id,
                  }}
                  className="block py-1 text-blue-800 hover:text-blue-600"
                  activeProps={{ className: 'text-black font-bold' }}
                >
                  <div>{post.title.substring(0, 20)}</div>
                </Link>
              </li>
            )
          })}
        </ul>
        <hr />
        <Outlet />
      </div>
    )
  },
})

const postsIndexRoute = createRoute({
  getParentRoute: () => postsRoute,
  path: '/',
  component: () => {
    return (
      <>
        <div>Select a post.</div>
      </>
    )
  },
})

const postRoute = createRoute({
  getParentRoute: () => postsRoute,
  path: '$postId',
  loader: async ({ context: { trpcQueryUtils }, params: { postId } }) => {
    await trpcQueryUtils.post.ensureData(postId)
  },
  pendingComponent: Spinner,
  component: () => {
    const postId = postRoute.useParams({ select: (d) => d.postId })
    const postQuery = trpc.post.useQuery(postId)

    return (
      <div className="space-y-2">
        <h4 className="text-xl font-bold underline">{postQuery.data?.title}</h4>
      </div>
    )
  },
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  postsRoute.addChildren([postsIndexRoute, postRoute]),
])

// Set up a Router instance
const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  context: {
    trpc,
    trpcQueryUtils,
    queryClient,
  },
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

function App() {
  return (
    // Build our routes and render our router
    <>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
          <ReactQueryDevtools
            initialIsOpen
            position="bottom"
            buttonPosition="bottom-right"
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
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}
