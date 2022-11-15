import React, { StrictMode, useState } from 'react'
import ReactDOM from 'react-dom/client'
import {
  Outlet,
  RouterProvider,
  createReactRouter,
  createRouteConfig,
} from '@tanstack/react-router'
import { AppRouter } from '../server/server'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import {
  useQuery,
  useQueryClient,
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

const routeConfig = createRouteConfig().createChildren((createRoute) => [
  createRoute({
    path: '/',
    component: Index,
  }),
  createRoute({
    path: 'posts',
    loaderMaxAge: 0,
    component: Posts,
    errorElement: 'Oh crap!',
    loader: async () => {
      queryClient.getQueryData(['posts']) ??
        (await queryClient.prefetchQuery(['posts'], fetchPosts))
      return {}
    },
  }).createChildren((createRoute) => [
    createRoute({ path: '/', component: PostsIndex }),
    createRoute({
      path: ':postId',
      component: Post,
      loader: async ({ params: { postId } }) => {
        queryClient.getQueryData(['posts', postId]) ??
          (await queryClient.prefetchQuery(['posts', postId], () =>
            fetchPostById(postId),
          ))
        return {}
      },
    }),
  ]),
])

// Set up a ReactRouter instance
const router = createReactRouter({
  routeConfig,
  defaultPreload: 'intent',
})

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
              <router.Link
                to="/"
                activeProps={{
                  className: 'font-bold',
                }}
                activeOptions={{ exact: true }}
              >
                Home
              </router.Link>{' '}
              <router.Link
                to="/posts"
                activeProps={{
                  className: 'font-bold',
                }}
              >
                Posts
              </router.Link>
            </div>
            <hr />
            <Outlet /> {/* Start rendering router matches */}
          </RouterProvider>
          <TanStackRouterDevtools router={router} position="bottom-right" />
          <ReactQueryDevtools initialIsOpen position="bottom-right" />
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
  const { Link } = router.useMatch('/posts')

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
  const { params } = router.useMatch('/posts/:postId')
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
