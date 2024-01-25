import React from 'react'
import ReactDOM from 'react-dom/client'
import {
  Outlet,
  RouterProvider,
  Link,
  ErrorComponent,
  createRouter,
  NotFoundRoute,
  SearchSchemaInput,
  ErrorComponentProps,
  createRoute,
  createRootRoute,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import axios from 'axios'
import { z } from 'zod'

type PostType = {
  id: number
  title: string
  body: string
}

const fetchPosts = async () => {
  console.log('Fetching posts...')
  await new Promise((r) => setTimeout(r, 300))
  return axios
    .get<PostType[]>('https://jsonplaceholder.typicode.com/posts')
    .then((r) => r.data.slice(0, 10))
}

const fetchPost = async (postId: number) => {
  console.log(`Fetching post with id ${postId}...`)
  await new Promise((r) => setTimeout(r, 300))
  const post = await axios
    .get<PostType>(`https://jsonplaceholder.typicode.com/posts/${postId}`)
    .catch((err) => {
      if (err.response.status === 404) {
        throw new NotFoundError(`Post with id "${postId}" not found!`)
      }
      throw err
    })
    .then((r) => r.data)

  return post
}

const rootRoute = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
    <div className="bg-gradient-to-r from-green-700 to-lime-600 text-white">
      <div className="p-2 flex gap-2 text-lg bg-black/40 shadow-xl">
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
      <Outlet />
      <TanStackRouterDevtools position="bottom-right" />
    </div>
  )
}
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: IndexComponent,
})

function IndexComponent() {
  return (
    <div className="p-2">
      <h3>Welcome Home!</h3>
    </div>
  )
}

const postsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'posts',
  loader: () => fetchPosts(),
  component: PostsComponent,
})

function PostsComponent() {
  const posts = postsRoute.useLoaderData()

  return (
    <div className="p-2 flex gap-2">
      <div className="list-disc bg-gray-800/70 rounded-lg divide-y divide-green-500/30">
        {posts.map((post, index) => {
          return (
            <div key={post.id} className="whitespace-nowrap">
              <Link
                to={postRoute.to}
                search={{
                  postId: post.id,
                  color: index % 2 ? 'red' : undefined,
                }}
                className="block py-1 px-2 text-green-300 hover:text-green-200"
                activeProps={{ className: '!text-white font-bold' }}
              >
                <div>{post.title.substring(0, 20)}</div>
              </Link>
            </div>
          )
        })}
      </div>
      <Outlet />
    </div>
  )
}

const postsIndexRoute = createRoute({
  getParentRoute: () => postsRoute,
  path: '/',
  component: PostsIndexComponent,
})

function PostsIndexComponent() {
  return <div>Select a post.</div>
}

class NotFoundError extends Error {}

const postRoute = createRoute({
  getParentRoute: () => postsRoute,
  path: 'post',
  validateSearch: (
    input: {
      postId: number
      color?: 'white' | 'red' | 'green'
    } & SearchSchemaInput,
  ) =>
    z
      .object({
        postId: z.number().catch(1),
        color: z.enum(['white', 'red', 'green']).catch('white'),
      })
      .parse(input),
  loaderDeps: ({ search: { postId } }) => ({
    postId,
  }),
  errorComponent: PostErrorComponent,
  loader: ({ deps: { postId } }) => fetchPost(postId),
  component: PostComponent,
})

function PostErrorComponent({ error }: ErrorComponentProps) {
  if (error instanceof NotFoundError) {
    return <div>{error.message}</div>
  }

  return <ErrorComponent error={error} />
}

function PostComponent() {
  const post = postRoute.useLoaderData()
  const { color } = postRoute.useSearch()
  return (
    <div className="space-y-2">
      <h4 className="text-xl font-bold">{post.title}</h4>
      <hr className="opacity-20" />
      <div className={`text-sm  text-${color}-300`}>{post.body}</div>
    </div>
  )
}

const notFoundRoute = new NotFoundRoute({
  getParentRoute: () => rootRoute,
  component: NotFound,
})

function NotFound() {
  return (
    <div className="p-2">
      <h3>404 - Not Found</h3>
    </div>
  )
}

const routeTree = rootRoute.addChildren([
  postsRoute.addChildren([postRoute, postsIndexRoute]),
  indexRoute,
])

// Set up a Router instance
const router = createRouter({
  routeTree,
  notFoundRoute,
  defaultPreload: 'intent',
  defaultStaleTime: 5000,
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

  root.render(<RouterProvider router={router} />)
}
