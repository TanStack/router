import React, { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import {
  Outlet,
  RouterProvider,
  Router,
  Route,
  Link,
  useParams,
  RootRoute,
  RouterContext,
} from '@tanstack/router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import {
  useQuery,
  useQueryClient,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

import axios from 'axios'

type PostType = {
  id: string
  title: string
  body: string
}

const queryClient = new QueryClient()

const routerContext = new RouterContext<{
  queryClient: typeof queryClient
}>()

const rootRoute = routerContext.createRootRoute({
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

const indexRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => {
    return (
      <div className="p-2">
        <h3>Welcome Home!</h3>
      </div>
    )
  },
})

const postsRoute = new Route({
  getParentRoute: () => rootRoute,
  path: 'posts',
  loader: async ({ context: { queryClient } }) => {
    await queryClient.ensureQueryData({
      queryKey: ['posts'],
      queryFn: fetchPosts,
    })
    return () => useQuery(['posts'], fetchPosts)
  },
  component: ({ useLoader }) => {
    const postsQuery = useLoader()()

    return (
      <div className="p-2 flex gap-2">
        <ul className="list-disc pl-4">
          {postsQuery.data?.map((post) => {
            return (
              <li key={post.id} className="whitespace-nowrap">
                <Link
                  to={postRoute.to}
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
  errorComponent: () => 'Oh crap!',
})

const postsIndexRoute = new Route({
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

const postRoute = new Route({
  getParentRoute: () => postsRoute,
  path: '$postId',
  loader: async ({ params: { postId }, context: { queryClient } }) => {
    await queryClient.ensureQueryData(['posts', postId], () =>
      fetchPostById(postId),
    )

    return () =>
      useQuery(['posts', postId], () => fetchPostById(postId), {
        enabled: !!postId,
      })
  },
  component: ({ useLoader }) => {
    const postQuery = useLoader()()

    return (
      <div className="space-y-2">
        <h4 className="text-xl font-bold underline">{postQuery.data?.title}</h4>
        <div className="text-sm">{postQuery.data?.body}</div>
      </div>
    )
  },
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  postsRoute.addChildren([postsIndexRoute, postRoute]),
])

// Set up a Router instance
const router = new Router({
  routeTree,
  defaultPreload: 'intent',
  context: {
    queryClient,
  },
})

declare module '@tanstack/router' {
  interface Register {
    router: typeof router
  }
}

function App() {
  return (
    // Build our routes and render our router
    <>
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
    </>
  )
}

async function fetchPosts() {
  console.log('Fetching posts...')
  await new Promise((r) => setTimeout(r, 500))
  return axios
    .get<PostType[]>('https://jsonplaceholder.typicode.com/posts')
    .then((r) => r.data.slice(0, 10))
}

async function fetchPostById(postId: string) {
  console.log(`Fetching post with id ${postId}...`)
  await new Promise((r) => setTimeout(r, 500))

  return await axios
    .get<PostType>(`https://jsonplaceholder.typicode.com/posts/${postId}`)
    .then((r) => r.data)
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
