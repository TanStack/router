import React, { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import {
  Outlet,
  RouterProvider,
  createReactRouter,
  createRouteConfig,
  Link,
  useMatch,
  useParams,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
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

const rootRoute = createRouteConfig({
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

const indexRoute = rootRoute.createRoute({
  path: '/',
  component: () => {
    return (
      <div className="p-2">
        <h3>Welcome Home!</h3>
      </div>
    )
  },
})

const postsRoute = rootRoute.createRoute({
  path: 'posts',
  loader: async () => {
    queryClient.getQueryData(['posts']) ??
      (await queryClient.prefetchQuery(['posts'], fetchPosts))
    return {}
  },
  component: () => {
    const postsQuery = usePosts()

    return (
      <div className="p-2 flex gap-2">
        <ul className="list-disc pl-4">
          {postsQuery.data?.map((post) => {
            return (
              <li key={post.id} className="whitespace-nowrap">
                <Link
                  to={postRoute.id}
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
    queryClient.getQueryData(['posts', postId]) ??
      (await queryClient.prefetchQuery(['posts', postId], () =>
        fetchPostById(postId),
      ))
    return {}
  },
  component: () => {
    const { postId } = useParams({ from: postRoute.id })
    const postQuery = usePost(postId)

    return (
      <div className="space-y-2">
        <h4 className="text-xl font-bold underline">{postQuery.data?.title}</h4>
        <div className="text-sm">{postQuery.data?.body}</div>
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

const queryClient = new QueryClient()

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

function usePosts() {
  return useQuery(['posts'], fetchPosts)
}

function usePost(postId: string) {
  return useQuery(['posts', postId], () => fetchPostById(postId), {
    enabled: !!postId,
  })
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
