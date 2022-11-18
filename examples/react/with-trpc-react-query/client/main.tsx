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

const rootRoute = createRouteConfig()

const indexRoute = rootRoute.createRoute({
  path: '/',
  component: Index,
})

const postsRoute = rootRoute.createRoute({
  path: 'posts',
  loaderMaxAge: 0,
  component: Posts,
  errorComponent: () => 'Oh crap!',
  loader: async () => {
    queryClient.getQueryData(['posts']) ??
      (await queryClient.prefetchQuery(['posts'], fetchPosts))
    return {}
  },
})

const postsIndexRoute = postsRoute.createRoute({
  path: '/',
  component: PostsIndex,
})

const postRoute = postsRoute.createRoute({
  path: ':postId',
  component: Post,
  loader: async ({ params: { postId } }) => {
    queryClient.getQueryData(['posts', postId]) ??
      (await queryClient.prefetchQuery(['posts', postId], () =>
        fetchPostById(postId),
      ))
    return {}
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
function App() {
  const [trpcClient] = useState(() =>
    trpc.createClient({
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
    }),
  )

  return (
    // Build our routes and render our router
    <>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router}>
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
          </RouterProvider>
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

function Index() {
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
}

function Posts() {
  const { Link } = useMatch(postsRoute.id)

  const hello = trpc.hello
  ;({ text: 'client' })

  const postsQuery = usePosts()

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
                to="/posts/:postId"
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
}

function PostsIndex() {
  return (
    <>
      <div>Select a post.</div>
    </>
  )
}

function Post() {
  const { params } = useMatch(postRoute.id)
  const postQuery = usePost(params.postId)

  return (
    <div>
      <h4>{postQuery.data?.title}</h4>
      <p>{postQuery.data?.body}</p>
    </div>
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
