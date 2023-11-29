import React from 'react'
import ReactDOM from 'react-dom/client'
import {
  Outlet,
  RouterProvider,
  Link,
  Route,
  ErrorComponent,
  Router,
  RootRoute,
  Await,
  defer,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import axios from 'axios'

type PostType = {
  id: string
  title: string
  body: string
}

type CommentType = {
  id: string
  postId: string
  name: string
  email: string
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

  const commentsPromise = new Promise((r) => setTimeout(r, 1500))
    .then(() =>
      axios.get<CommentType[]>(
        `https://jsonplaceholder.typicode.com/comments?postId=${postId}`,
      ),
    )
    .then((r) => r.data)

  const post = await axios
    .get<PostType>(`https://jsonplaceholder.typicode.com/posts/${postId}`)
    .then((r) => r.data)

  if (!post) {
    throw new NotFoundError(`Post with id "${postId}" not found!`)
  }

  return {
    post,
    commentsPromise: defer(commentsPromise),
  }
}

const rootRoute = new RootRoute({
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
        {/* Start rendering router matches */}
        <TanStackRouterDevtools position="bottom-right" />
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
  key: false,
  loader: fetchPosts,
  component: ({ useLoaderData }) => {
    const posts = useLoaderData()

    return (
      <div className="p-2 flex gap-2">
        <ul className="list-disc pl-4">
          {[
            ...posts,
            { id: 'i-do-not-exist', title: 'Non-existent Post' },
          ]?.map((post) => {
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
})

const postsIndexRoute = new Route({
  getParentRoute: () => postsRoute,
  path: '/',
  component: () => <div>Select a post.</div>,
})

class NotFoundError extends Error {}

const postRoute = new Route({
  getParentRoute: () => postsRoute,
  path: '$postId',
  key: false,
  loader: async ({ params: { postId } }) => fetchPost(postId),
  errorComponent: ({ error }) => {
    if (error instanceof NotFoundError) {
      return <div>{error.message}</div>
    }

    return <ErrorComponent error={error} />
  },
  component: ({ useLoaderData }) => {
    const { post, commentsPromise } = useLoaderData()

    return (
      <div className="space-y-2">
        <h4 className="text-xl font-bold underline">{post.title}</h4>
        <div className="text-sm">{post.body}</div>
        <React.Suspense fallback={<div>Loading comments...</div>}>
          <Await promise={commentsPromise}>
            {(comments) => {
              return (
                <div className="space-y-2">
                  <h5 className="text-lg font-bold underline">Comments</h5>
                  {comments?.map((comment) => {
                    return (
                      <div key={comment.id}>
                        <h6 className="text-md font-bold">{comment.name}</h6>
                        <div className="text-sm italic opacity-50">
                          {comment.email}
                        </div>
                        <div className="text-sm">{comment.body}</div>
                      </div>
                    )
                  })}
                </div>
              )
            }}
          </Await>
        </React.Suspense>
      </div>
    )
  },
})

const routeTree = rootRoute.addChildren([
  postsRoute.addChildren([postRoute, postsIndexRoute]),
  indexRoute,
])

// Set up a Router instance
const router = new Router({
  routeTree,
  defaultPreload: 'intent',
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
