import React from 'react'
import ReactDOM from 'react-dom/client'
import {
  Outlet,
  RouterProvider,
  Link,
  ErrorComponent,
  createRouter,
  rootRouteWithContext,
  ErrorComponentProps,
  createRoute,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import {
  QueryClient,
  QueryClientProvider,
  queryOptions,
  useSuspenseQuery,
} from '@tanstack/react-query'
import axios from 'axios'

type PostType = {
  id: string
  title: string
  body: string
}

const fetchPosts = async () => {
  console.log('Fetching posts...')
  await new Promise((r) => setTimeout(r, 500))
  return axios
    .get<PostType[]>('https://jsonplaceholder.typicode.com/posts')
    .then((r) => r.data.slice(0, 10))
}

const fetchPost = async (postId: string) => {
  console.log(`Fetching post with id ${postId}...`)
  await new Promise((r) => setTimeout(r, 500))
  const post = await axios
    .get<PostType>(`https://jsonplaceholder.typicode.com/posts/${postId}`)
    .then((r) => r.data)

  if (!post) {
    throw new NotFoundError(`Post with id "${postId}" not found!`)
  }

  return post
}

const rootRoute = rootRouteWithContext<{
  queryClient: QueryClient
}>()({
  component: RootComponent,
})

function RootComponent() {
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
          to={'/posts'}
          activeProps={{
            className: 'font-bold',
          }}
        >
          Posts
        </Link>
      </div>
      <hr />
      <Outlet />
      <ReactQueryDevtools buttonPosition="top-right" />
      <TanStackRouterDevtools position="bottom-right" />
    </>
  )
}

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: IndexRouteComponent,
})

function IndexRouteComponent() {
  return (
    <div className="p-2">
      <h3>Welcome Home!</h3>
    </div>
  )
}

const postsQueryOptions = queryOptions({
  queryKey: ['posts'],
  queryFn: () => fetchPosts(),
})

const postsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'posts',
  loader: ({ context: { queryClient } }) =>
    queryClient.ensureQueryData(postsQueryOptions),
  component: PostsRouteComponent,
})

function PostsRouteComponent() {
  const postsQuery = useSuspenseQuery(postsQueryOptions)

  const posts = postsQuery.data

  return (
    <div className="p-2 flex gap-2">
      <ul className="list-disc pl-4">
        {[...posts, { id: 'i-do-not-exist', title: 'Non-existent Post' }]?.map(
          (post) => {
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
          },
        )}
      </ul>
      <hr />
      <Outlet />
    </div>
  )
}

const postsIndexRoute = createRoute({
  getParentRoute: () => postsRoute,
  path: '/',
  component: PostsIndexRouteComponent,
})

function PostsIndexRouteComponent() {
  return <div>Select a post.</div>
}

class NotFoundError extends Error {}

const postQueryOptions = (postId: string) =>
  queryOptions({
    queryKey: ['posts', { postId }],
    queryFn: () => fetchPost(postId),
  })

const postRoute = createRoute({
  getParentRoute: () => postsRoute,
  path: '$postId',
  errorComponent: PostErrorComponent,
  loader: ({ context: { queryClient }, params: { postId } }) =>
    queryClient.ensureQueryData(postQueryOptions(postId)),
  component: PostRouteComponent,
})

function PostErrorComponent({ error }: ErrorComponentProps) {
  if (error instanceof NotFoundError) {
    return <div>{error.message}</div>
  }

  return <ErrorComponent error={error} />
}

function PostRouteComponent() {
  const { postId } = postRoute.useParams()
  const postQuery = useSuspenseQuery(postQueryOptions(postId))
  const post = postQuery.data

  return (
    <div className="space-y-2">
      <h4 className="text-xl font-bold underline">{post.title}</h4>
      <div className="text-sm">{post.body}</div>
    </div>
  )
}

const routeTree = rootRoute.addChildren([
  postsRoute.addChildren([postRoute, postsIndexRoute]),
  indexRoute,
])

const queryClient = new QueryClient()

// Set up a Router instance
const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  // Since we're using React Query, we don't want loader calls to ever be stale
  // This will ensure that the loader is always called when the route is preloaded or visited
  defaultPreloadStaleTime: 0,
  context: {
    queryClient,
  },
})

// Register things for typesafety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const rootElement = document.getElementById('app')!

if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)

  root.render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}
